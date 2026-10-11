import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const mocks = vi.hoisted(() => ({ askDrAi: vi.fn(), streamDrAi: vi.fn() }));
vi.mock('../src/services/chat.service.js', () => mocks);

import { sendMessage, streamMessage } from '../src/controllers/chat.controller.js';

describe('Dr. Ai provider errors', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('DR_AI_CREDITS_MODE', 'off');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('does not expose provider details in the JSON response', async () => {
    mocks.askDrAi.mockRejectedValue(new Error('Provider key and model details'));
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });

    await sendMessage(Object.assign(new EventEmitter(), { body: { message: 'Lagundi' } }) as never, Object.assign(new EventEmitter(), { status }) as never);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Dr. Ai is temporarily unavailable. Please try again later.',
      code: 'AI_UNAVAILABLE', retryable: true, creditStatus: 'not_reserved',
    });
  });

  it('does not expose provider details after a partial stream', async () => {
    mocks.streamDrAi.mockResolvedValue({
      sources: [],
      chunks: (async function* () {
        yield 'Incomplete answer';
        throw new Error('Provider key and model details');
      })(),
    });
    const writes: string[] = [];
    const res = Object.assign(new EventEmitter(), {
      destroyed: false,
      headersSent: true,
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: (value: string) => writes.push(value),
      end: vi.fn(),
    });

    await streamMessage(Object.assign(new EventEmitter(), { body: { message: 'Lagundi' } }) as never, res as never);

    expect(writes.join('')).toContain('event: error');
    expect(writes.join('')).toContain('Dr. Ai is temporarily unavailable. Please try again later.');
    expect(writes.join('')).not.toContain('Provider key and model details');
    expect(writes.join('')).toContain('"code":"AI_UNAVAILABLE"');
    expect(writes.join('')).toContain('"creditStatus":"not_reserved"');
    expect(res.end).toHaveBeenCalledOnce();
  });

  it('does not copy private provider text into controller diagnostics', async () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      mocks.askDrAi.mockRejectedValue(new Error('PRIVATE provider credential'));
      const response = Object.assign(new EventEmitter(), { status: vi.fn().mockReturnThis(), json: vi.fn() });
      await sendMessage(Object.assign(new EventEmitter(), { body: { message: 'Lagundi' } }) as never, response as never);
      expect(diagnostic).toHaveBeenCalledWith('Chat Controller Error:', 'AI_UNAVAILABLE');
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('PRIVATE');
    } finally {
      diagnostic.mockRestore();
    }
  });
});
