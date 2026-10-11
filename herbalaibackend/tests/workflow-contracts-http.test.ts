import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  signup: vi.fn(), forgotPassword: vi.fn(), resendEmailVerification: vi.fn(), requestPasswordSetup: vi.fn(),
  findUserById: vi.fn(), updateUserProfile: vi.fn(),
}));
vi.mock('../src/services/auth.service.js', () => mocks);
vi.mock('../src/repositories/user.repository.js', () => mocks);
vi.mock('../src/lib/access-session.js', () => ({ validateAccessSession: vi.fn(async () => ({ status: 'valid', payload: { userId: 'TEST-user', role: 'contributor', sessionVersion: 0 } })) }));
vi.mock('express-rate-limit', () => ({ default: () => (_req: Request, _res: Response, next: NextFunction) => next() }));

import authRoutes from '../src/routes/auth.routes.js';
import { errorResponse } from '../src/utils/error-response.js';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  const response = errorResponse(error, true);
  res.status(response.status).json(response.body);
});

const account = { id: 'TEST-user', email: 'test@example.invalid', username: 'test_user', name: 'Testa Usera', role: 'contributor', isBanned: false };
const registration = { username: account.username, email: account.email, password: 'TEST-password', firstName: 'Testa', lastName: 'Usera' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.signup.mockResolvedValue({ ...account, verificationRequired: true, verificationEmailSent: true, verificationEmailStatus: 'provider_accepted', message: 'TEST provider accepted' });
  mocks.forgotPassword.mockResolvedValue({ deliveryStatus: 'requested', message: 'If the account is eligible, we will attempt to send a link.' });
  mocks.resendEmailVerification.mockResolvedValue({ deliveryStatus: 'requested', message: 'If eligible, we will attempt to send a link.' });
  mocks.requestPasswordSetup.mockResolvedValue({ deliveryStatus: 'provider_accepted', message: 'TEST provider accepted' });
});

describe('Frontend/backend HTTP contract boundary (mocked providers and storage)', () => {
  it.each([
    [true, 'provider_accepted', 201], [false, 'suppressed', 202], [false, 'unavailable', 202],
  ] as const)('exposes signup delivery metadata without asserting inbox receipt (%s, %s)', async (sent, verificationEmailStatus, status) => {
    mocks.signup.mockResolvedValueOnce({ ...account, verificationRequired: true, verificationEmailSent: sent, verificationEmailStatus, message: 'TEST creation acknowledged' });
    const response = await request(app).post('/api/auth/signup').send(registration);
    expect(response.status).toBe(status);
    expect(response.body.data).toMatchObject({ verificationRequired: true, verificationEmailSent: sent, verificationEmailStatus, user: { id: account.id } });
    expect(response.body.data.user).not.toHaveProperty('password');
  });

  it('rejects numeric name fields before calling signup persistence', async () => {
    const response = await request(app).post('/api/auth/signup').send({ ...registration, firstName: 'Testa1' });
    expect(response.status).toBe(400);
    expect(mocks.signup).not.toHaveBeenCalled();
  });

  it.each([
    [true, 'set'], [false, 'unset'], [null, 'unknown'],
  ] as const)('preserves capability metadata across GET and PATCH /me (%s)', async (localPasswordSet, passwordStatus) => {
    mocks.findUserById.mockResolvedValue({ ...account, localPasswordSet });
    mocks.updateUserProfile.mockResolvedValue({ ...account, localPasswordSet });
    const session = await request(app).get('/api/auth/me').set('Authorization', 'Bearer TEST-token');
    const updated = await request(app).patch('/api/auth/me').set('Authorization', 'Bearer TEST-token').send({ name: 'Updated Profile Name' });
    expect(session.status).toBe(200);
    expect(updated.status).toBe(200);
    expect(session.body.data.user).toMatchObject({ hasLocalPassword: localPasswordSet, passwordStatus });
    expect(updated.body.data.user).toMatchObject({ hasLocalPassword: localPasswordSet, passwordStatus });
  });

  it.each(['forgot-password', 'resend-email-verification'])('labels the public %s response as requested, not delivered', async path => {
    const response = await request(app).post('/api/auth/' + path).send({ email: account.email });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ deliveryStatus: 'requested' });
  });

  it('exposes acceptance only for authenticated password setup', async () => {
    const response = await request(app).post('/api/auth/password-setup').set('Authorization', 'Bearer TEST-token').send({});
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ deliveryStatus: 'provider_accepted' });
  });

  it('returns a safe actionable setup failure rather than leaking provider credentials', async () => {
    mocks.requestPasswordSetup.mockRejectedValueOnce({ status: 503, code: 'PASSWORD_EMAIL_UNAVAILABLE', message: 'PRIVATE token and sender details' });
    const response = await request(app).post('/api/auth/password-setup').set('Authorization', 'Bearer TEST-token').send({});
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'error', code: 'PASSWORD_EMAIL_UNAVAILABLE', message: 'We could not send your password link. Please try again later.' });
  });
});
