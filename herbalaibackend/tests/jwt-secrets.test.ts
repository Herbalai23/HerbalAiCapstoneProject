import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { resolveJwtSecrets } from '../src/config/jwt-secrets.js';

describe('JWT signing secret configuration', () => {
  it('generates distinct process-local secrets instead of shared development defaults', () => {
    const first = resolveJwtSecrets({ NODE_ENV: 'development' });
    const second = resolveJwtSecrets({ NODE_ENV: 'development' });
    expect(first.JWT_SECRET).toMatch(/^[a-f0-9]{64}$/);
    expect(first.JWT_REFRESH_SECRET).toMatch(/^[a-f0-9]{64}$/);
    expect(first.JWT_SECRET).not.toBe(first.JWT_REFRESH_SECRET);
    expect(first).not.toEqual(second);
  });

  it('preserves explicitly configured keys in production', () => {
    const configured = {
      NODE_ENV: 'production',
      JWT_SECRET: randomBytes(32).toString('hex'),
      JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
    };
    expect(resolveJwtSecrets(configured)).toEqual({
      JWT_SECRET: configured.JWT_SECRET,
      JWT_REFRESH_SECRET: configured.JWT_REFRESH_SECRET,
    });
  });

  it.each(['', 'short', 'replace-with-a-unique-production-key', 'example-secret-that-is-not-a-real-key'])
    ('rejects missing, short or placeholder production keys without exposing values', value => {
      try {
        resolveJwtSecrets({ NODE_ENV: 'production', JWT_SECRET: value, JWT_REFRESH_SECRET: randomBytes(32).toString('hex') });
        throw new Error('Expected production key rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Production requires unique JWT secrets');
        if (value) expect((error as Error).message).not.toContain(value);
      }
    });

  it('rejects identical production access and refresh keys', () => {
    const shared = randomBytes(32).toString('hex');
    expect(() => resolveJwtSecrets({ NODE_ENV: 'production', JWT_SECRET: shared, JWT_REFRESH_SECRET: shared }))
      .toThrow('Production requires unique JWT secrets');
  });

  it('does not replace valid configured local keys', () => {
    const configured = { JWT_SECRET: randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: randomBytes(32).toString('hex') };
    expect(resolveJwtSecrets(configured)).toEqual(configured);
  });
});
