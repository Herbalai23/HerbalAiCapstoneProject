import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findThread: vi.fn(),
  findComment: vi.fn(),
  findThreadLike: vi.fn(),
  findCommentLike: vi.fn(),
  createThreadLike: vi.fn(),
  createCommentLike: vi.fn(),
  countThreadLikes: vi.fn(),
  countCommentLikes: vi.fn(),
  updateThread: vi.fn(),
  updateComment: vi.fn(),
  findUser: vi.fn(),
  createNotification: vi.fn(),
  deleteThreadLike: vi.fn(),
}));

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    $transaction: (callback: (transaction: unknown) => unknown) => callback({
      $queryRaw: async (...args: unknown[]) => {
        const result = await mocks.findThread(...args);
        return result ? [result] : [];
      },
      thread: { update: mocks.updateThread },
      threadComment: { findFirst: mocks.findComment, update: mocks.updateComment },
      threadLike: { findUnique: mocks.findThreadLike, create: mocks.createThreadLike, delete: mocks.deleteThreadLike, count: mocks.countThreadLikes },
      threadCommentLike: { findUnique: mocks.findCommentLike, create: mocks.createCommentLike, count: mocks.countCommentLikes },
      user: { findUnique: mocks.findUser },
      notification: { create: mocks.createNotification },
    }),
  },
}));

import { toggleThreadLike, toggleCommentLike } from '../src/repositories/forum.repository.js';

describe('forum like target visibility', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findUser.mockResolvedValue({ name: 'Maria' });
    mocks.createNotification.mockImplementation(async ({ data }) => ({ id: 11, ...data, isRead: false }));
  });

  it('does not like a missing or deleted discussion', async () => {
    mocks.findThread.mockResolvedValue(null);

    expect(await toggleThreadLike(999, 'member')).toBeNull();
    expect(mocks.findThread.mock.calls[0]?.[0].join('')).toContain('"isDeleted" = false FOR UPDATE');
    expect(mocks.findThread.mock.calls[0]?.[1]).toBe(999);
    expect(mocks.createThreadLike).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it('does not like a deleted reply or a reply in a deleted discussion', async () => {
    mocks.findComment.mockResolvedValue(null);

    expect(await toggleCommentLike(999, 'member')).toBeNull();
    expect(mocks.findComment).toHaveBeenCalledWith({
      where: { id: 999, isDeleted: false, thread: { isDeleted: false } },
      select: { id: true },
    });
    expect(mocks.createCommentLike).not.toHaveBeenCalled();
  });

  it('preserves a valid thread like and its displayed count', async () => {
    mocks.findThread.mockResolvedValue({ id: 16, authorId: 'owner', title: 'Growing lagundi' });
    mocks.findThreadLike.mockResolvedValue(null);
    mocks.countThreadLikes.mockResolvedValue(1);

    const result = await toggleThreadLike(16, 'member');
    expect(result).toMatchObject({ likes: 1, hasLiked: true, notification: { userId: 'owner', type: 'COMMUNITY_LIKE', link: '/community/16' } });
    expect(mocks.createThreadLike).toHaveBeenCalledWith({ data: { threadId: 16, userId: 'member' } });
    expect(mocks.updateThread).toHaveBeenCalledWith({ where: { id: 16 }, data: { likes: 1 } });
    expect(mocks.createNotification).toHaveBeenCalledExactlyOnceWith({ data: {
      userId: 'owner', title: 'Maria liked your discussion', message: 'New like on “Growing lagundi”.',
      type: 'COMMUNITY_LIKE', link: '/community/16',
    } });
  });

  it('keeps self-likes functional without notifying the author about themself', async () => {
    mocks.findThread.mockResolvedValue({ id: 16, authorId: 'member', title: 'Self-owned discussion' });
    mocks.findThreadLike.mockResolvedValue(null);
    mocks.countThreadLikes.mockResolvedValue(1);
    expect(await toggleThreadLike(16, 'member')).toEqual({ likes: 1, hasLiked: true, notification: null });
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it('removes a previous like without creating another notification', async () => {
    mocks.findThread.mockResolvedValue({ id: 16, authorId: 'owner', title: 'Discussion' });
    mocks.findThreadLike.mockResolvedValue({ threadId: 16, userId: 'member' });
    mocks.countThreadLikes.mockResolvedValue(0);
    expect(await toggleThreadLike(16, 'member')).toEqual({ likes: 0, hasLiked: false, notification: null });
    expect(mocks.deleteThreadLike).toHaveBeenCalledWith({ where: { threadId_userId: { threadId: 16, userId: 'member' } } });
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it('uses a safe display-name fallback without looking up or including email addresses', async () => {
    mocks.findThread.mockResolvedValue({ id: 16, authorId: 'owner', title: 'Discussion' });
    mocks.findThreadLike.mockResolvedValue(null);
    mocks.findUser.mockResolvedValue(null);
    await toggleThreadLike(16, 'member');
    expect(mocks.findUser).toHaveBeenCalledWith({ where: { id: 'member' }, select: { name: true } });
    expect(mocks.createNotification).toHaveBeenCalledWith({ data: expect.objectContaining({ title: 'A community member liked your discussion' }) });
  });

  it('does not report a committed like if notification persistence fails inside the transaction', async () => {
    mocks.findThread.mockResolvedValue({ id: 16, authorId: 'owner', title: 'Discussion' });
    mocks.findThreadLike.mockResolvedValue(null);
    mocks.createNotification.mockRejectedValue(new Error('Isolated notification failure'));
    await expect(toggleThreadLike(16, 'member')).rejects.toThrow('Isolated notification failure');
  });
});
