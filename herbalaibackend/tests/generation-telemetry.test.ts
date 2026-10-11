import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordGenerationOutcome } from '../src/services/ai/core/generation-telemetry.js';

afterEach(() => vi.restoreAllMocks());

describe('Safe generation completion telemetry', () => {
  it.each(['json', 'stream'] as const)('records token headroom and terminal reason for %s', transport => {
    const logger = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    recordGenerationOutcome('gemini-3.6-flash', transport, 4096, {
      candidates: [{ finishReason: 'MAX_TOKENS' }],
      usageMetadata: { promptTokenCount: 3000, candidatesTokenCount: 500, thoughtsTokenCount: 1700, totalTokenCount: 5200 },
    });
    expect(logger).toHaveBeenCalledOnce();
    expect(JSON.parse(logger.mock.calls[0]![0])).toEqual({
      event: 'dr_ai_generation_outcome', model: 'gemini-3.6-flash', transport, maxOutputTokens: 4096,
      finishReason: 'MAX_TOKENS', blockReason: null, promptTokens: 3000, responseTokens: 500,
      thoughtsTokens: 1700, totalTokens: 5200,
    });
  });

  it('does not log model text, reasoning, prompts, credentials or arbitrary provider labels', () => {
    const logger = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const privateValue = 'PRIVATE-SENTINEL';
    const response = {
      candidates: [{ finishReason: privateValue, finishMessage: privateValue, content: { parts: [{ text: privateValue }] } }],
      promptFeedback: { blockReason: privateValue }, prompt: privateValue, apiKey: privateValue,
      usageMetadata: { candidatesTokenCount: 1, thoughts: privateValue },
    };
    recordGenerationOutcome(`https://example.invalid/?key=${privateValue}`, 'json', 4096, response);
    const output = logger.mock.calls[0]![0];
    expect(output).not.toContain(privateValue);
    expect(JSON.parse(output)).toMatchObject({ model: 'UNKNOWN', finishReason: 'UNKNOWN', blockReason: 'UNKNOWN' });
  });

  it('leaves absent metadata unknown instead of inventing zero usage or STOP', () => {
    const logger = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    recordGenerationOutcome('gemini-3.6-flash', 'stream', 4096, {});
    expect(JSON.parse(logger.mock.calls[0]![0])).toMatchObject({
      finishReason: null, blockReason: null, promptTokens: null, responseTokens: null, thoughtsTokens: null, totalTokens: null,
    });
  });

  it('rejects non-finite, negative, fractional and unsafe token counters', () => {
    const logger = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    recordGenerationOutcome('gemini-3.6-flash', 'json', Infinity, {
      usageMetadata: { promptTokenCount: NaN, candidatesTokenCount: -1, thoughtsTokenCount: 0.5, totalTokenCount: Number.MAX_SAFE_INTEGER + 1 },
    });
    expect(JSON.parse(logger.mock.calls[0]![0])).toMatchObject({
      maxOutputTokens: null, promptTokens: null, responseTokens: null, thoughtsTokens: null, totalTokens: null,
    });
  });
});
