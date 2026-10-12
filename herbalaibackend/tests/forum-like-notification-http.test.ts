import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ toggle: vi.fn(), to: vi.fn(), emit: vi.fn() }));
vi.mock('../src/repositories/forum.repository.js', () => ({ toggleThreadLike: mocks.toggle }));
vi.mock('../src/server.js', () => ({ io: { to: mocks.to } }));
import { ForumController } from '../src/controllers/forum.controller.js';

const app = express();
app.post('/threads/:id/like', (req, _res, next) => { Object.assign(req, { user: { userId: 'liker' } }); next(); }, new ForumController().likeThread);
app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(500).json({ status: 'error' }); });

describe('forum post like notification delivery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.to.mockReturnValue({ emit: mocks.emit });
  });

  it('emits the persisted notice only to its owner and omits it from the liker response', async () => {
    const notification = { id: 21, userId: 'owner', type: 'COMMUNITY_LIKE', title: 'Maria liked your discussion', link: '/community/7' };
    mocks.toggle.mockResolvedValue({ likes: 3, hasLiked: true, notification });
    const response = await request(app).post('/threads/7/like');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ likes: 3, hasLiked: true });
    expect(mocks.to).toHaveBeenCalledExactlyOnceWith('owner');
    expect(mocks.emit).toHaveBeenCalledExactlyOnceWith('notification', notification);
  });

  it.each([true, false])('does not emit without a saved notice (hasLiked=%s)', async hasLiked => {
    mocks.toggle.mockResolvedValue({ likes: 1, hasLiked, notification: null });
    expect((await request(app).post('/threads/7/like')).status).toBe(200);
    expect(mocks.to).not.toHaveBeenCalled();
  });

  it('keeps successful like acknowledgement when realtime delivery is temporarily unavailable', async () => {
    mocks.toggle.mockResolvedValue({ likes: 3, hasLiked: true, notification: { id: 21, userId: 'owner' } });
    mocks.emit.mockImplementation(() => { throw new Error('Isolated socket outage'); });
    const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await request(app).post('/threads/7/like');
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ likes: 3, hasLiked: true });
    } finally {
      logger.mockRestore();
    }
  });

  it('returns not found without publishing an event for a missing or deleted target', async () => {
    mocks.toggle.mockResolvedValue(null);
    expect((await request(app).post('/threads/7/like')).status).toBe(404);
    expect(mocks.to).not.toHaveBeenCalled();
  });
});
