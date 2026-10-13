import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

describe('database pool configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'test');
    for (const name of ['DB_POOL_MIN', 'DB_POOL_MAX', 'DB_POOL_WARMUP_CONNECTIONS', 'DB_POOL_IDLE_TIMEOUT_MS']) {
      vi.stubEnv(name, undefined);
    }
    vi.stubEnv('DATABASE_URL', 'postgresql://fixture:fixture@example.invalid/unused?sslmode=verify-full');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('warms startup independently of permanent idle retention', async () => {
    const { ENV } = await import('../src/config/env.js');
    expect(ENV.DB_POOL_MIN).toBe(0);
    expect(ENV.DB_POOL_WARMUP_CONNECTIONS).toBe(2);
    expect(ENV.DB_POOL_IDLE_TIMEOUT_MS).toBe(60_000);
    expect(ENV.DB_POOL_MAX).toBe(10);
  });

  it('preserves explicit idle retention and warmup overrides', async () => {
    vi.stubEnv('DB_POOL_MIN', '3');
    vi.stubEnv('DB_POOL_WARMUP_CONNECTIONS', '4');
    vi.stubEnv('DB_POOL_IDLE_TIMEOUT_MS', '90000');
    const { ENV } = await import('../src/config/env.js');
    expect(ENV.DB_POOL_MIN).toBe(3);
    expect(ENV.DB_POOL_WARMUP_CONNECTIONS).toBe(4);
    expect(ENV.DB_POOL_IDLE_TIMEOUT_MS).toBe(90_000);
  });

  it('allows an explicit zero warmup without disabling pooling', async () => {
    vi.stubEnv('DB_POOL_WARMUP_CONNECTIONS', '0');
    const { ENV } = await import('../src/config/env.js');
    expect(ENV.DB_POOL_WARMUP_CONNECTIONS).toBe(0);
    expect(ENV.DB_POOL_MAX).toBe(10);
  });

  it.each([
    { input: '-1', warmup: 0, idle: 1_000 },
    { input: '999999', warmup: 20, idle: 600_000 },
    { input: 'not-a-number', warmup: 2, idle: 60_000 },
  ])('bounds operational values for $input', async ({ input, warmup, idle }) => {
    vi.stubEnv('DB_POOL_WARMUP_CONNECTIONS', input);
    vi.stubEnv('DB_POOL_IDLE_TIMEOUT_MS', input);
    const { ENV } = await import('../src/config/env.js');
    expect(ENV.DB_POOL_WARMUP_CONNECTIONS).toBe(warmup);
    expect(ENV.DB_POOL_IDLE_TIMEOUT_MS).toBe(idle);
  });
});
