import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Bounded Dr. Ai generation output allowance', () => {
  it.each([
    [undefined, 4096], ['', 4096], ['invalid', 4096], ['Infinity', 4096],
    ['0', 2048], ['-100', 2048], ['2048', 2048], ['4096', 4096], ['8192', 8192], ['99999999', 8192],
  ])('normalizes configured allowance %s to %s', async (configured, expected) => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DR_AI_MAX_OUTPUT_TOKENS', configured);
    const { ENV } = await import('../src/config/env.js');
    expect(ENV.DR_AI_MAX_OUTPUT_TOKENS).toBe(expected);
  });
});
