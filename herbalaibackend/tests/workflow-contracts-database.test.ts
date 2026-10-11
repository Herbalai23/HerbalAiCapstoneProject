import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ENV } from '../src/config/env.js';
import { prisma, closeDatabasePool } from '../src/lib/prisma.js';
import { findSuggestionHistoryPage } from '../src/repositories/suggest.repository.js';
import { confirmLocalPassword, replacePassword } from '../src/repositories/user.repository.js';
import { createToken, redeemAccountToken } from '../src/repositories/token.repository.js';
import { passwordCapability } from '../src/lib/password-capability.js';
import { adminEditDatabaseBoundary } from './helpers/admin-edit-database-boundary.js';

const enabled = adminEditDatabaseBoundary(process.env.HERBALAI_TEST_DATABASE_URL, ENV.DATABASE_URL, Boolean(process.env.CI));
const ownerId = randomUUID();
const otherId = randomUUID();
const adminId = randomUUID();
const ids = [ownerId, otherId, adminId];
const now = new Date('2026-10-11T12:00:00Z');
const cutoff = new Date('2026-10-10T12:00:00Z');
const old = new Date('2026-10-09T12:00:00Z');
const query = { view: 'active' as const, scope: 'mine' as const, page: 1, limit: 25 };
const actor = { userId: ownerId, role: 'contributor' };

describe.skipIf(!enabled)('Workflow contracts against isolated loopback PostgreSQL (no provider calls)', () => {
  beforeAll(async () => {
    await prisma.user.createMany({ data: ids.map(id => ({
      id, username: `test_contract_${id.replaceAll('-', '')}`, email: `${id}@example.invalid`,
      name: 'TEST ONLY workflow contracts', password: 'TEST-original-hash',
      role: id === adminId ? 'admin' : 'contributor', localPasswordSet: id === otherId ? false : null,
    })) });
    const states = [
      { status: 'Pending' as const, reviewedAt: old },
      { status: 'ChangesRequested' as const, reviewedAt: old },
      { status: 'Approved' as const, reviewedAt: new Date('2026-10-10T13:00:00Z') },
      { status: 'Rejected' as const, reviewedAt: cutoff },
      { status: 'Approved' as const, reviewedAt: old },
      { status: 'Rejected' as const, reviewedAt: null },
    ];
    await prisma.suggestedHerb.createMany({ data: [...states, { status: 'Rejected' as const, reviewedAt: old }].map((state, index) => ({
      ...state, submitterId: index === 6 ? otherId : ownerId,
      localName: `TEST ONLY never publish ${ownerId} ${index}`, scientificName: 'Testus nonmedicinalis',
      category: 'TEST ONLY', medicinalUses: 'None', preparationMethod: 'None', dosage: 'None',
      submittedAt: old, reviewNotes: 'TEST ONLY retained review history',
    })) });
  });

  afterAll(async () => {
    try {
      await prisma.suggestedHerb.deleteMany({ where: { submitterId: { in: ids } } });
      await prisma.token.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    } finally { await closeDatabasePool(); }
  });

  it('retains actionable records and archives only final decisions at the exact review-time boundary', async () => {
    const active = await findSuggestionHistoryPage(query, actor, now);
    const history = await findSuggestionHistoryPage({ ...query, view: 'history' }, actor, now);
    expect(active.total).toBe(4);
    expect(active.counts).toEqual({ active: 4, history: 2, all: 6 });
    expect(history.total).toBe(2);
    expect(history.suggestions.every(record => ['Approved', 'Rejected'].includes(record.status))).toBe(true);
    expect(history.suggestions.find(record => record.reviewedAt?.getTime() === cutoff.getTime())?.historyEligibleAt).toBe(now.toISOString());
    expect(active.suggestions.filter(record => record.status === 'Pending' || record.status === 'ChangesRequested')).toHaveLength(2);
    expect(await prisma.suggestedHerb.count({ where: { submitterId: ownerId } })).toBe(6);
    expect(history.suggestions.every(record => record.reviewNotes === 'TEST ONLY retained review history')).toBe(true);
  });

  it('pages deterministically, scopes contributor counts and defaults admin views to their own submissions', async () => {
    const first = await findSuggestionHistoryPage({ ...query, view: 'all', limit: 2 }, actor, now);
    const second = await findSuggestionHistoryPage({ ...query, view: 'all', limit: 2, page: 2 }, actor, now);
    expect(first.suggestions).toHaveLength(2);
    expect(second.suggestions).toHaveLength(2);
    expect(new Set([...first.suggestions, ...second.suggestions].map(record => record.id)).size).toBe(4);
    expect(first.suggestions.every(record => record.submitterId === ownerId)).toBe(true);
    await expect(findSuggestionHistoryPage({ ...query, scope: 'all' }, actor, now)).rejects.toMatchObject({ status: 403 });
    expect((await findSuggestionHistoryPage(query, { userId: adminId, role: 'admin' }, now)).total).toBe(0);
    const all = await findSuggestionHistoryPage({ ...query, view: 'history', scope: 'all', limit: 50 }, { userId: adminId, role: 'admin' }, now);
    expect(all.counts.history).toBeGreaterThanOrEqual(3);
  });

  it('keeps migrated credentials unknown and establishes capability with guarded, concurrent proof', async () => {
    expect(passwordCapability(await prisma.user.findUniqueOrThrow({ where: { id: ownerId } }))).toEqual({ hasLocalPassword: null, passwordStatus: 'unknown' });
    expect(await confirmLocalPassword(ownerId, 'wrong-hash', 0)).toBe(false);
    expect(await Promise.all([
      confirmLocalPassword(ownerId, 'TEST-original-hash', 0), confirmLocalPassword(ownerId, 'TEST-original-hash', 0),
    ])).toEqual([true, true]);
    expect(passwordCapability(await prisma.user.findUniqueOrThrow({ where: { id: ownerId } }))).toEqual({ hasLocalPassword: true, passwordStatus: 'set' });
  });

  it('sets Google-only capability and revokes sessions atomically after a single-use reset token', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    await createToken({ userId: otherId, type: 'REFRESH', token: randomUUID(), expiresAt });
    const token = await createToken({ userId: otherId, type: 'PASSWORD_RESET', token: randomUUID(), expiresAt });
    const redemption = { id: token.id, userId: otherId, type: 'PASSWORD_RESET' as const, passwordHash: 'TEST-reset-hash' };
    expect(await redeemAccountToken(redemption)).toBe(true);
    expect(await redeemAccountToken(redemption)).toBe(false);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: otherId } });
    expect(user.localPasswordSet).toBe(true);
    expect(user.sessionVersion).toBe(1);
    expect(await prisma.token.count({ where: { userId: otherId, type: 'REFRESH', revokedAt: null } })).toBe(0);
    expect(await replacePassword(otherId, 'wrong-hash', 1, 'TEST-changed-hash')).toBe(false);
    expect(await replacePassword(otherId, 'TEST-reset-hash', 1, 'TEST-changed-hash')).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: otherId } })).localPasswordSet).toBe(true);
  });
});
