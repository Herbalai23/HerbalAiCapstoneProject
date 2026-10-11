import { beforeEach, describe, expect, it, vi } from 'vitest';

const { transaction, updateUser, updateTokens, findUnique } = vi.hoisted(() => ({
  transaction: vi.fn(), updateUser: vi.fn(), updateTokens: vi.fn(), findUnique: vi.fn(),
}));
vi.mock('../src/lib/prisma.js', () => ({
  prisma: { $transaction: transaction, user: { findUnique, updateMany: updateUser } },
}));
import { confirmLocalPassword, findPasswordCredentials, replacePassword } from '../src/repositories/user.repository.js';

beforeEach(() => {
  vi.clearAllMocks();
  updateUser.mockResolvedValue({ count: 1 });
  updateTokens.mockResolvedValue({ count: 3 });
  transaction.mockImplementation(callback => callback({ user: { updateMany: updateUser }, token: { updateMany: updateTokens } }));
});

describe('Password replacement transaction contract (mocked database)', () => {
  it('confirms a legacy credential only with matching hash/version and an eligible account', async () => {
    expect(await confirmLocalPassword('test-user', 'proof-hash', 4)).toBe(true);
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: 'test-user', password: 'proof-hash', sessionVersion: 4, localPasswordSet: null, OR: [
        { isBanned: false }, { isBanned: true, banExpiresAt: { lte: expect.any(Date) } },
      ] },
      data: { localPasswordSet: true },
    });
    expect(updateTokens).not.toHaveBeenCalled();
  });
  it('does not confirm stale proof or rewrite a known capability', async () => {
    findUnique.mockResolvedValueOnce(null);
    updateUser.mockResolvedValueOnce({ count: 0 });
    expect(await confirmLocalPassword('test-user', 'proof-hash', 4)).toBe(false);
    expect(updateTokens).not.toHaveBeenCalled();
  });
  it('accepts an identical legacy credential already confirmed by a concurrent login', async () => {
    updateUser.mockResolvedValueOnce({ count: 0 });
    findUnique.mockResolvedValueOnce({ localPasswordSet: true, password: 'proof-hash', sessionVersion: 4, isBanned: false });
    expect(await confirmLocalPassword('test-user', 'proof-hash', 4)).toBe(true);
    expect(updateTokens).not.toHaveBeenCalled();
  });
  it('reads credentials fresh rather than from the safe-user cache', async () => {
    await findPasswordCredentials('test-user');
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'test-user' },
      select: { id: true, password: true, localPasswordSet: true, sessionVersion: true, isBanned: true, banExpiresAt: true, banReason: true },
    });
  });

  it('guards hash, session version and ban status then revokes refresh and reset links in one transaction', async () => {
    expect(await replacePassword('test-user', 'old-hash', 4, 'new-hash')).toBe(true);
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: 'test-user', password: 'old-hash', sessionVersion: 4, OR: [
        { isBanned: false }, { isBanned: true, banExpiresAt: { lte: expect.any(Date) } },
      ] },
      data: { password: 'new-hash', localPasswordSet: true, sessionVersion: { increment: 1 } },
    });
    expect(updateTokens).toHaveBeenCalledWith({
      where: { userId: 'test-user', type: { in: ['REFRESH', 'PASSWORD_RESET'] }, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15_000 });
  });

  it('does not revoke tokens if a concurrent change or ban prevents the conditional write', async () => {
    updateUser.mockResolvedValueOnce({ count: 0 });
    expect(await replacePassword('test-user', 'old-hash', 4, 'new-hash')).toBe(false);
    expect(updateTokens).not.toHaveBeenCalled();
  });

  it('rejects a failed revocation instead of reporting a partial success', async () => {
    updateTokens.mockRejectedValueOnce(new Error('TEST token write failure'));
    await expect(replacePassword('test-user', 'old-hash', 4, 'new-hash')).rejects.toThrow('TEST token write failure');
  });
});
