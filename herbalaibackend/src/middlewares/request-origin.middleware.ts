import type { RequestHandler } from 'express';
import { ENV } from '../config/env.js';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export const requestOriginGuard: RequestHandler = (req, res, next) => {
  if (safeMethods.has(req.method)) { next(); return; }
  const origin = req.get('Origin');
  const trustedOrigins = new Set([
    new URL(ENV.FRONTEND_URL).origin,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ]);
  if ((origin && !trustedOrigins.has(origin)) || (!origin && req.get('Sec-Fetch-Site') === 'cross-site')) {
    res.status(403).json({ status: 'error', code: 'UNTRUSTED_REQUEST_ORIGIN', message: 'This request came from an untrusted site.' });
    return;
  }
  next();
};
