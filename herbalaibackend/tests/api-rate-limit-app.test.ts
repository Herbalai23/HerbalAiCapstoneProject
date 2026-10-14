import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const calls = vi.hoisted(() => ({ work: vi.fn(), webhook: vi.fn() }));

vi.mock('../src/config/env.js', async importOriginal => {
  const original = await importOriginal<typeof import('../src/config/env.js')>();
  return { ENV: {
    ...original.ENV,
    FRONTEND_URL: 'https://trusted.example',
    FRONTEND_ADDITIONAL_ORIGINS: [],
    API_RATE_LIMIT_MAX: 2,
    API_RATE_LIMIT_WINDOW_MS: 60_000,
    API_RATE_LIMIT_MAX_KEYS: 10,
  } };
});
vi.mock('../src/lib/prisma.js', () => ({ getDatabasePoolMetrics: () => ({}) }));
vi.mock('../src/config/credits.js', () => ({ getCreditsConfig: () => ({ mode: 'off' }) }));
vi.mock('../src/controllers/credits-webhook.controller.js', () => ({
  testCreditsWebhook: (req: import('express').Request, res: import('express').Response) => {
    calls.webhook({ rawBody: Buffer.isBuffer(req.body) });
    res.json({ status: 'success' });
  },
}));
vi.mock('../src/routes/index.js', async () => {
  const { Router } = await import('express');
  const router = Router();
  router.get('/health', (_req, res) => { res.json({ status: 'success' }); });
  router.all('/work', (_req, res) => { calls.work(); res.json({ status: 'success' }); });
  return { default: router };
});

import app from '../src/app.js';

describe('actual application API limiter placement', () => {
  it('rejects before controller work and parsing while preserving preflight, health and raw webhooks', async () => {
    await request(app).options('/api/work').set('Origin', 'https://trusted.example')
      .set('Access-Control-Request-Method', 'POST').expect(204);
    await request(app).get('/api/work').expect(200);
    await request(app).get('/api/work').expect(200);
    const blocked = await request(app).post('/api/work').set('Content-Type', 'application/json').send('invalid-json');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('API_RATE_LIMITED');
    expect(calls.work).toHaveBeenCalledTimes(2);
    await request(app).get('/api/health').expect(200);
    await request(app).post('/api/credits/webhook').set('Content-Type', 'application/json').send('{}').expect(200);
    expect(calls.webhook).toHaveBeenCalledWith({ rawBody: true });
    await request(app).get('/api/credits/webhook').expect(429);
  });
});
