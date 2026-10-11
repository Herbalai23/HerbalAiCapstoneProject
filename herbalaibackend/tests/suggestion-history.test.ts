import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn(), transaction: vi.fn() }));
vi.mock('../src/lib/prisma.js', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('../src/services/cloudinary.service.js', () => ({ uploadToCloudinary: vi.fn() }));
vi.mock('../src/repositories/herb.repository.js', () => ({ invalidateHerbCache: vi.fn() }));
vi.mock('../src/services/ai/core/gemini-service.js', () => ({ generateEmbedding: vi.fn() }));
vi.mock('../src/repositories/notification.repository.js', () => ({ createNotification: vi.fn() }));
vi.mock('../src/lib/mailer.js', () => ({ sendMail: vi.fn() }));

import { findSuggestionHistoryPage } from '../src/repositories/suggest.repository.js';
import { SuggestController } from '../src/controllers/suggest.controller.js';
import { suggestionListQuerySchema } from '../src/schema/suggest.schema.js';

const actor = { userId: 'TEST-owner', role: 'contributor' };
const now = new Date('2026-10-11T12:00:00Z');
const cutoff = new Date('2026-10-10T12:00:00Z');
const query = { view: 'active' as const, scope: 'mine' as const, page: 2, limit: 10 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(callback => callback({ suggestedHerb: { findMany: mocks.findMany, count: mocks.count } }));
  mocks.findMany.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
});

describe('Submission history API and retention contract', () => {
  it('uses the review-time boundary, retains pending/changes/null review dates, and bounds stable paging', async () => {
    await findSuggestionHistoryPage(query, actor, now);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { AND: [{ submitterId: actor.userId }, { OR: [
        { status: { notIn: ['Approved', 'Rejected'] } }, { reviewedAt: null }, { reviewedAt: { gt: cutoff } },
      ] }] },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }], take: 10, skip: 10,
    });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead', timeout: 15_000 });
  });

  it('includes final decisions at exactly 24 hours in history, not based on submission age', async () => {
    await findSuggestionHistoryPage({ ...query, view: 'history' }, actor, now);
    expect(mocks.findMany.mock.calls[0]![0].where).toEqual({ AND: [
      { submitterId: actor.userId }, { status: { in: ['Approved', 'Rejected'] }, reviewedAt: { lte: cutoff } },
    ] });
  });

  it('returns truthful counts and eligible dates without writing or deleting records', async () => {
    mocks.findMany.mockResolvedValue([
      { id: 1, status: 'Approved', reviewedAt: cutoff, reviewNotes: 'Keep these notes' },
      { id: 2, status: 'Pending', reviewedAt: cutoff },
      { id: 3, status: 'Rejected', reviewedAt: null },
    ]);
    mocks.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2).mockResolvedValueOnce(1).mockResolvedValueOnce(3);
    const result = await findSuggestionHistoryPage({ ...query, view: 'all' }, actor, now);
    expect(result).toMatchObject({ total: 3, page: 2, limit: 10, counts: { active: 2, history: 1, all: 3 }, asOf: now.toISOString() });
    expect(result.suggestions[0]).toMatchObject({ reviewNotes: 'Keep these notes', historyEligibleAt: now.toISOString() });
    expect(result.suggestions[1]!.historyEligibleAt).toBeNull();
    expect(result.suggestions[2]!.historyEligibleAt).toBeNull();
  });

  it('authorizes owner scope for all counts and rejects contributor all-scope before querying', async () => {
    await expect(findSuggestionHistoryPage({ ...query, scope: 'all' }, actor, now)).rejects.toMatchObject({ status: 403 });
    await expect(findSuggestionHistoryPage(query, { ...actor, userId: '' }, now)).rejects.toMatchObject({ status: 401 });
    expect(mocks.transaction).not.toHaveBeenCalled();
    await findSuggestionHistoryPage({ ...query, scope: 'all' }, { ...actor, role: 'admin' }, now);
    expect(mocks.findMany.mock.calls[0]![0].where.AND[0]).toEqual({});
  });

  it.each([
    { view: 'deleted' }, { view: 'active', page: '0' }, { view: 'active', limit: '51' },
    { view: 'active', page: '1.5' }, { view: 'active', page: '10001' },
    { view: ['active', 'history'] }, { view: 'history', submitterId: 'someone-else' },
    { view: 'active', page: ['1'] }, { view: 'active', limit: ['25'] }, { view: 'active', page: '1e2' },
  ])('rejects malformed or caller-selected-owner query %s', invalid => {
    expect(suggestionListQuerySchema.safeParse(invalid).success).toBe(false);
  });

  it('defaults a paginated view to the authenticated owner', () => {
    expect(suggestionListQuerySchema.parse({ view: 'active' })).toEqual({ view: 'active', scope: 'mine', page: 1, limit: 25 });
  });

  it('enforces HTTP validation and contributor scope before persistence', async () => {
    const app = express();
    app.use((req, _res, next) => { Object.assign(req, { user: actor }); next(); });
    app.get('/suggest', new SuggestController().listSuggestions);
    expect((await request(app).get('/suggest?view=history&scope=all')).status).toBe(403);
    expect((await request(app).get('/suggest?view=active&limit=51')).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
    const response = await request(app).get('/suggest?view=history');
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ suggestions: [], scope: 'mine', view: 'history', page: 1, limit: 25 });
  });
});
