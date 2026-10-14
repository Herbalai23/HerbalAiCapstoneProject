import rateLimit from 'express-rate-limit';
import { ENV } from '../config/env.js';
import { BoundedRateLimitStore } from '../lib/bounded-rate-limit-store.js';

type ApiRateLimitOptions = { windowMs?: number; limit?: number; maxKeys?: number };

export const createApiRateLimiter = ({
  windowMs = ENV.API_RATE_LIMIT_WINDOW_MS,
  limit = ENV.API_RATE_LIMIT_MAX,
  maxKeys = ENV.API_RATE_LIMIT_MAX_KEYS,
}: ApiRateLimitOptions = {}) => rateLimit({
  windowMs,
  limit,
  store: new BoundedRateLimitStore(maxKeys),
  ipv6Subnet: 64,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  identifier: 'api',
  requestPropertyName: 'apiRateLimit',
  skip: req => ['GET', 'HEAD'].includes(req.method) && /^\/(?:health|test)\/?$/i.test(req.path),
  handler: (_req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(429).json({
      status: 'error',
      code: 'API_RATE_LIMITED',
      message: 'Too many API requests. Please wait and try again.',
    });
  },
});
