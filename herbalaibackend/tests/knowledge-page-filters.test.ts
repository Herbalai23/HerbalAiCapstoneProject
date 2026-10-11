import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn(), transaction: vi.fn() }));
vi.mock('../src/lib/prisma.js', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('../src/services/ai/knowledge-base/index.js', () => ({}));

import { findKBPage } from '../src/repositories/knowledgebase.repository.js';
import { KnowledgeBaseController } from '../src/controllers/knowledgebase.controller.js';

describe('knowledge-base filters before pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(operation => operation({ knowledgeBase: { findMany: mocks.findMany, count: mocks.count } }));
    mocks.count.mockResolvedValue(2);
    mocks.findMany.mockImplementation(async query => query.distinct
      ? [{ category: 'coordinated-care' }, { category: 'herbal-safety' }, { category: '' }]
      : [{ id: 'TEST-filtered', metadata: { sources: [] } }]);
  });

  it('applies search, category and status to both results and totals, then clamps pagination', async () => {
    const result = await findKBPage(2, 25, 'medicine', { category: 'coordinated-care', status: 'INACTIVE' });
    const where = {
      OR: [
        { question: { contains: 'medicine', mode: 'insensitive' } },
        { answer: { contains: 'medicine', mode: 'insensitive' } },
        { category: { contains: 'medicine', mode: 'insensitive' } },
      ],
      category: 'coordinated-care', isActive: false,
    };
    expect(mocks.count).toHaveBeenCalledWith({ where });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 0, take: 25 }));
    expect(result).toMatchObject({ total: 2, page: 1, limit: 25, categories: ['coordinated-care', 'herbal-safety'] });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'RepeatableRead' }));
  });

  it('gets category options from the complete collection, independently of filters or the page', async () => {
    mocks.count.mockResolvedValue(40);
    const result = await findKBPage(2, 25, '', { status: 'ACTIVE' });
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { category: { not: null } }, select: { category: true }, distinct: ['category'], orderBy: { category: 'asc' },
    });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true }, skip: 25 }));
    expect(result.page).toBe(2);
  });

  it('keeps the unfiltered page contract compatible and returns page one for an empty result', async () => {
    mocks.count.mockResolvedValue(0);
    const result = await findKBPage(9, 25, '');
    expect(mocks.count).toHaveBeenCalledWith({ where: {} });
    expect(result).toMatchObject({ total: 0, page: 1 });
  });

  const app = express();
  app.get('/page', new KnowledgeBaseController().getKnowledgePage);
  app.use((_error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    response.status(500).json({ message: 'Unexpected error' });
  });

  it.each([{ status: 'wrong' }, { category: 'a'.repeat(101) }, { status: ['ACTIVE', 'INACTIVE'] }])(
    'rejects malformed filter input before querying %#', async query => {
      expect((await request(app).get('/page').query(query)).status).toBe(400);
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it('passes normalized filters from HTTP into the paginated repository', async () => {
    const response = await request(app).get('/page').query({ page: 2, category: ' coordinated-care ', status: 'ACTIVE' });
    expect(response.status).toBe(200);
    expect(mocks.count).toHaveBeenCalledWith({ where: { category: 'coordinated-care', isActive: true } });
    expect(response.body.data).toMatchObject({ page: 1, total: 2 });
  });
});
