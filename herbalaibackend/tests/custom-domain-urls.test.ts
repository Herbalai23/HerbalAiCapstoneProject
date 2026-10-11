import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  claimPasswordResetRequest: vi.fn(),
  createToken: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock('../src/config/env.js', async importOriginal => {
  const original = await importOriginal<typeof import('../src/config/env.js')>();
  return { ENV: { ...original.ENV, FRONTEND_URL: 'https://www.herbalai.site', REQUIRE_EMAIL_VERIFICATION: true } };
});
vi.mock('../src/repositories/user.repository.js', () => ({
  findUserByEmail: fixtures.findUserByEmail,
  findUserById: fixtures.findUserById,
  claimPasswordResetRequest: fixtures.claimPasswordResetRequest,
  releasePasswordResetRequest: vi.fn(),
}));
vi.mock('../src/repositories/token.repository.js', () => ({
  createToken: fixtures.createToken,
  revokeToken: vi.fn(),
  revokeOtherUserTokensByType: vi.fn(),
  revokeOlderUserTokensByType: vi.fn(),
}));
vi.mock('../src/lib/mailer.js', () => ({ sendMail: fixtures.sendMail, ensureMailReady: vi.fn() }));

import { forgotPassword, resendEmailVerification } from '../src/services/auth.service.js';
import { createTestCheckout } from '../src/services/paymongo-test.service.js';

describe('custom frontend domain URL generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.findUserByEmail.mockResolvedValue({ id: 'TEST-domain-user', email: 'domain-test@example.invalid', name: 'TEST ONLY', emailVerified: null });
    fixtures.claimPasswordResetRequest.mockResolvedValue(true);
    fixtures.createToken.mockResolvedValue({ id: 'TEST-domain-token', createdAt: new Date() });
    fixtures.sendMail.mockResolvedValue({ messageId: 'TEST intercepted; not delivered' });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it.each([
    ['verification', resendEmailVerification, '/verify-email'],
    ['password recovery', forgotPassword, '/reset-password'],
  ] as const)('uses the canonical HTTPS origin for %s email links', async (_name, action, path) => {
    await action('domain-test@example.invalid');
    expect(fixtures.sendMail).toHaveBeenCalledOnce();
    const html = fixtures.sendMail.mock.calls[0]![0].html as string;
    const expected = new RegExp(`href="https://www\\.herbalai\\.site${path}\\?token=[a-f0-9]{64}"`);
    expect(html).toMatch(expected);
    expect(html).not.toContain('herbalaiph.vercel.app');
  });

  it('creates canonical checkout success and cancellation URLs without contacting PayMongo', async () => {
    vi.stubEnv('DR_AI_CREDITS_MODE', 'test');
    vi.stubEnv('DR_AI_CREDIT_PACKAGES', '[]');
    vi.stubEnv('DR_AI_TRIAL_CREDITS', '10');
    vi.stubEnv('PAYMONGO_TEST_SECRET_KEY', 'sk_test_SYNTHETIC_DOMAIN');
    vi.stubEnv('PAYMONGO_TEST_WEBHOOK_SECRET', 'TEST ONLY synthetic domain webhook secret');
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: 'cs_TESTdomain', attributes: { livemode: false, checkout_url: 'https://checkout.paymongo.com/TESTdomain' } } }) });
    vi.stubGlobal('fetch', fetcher);
    await createTestCheckout('TEST-domain-order', { id: 'test', name: 'TEST ONLY', credits: 10, amountMinor: 10000 });
    const payload = JSON.parse(fetcher.mock.calls[0]![1].body);
    expect(payload.data.attributes.success_url).toBe('https://www.herbalai.site/credits');
    expect(payload.data.attributes.cancel_url).toBe('https://www.herbalai.site/chat');
  });

});
