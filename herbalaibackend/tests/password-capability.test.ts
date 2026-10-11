import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUserByLoginIdentifier: vi.fn(), confirmLocalPassword: vi.fn(), primeCachedUser: vi.fn(),
  comparePassword: vi.fn(), createToken: vi.fn(), cleanupTokens: vi.fn(),
}));
vi.mock('../src/repositories/user.repository.js', () => mocks);
vi.mock('../src/repositories/token.repository.js', () => mocks);
vi.mock('../src/utils/password.js', () => ({ comparePassword: mocks.comparePassword }));
vi.mock('../src/utils/jwt.js', () => ({ generateAccessToken: () => 'TEST-access', generateRefreshToken: () => 'TEST-refresh' }));
vi.mock('../src/lib/mailer.js', () => ({ sendMail: vi.fn(), ensureMailReady: vi.fn() }));

import { passwordCapability } from '../src/lib/password-capability.js';
import { login } from '../src/services/auth.service.js';

const account = { id: 'TEST-account', username: 'test_user', email: 'test@example.invalid',
  name: 'TEST User', password: 'TEST-hash', role: 'contributor', sessionVersion: 2, isBanned: false,
  emailVerified: new Date(), localPasswordSet: null as boolean | null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUserByLoginIdentifier.mockResolvedValue({ ...account });
  mocks.confirmLocalPassword.mockResolvedValue(true);
  mocks.comparePassword.mockResolvedValue(true);
});

describe('Authoritative local password capability', () => {
  it.each([
    [true, 'set'], [false, 'unset'], [null, 'unknown'], [undefined, 'unknown'],
  ] as const)('reports stored %s state as %s, never inferring it from the provider/hash', (localPasswordSet, passwordStatus) => {
    const capability = passwordCapability(localPasswordSet === undefined ? {} : { localPasswordSet });
    expect(capability).toEqual({ hasLocalPassword: localPasswordSet ?? null, passwordStatus });
  });

  it('confirms a legacy password only after proof of its current hash and eligible account', async () => {
    const result = await login({ email: account.email, password: 'TEST-password' });
    expect(mocks.confirmLocalPassword).toHaveBeenCalledWith(account.id, account.password, 2);
    expect(result.user).toMatchObject({ hasLocalPassword: true, passwordStatus: 'set' });
    expect(mocks.confirmLocalPassword.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.comparePassword.mock.invocationCallOrder[0]!);
    expect(result.user).not.toHaveProperty('password');
  });

  it('does not mark an incorrect legacy password or issue tokens', async () => {
    mocks.comparePassword.mockResolvedValueOnce(false);
    await expect(login({ email: account.email, password: 'wrong' })).rejects.toMatchObject({ status: 401 });
    expect(mocks.confirmLocalPassword).not.toHaveBeenCalled();
    expect(mocks.createToken).not.toHaveBeenCalled();
  });

  it('does not permit password login for a known Google-only account', async () => {
    mocks.findUserByLoginIdentifier.mockResolvedValueOnce({ ...account, localPasswordSet: false });
    await expect(login({ email: account.email, password: 'TEST-password' })).rejects.toMatchObject({ status: 401 });
    expect(mocks.comparePassword).not.toHaveBeenCalled();
    expect(mocks.confirmLocalPassword).not.toHaveBeenCalled();
    expect(mocks.createToken).not.toHaveBeenCalled();
  });

  it('rejects a concurrent password/version change rather than confirming stale proof', async () => {
    mocks.confirmLocalPassword.mockResolvedValueOnce(false);
    await expect(login({ email: account.email, password: 'TEST-password' })).rejects.toMatchObject({ status: 409 });
    expect(mocks.createToken).not.toHaveBeenCalled();
    expect(mocks.primeCachedUser).not.toHaveBeenCalled();
  });

  it('does not rewrite known local password state on each login', async () => {
    mocks.findUserByLoginIdentifier.mockResolvedValueOnce({ ...account, localPasswordSet: true });
    expect((await login({ email: account.email, password: 'TEST-password' })).user.passwordStatus).toBe('set');
    expect(mocks.confirmLocalPassword).not.toHaveBeenCalled();
  });
});
