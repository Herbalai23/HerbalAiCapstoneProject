import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

const providers = vi.hoisted(() => ({ ask: vi.fn(), stream: vi.fn() }));
vi.mock('../src/services/chat.service.js', () => ({ askDrAi: providers.ask, streamDrAi: providers.stream }));
vi.mock('express-rate-limit', () => ({ default: () => (_req: unknown, _res: unknown, next: () => void) => next() }));

import app from '../src/app.js';
import { ENV } from '../src/config/env.js';
import { prisma, closeDatabasePool } from '../src/lib/prisma.js';
import { generateAccessToken } from '../src/utils/jwt.js';
import { AiResponseError } from '../src/services/ai/core/response-completion.js';
import { adminEditDatabaseBoundary } from './helpers/admin-edit-database-boundary.js';

const enabled = adminEditDatabaseBoundary(process.env.HERBALAI_TEST_DATABASE_URL, ENV.DATABASE_URL, Boolean(process.env.CI));
const ownerId = randomUUID();
const otherId = randomUUID();
const adminId = randomUUID();
const ids = [ownerId, otherId, adminId];
const access = (userId: string, role = 'contributor') => generateAccessToken({ userId, role, sessionVersion: 0 });
const authorization = (userId: string, role = 'contributor') => 'Bearer ' + access(userId, role);
const createAiAccount = async () => {
  const id = randomUUID();
  ids.push(id);
  await prisma.user.create({ data: {
    id, username: 'test_recent_' + id, email: id + '@example.invalid', password: 'TEST-only-placeholder',
    name: 'Testa Usera', localPasswordSet: true, emailVerified: new Date(),
  } });
  return id;
};
const chat = (userId: string, path: string, key = randomUUID()) => request(app).post('/api/chat' + path)
  .set('Authorization', authorization(userId)).set('X-Idempotency-Key', key)
  .send({ message: 'TEST ONLY educational herb question.', history: [] });

