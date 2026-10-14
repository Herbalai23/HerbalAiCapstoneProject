import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createApiRateLimiter } from '../src/middlewares/api-rate-limit.middleware.js';

const fixture = (trustProxy = true, maxKeys = 10) => {
  const app = express();
  if (trustProxy) app.set('trust proxy', 1);
  const work = vi.fn();
  app.use('/api', createApiRateLimiter({ windowMs: 1_000, limit: 2, maxKeys }));
  app.use(express.json());
  app.use('/api', (_req, res) => { work(); res.status(200).json({ status: 'success' }); });
  return { app, work };
};

afterEach(() => { vi.useRealTimers(); });

describe('general API request budget', () => {
  it('shares a budget across API routes and rejects before parsing or database work', async () => {
    const { app, work } = fixture();
    await request(app).get('/api/herbs').set('X-Forwarded-For', '192.0.2.1').expect(200);
    await request(app).get('/api/stats/dashboard').set('X-Forwarded-For', '192.0.2.1').expect(200);
    const response = await request(app).post('/api/auth/refresh-token').set('X-Forwarded-For', '192.0.2.1')
      .set('Content-Type', 'application/json').send('not-valid-json');
    expect(response.status).toBe(429);
    expect(response.body.code).toBe('API_RATE_LIMITED');
    expect(response.headers['cache-control']).toContain('no-store');
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(response.headers['ratelimit']).toContain('api');
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('does not throttle another IPv4 client because one client exhausted its allowance', async () => {
    const { app } = fixture();
    for (let index = 0; index < 3; index += 1) await request(app).get('/api/herbs').set('X-Forwarded-For', '192.0.2.2');
    await request(app).get('/api/herbs').set('X-Forwarded-For', '192.0.2.3').expect(200);
  });

  it('groups rotating IPv6 addresses within a /64 subnet', async () => {
    const { app } = fixture();
    await request(app).get('/api/herbs').set('X-Forwarded-For', '2001:db8:1:2::1').expect(200);
    await request(app).get('/api/herbs').set('X-Forwarded-For', '2001:db8:1:2::2').expect(200);
    await request(app).get('/api/herbs').set('X-Forwarded-For', '2001:db8:1:2::3').expect(429);
    await request(app).get('/api/herbs').set('X-Forwarded-For', '2001:db8:1:3::1').expect(200);
  });

  it('ignores forged forwarding headers when no proxy is trusted', async () => {
    const { app } = fixture(false);
    await request(app).get('/api/herbs').expect(200);
    await request(app).get('/api/herbs').expect(200);
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await request(app).get('/api/herbs').set('X-Forwarded-For', '192.0.2.4').expect(429);
    } finally { logger.mockRestore(); }
  });

  it('keeps stateless GET/HEAD health checks working without exempting lookalikes or writes', async () => {
    const { app } = fixture();
    await request(app).get('/api/herbs').expect(200);
    await request(app).get('/api/herbs').expect(200);
    for (const path of ['/api/health', '/api/health/', '/api/test', '/api/HEALTH']) {
      await request(app).get(path).expect(200);
      await request(app).head(path).expect(200);
    }
    await request(app).get('/api/health/details').expect(429);
    await request(app).post('/api/health').expect(429);
    await request(app).get('/api/auth/google/callback').expect(429);
  });

  it('fails closed for new clients at counter capacity and recovers after expiry', async () => {
    const { app, work } = fixture(true, 1);
    await request(app).get('/api/herbs').set('X-Forwarded-For', '192.0.2.5').expect(200);
    await request(app).get('/api/herbs').set('X-Forwarded-For', '192.0.2.6').expect(429);
    expect(work).toHaveBeenCalledTimes(1);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 1_001);
    await request(app).get('/api/herbs').set('X-Forwarded-For', '192.0.2.6').expect(200);
  });
});