describe.skipIf(!enabled)('Recently repaired HTTP APIs with real PostgreSQL, intercepted AI, and no outgoing mail', () => {
  beforeAll(async () => {
    await prisma.user.createMany({ data: [
      { id: ownerId, localPasswordSet: null, role: 'contributor' as const },
      { id: otherId, localPasswordSet: false, role: 'contributor' as const },
      { id: adminId, localPasswordSet: true, role: 'admin' as const },
    ].map(account => ({
      ...account, username: 'test_recent_' + account.id, email: account.id + '@example.invalid',
      password: 'TEST-only-placeholder', name: 'Testa Usera', emailVerified: new Date(),
    })) });
    await prisma.suggestedHerb.createMany({ data: [
      { submitterId: ownerId, status: 'Pending' as const, reviewedAt: null },
      { submitterId: ownerId, status: 'Rejected' as const, reviewedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
      { submitterId: otherId, status: 'Rejected' as const, reviewedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    ].map((record, index) => ({
      ...record, localName: 'TEST ONLY never publish ' + ownerId + index, scientificName: 'Testus nonmedicinalis',
      category: 'TEST ONLY', medicinalUses: 'None', preparationMethod: 'None', dosage: 'None',
      reviewNotes: 'TEST ONLY retain review history',
    })) });
  });
  beforeEach(() => {
    vi.clearAllMocks();
    providers.ask.mockReset();
    providers.stream.mockReset();
    vi.stubEnv('DR_AI_CREDITS_MODE', 'test');
    vi.stubEnv('DR_AI_TRIAL_CREDITS', '1');
    vi.stubEnv('DR_AI_CREDIT_PACKAGES', '[]');
    vi.stubEnv('PAYMONGO_TEST_SECRET_KEY', '');
    vi.stubEnv('PAYMONGO_TEST_WEBHOOK_SECRET', '');
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    try {
      const where = { userId: { in: ids } };
      await prisma.creditLedger.deleteMany({ where });
      await prisma.creditRequest.deleteMany({ where });
      await prisma.creditWallet.deleteMany({ where });
      await prisma.suggestedHerb.deleteMany({ where: { submitterId: { in: ids } } });
      await prisma.token.deleteMany({ where });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    } finally { await closeDatabasePool(); }
  });

  it.each([
    [ownerId, 'contributor', null, 'unknown'],
    [otherId, 'contributor', false, 'unset'],
    [adminId, 'admin', true, 'set'],
  ] as const)('returns authoritative capability through authenticated GET/PATCH /me (%s)', async (id, role, capability, passwordStatus) => {
    const session = await request(app).get('/api/auth/me').set('Authorization', authorization(id, role));
    const updated = await request(app).patch('/api/auth/me').set('Authorization', authorization(id, role)).send({ name: 'Testa Updated' });
    for (const response of [session, updated]) {
      expect(response.status).toBe(200);
      expect(response.body.data.user).toMatchObject({ id, hasLocalPassword: capability, passwordStatus });
      expect(response.body.data.user).not.toHaveProperty('password');
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).localPasswordSet).toBe(capability);
  });

  it('keeps 24-hour history readable, counts owner records, and denies cross-owner scope', async () => {
    const list = (view: string, userId = ownerId, role = 'contributor', scope = 'mine') => request(app)
      .get('/api/suggest').query({ view, scope }).set('Authorization', authorization(userId, role));
    const active = await list('active');
    const history = await list('history');
    const all = await list('all');
    for (const response of [active, history, all]) {
      expect(response.status).toBe(200);
      expect(response.body.data.counts).toEqual({ active: 1, history: 1, all: 2 });
      expect(response.body.data.suggestions.every((record: { submitterId: string }) => record.submitterId === ownerId)).toBe(true);
    }
    expect(active.body.data.suggestions).toHaveLength(1);
    expect(history.body.data.suggestions[0]).toMatchObject({ status: 'Rejected', reviewNotes: 'TEST ONLY retain review history' });
    expect(history.body.data.suggestions[0].historyEligibleAt).toEqual(expect.any(String));
    expect((await list('all', ownerId, 'contributor', 'all')).status).toBe(403);
    expect((await list('all', adminId, 'admin')).body.data.total).toBe(0);
    const administrative = await list('all', adminId, 'admin', 'all');
    expect(administrative.status).toBe(200);
    expect(administrative.body.data.total).toBeGreaterThanOrEqual(3);
    expect(await prisma.suggestedHerb.count({ where: { submitterId: ownerId } })).toBe(2);
  });

  it('rejects anonymous and malformed paginated requests without exposing records', async () => {
    expect((await request(app).get('/api/suggest').query({ view: 'history' })).status).toBe(401);
    for (const query of [{ view: 'invalid' }, { view: 'all', page: '0' }, { view: 'all', limit: '51' }, { view: 'all', scope: 'other' }]) {
      const response = await request(app).get('/api/suggest').query(query).set('Authorization', authorization(ownerId));
      expect(response.status).toBe(400);
      expect(response.body).not.toHaveProperty('data');
    }
  });

  it.each([
    ['', false], ['', true], ['/stream', false], ['/stream', true],
  ] as const)('refunds rejected completion in the real ledger and never persists a billable success (%s, blocked=%s)', async (path, blocked) => {
    const userId = await createAiAccount();
    const key = randomUUID();
    providers.ask.mockRejectedValueOnce(new AiResponseError(blocked));
    providers.stream.mockRejectedValueOnce(new AiResponseError(blocked));
    const response = await chat(userId, path, key);
    if (path) {
      expect(response.status).toBe(200);
      expect(response.text).toContain('event: error');
      expect(response.text).not.toContain('event: done');
      expect(response.text).toContain('"creditStatus":"released"');
    } else {
      expect(response.status).toBe(503);
      expect(response.body.creditStatus).toBe('released');
    }
    expect(path ? response.text : response.body.code).toContain(blocked ? 'AI_RESPONSE_BLOCKED' : 'AI_RESPONSE_INCOMPLETE');
    const usage = await prisma.creditRequest.findFirstOrThrow({ where: { userId, requestKey: key } });
    expect(usage.status).toBe('RELEASED');
    expect(usage.response).toBeNull();
    expect((await prisma.creditWallet.findUniqueOrThrow({ where: { userId } })).balance).toBe(1);
    expect(await prisma.creditLedger.count({ where: { userId, kind: 'REFUND' } })).toBe(1);
    expect((await prisma.creditLedger.aggregate({ where: { userId }, _sum: { delta: true } }))._sum.delta).toBe(1);
  });

  it('settles one completed answer, replays at zero without charging, and blocks both new-chat APIs', async () => {
    const userId = await createAiAccount();
    const key = randomUUID();
    providers.ask.mockResolvedValue({ reply: 'TEST ONLY complete response.', sources: [] });
    const completed = await chat(userId, '', key);
    expect(completed.status).toBe(200);
    expect(completed.body.data.meta.completion).toBe('complete');
    const replay = await chat(userId, '/stream', key);
    expect(replay.status).toBe(200);
    expect(replay.text).toContain('event: done');
    expect(replay.text).toContain('"completion":"complete"');
    expect((await chat(userId, '')).status).toBe(402);
    expect((await chat(userId, '/stream')).status).toBe(402);
    expect(providers.ask).toHaveBeenCalledOnce();
    expect(providers.stream).not.toHaveBeenCalled();
    expect((await prisma.creditWallet.findUniqueOrThrow({ where: { userId } })).balance).toBe(0);
    expect(await prisma.creditRequest.count({ where: { userId, status: 'COMPLETED' } })).toBe(1);
    expect((await prisma.creditLedger.aggregate({ where: { userId }, _sum: { delta: true } }))._sum.delta).toBe(0);
  });
});
