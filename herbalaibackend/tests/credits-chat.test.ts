import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({ reserve: vi.fn(), complete: vi.fn(), release: vi.fn(), ask: vi.fn(), stream: vi.fn() }));
vi.mock('../src/repositories/credits.repository.js', () => ({ reserveCreditRequest: mocks.reserve, completeCreditRequest: mocks.complete, releaseCreditRequest: mocks.release }));
vi.mock('../src/services/chat.service.js', () => ({ askDrAi: mocks.ask, streamDrAi: mocks.stream }));
import { sendMessage, streamMessage } from '../src/controllers/chat.controller.js';
import { CreditError } from '../src/config/credits.js';
import { AiResponseError } from '../src/services/ai/core/response-completion.js';

const app = express(); app.use(express.json());
app.use((req, _res, next) => { Object.assign(req, { user: { userId: 'TEST-credits-user', role: 'contributor' } }); next(); });
app.post('/chat', sendMessage); app.post('/stream', streamMessage);
const key = '7a463e2d-9f94-4ed2-90ab-e29ad36e2b6e';
const send = (path = '/chat') => request(app).post(path).set('X-Idempotency-Key', key).send({ message: 'TEST ONLY herb question.', history: [] });

describe('credit settlement around streaming and nonstreaming chat', () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv('DR_AI_CREDITS_MODE', 'test'); vi.stubEnv('DR_AI_CREDIT_PACKAGES', '[]'); vi.stubEnv('DR_AI_TRIAL_CREDITS', '0'); vi.stubEnv('PAYMONGO_TEST_SECRET_KEY', '');
    mocks.reserve.mockResolvedValue({ id: 'TEST-reservation', userId: 'TEST-credits-user', replay: null });
    mocks.complete.mockResolvedValue(undefined); mocks.release.mockResolvedValue(undefined);
    mocks.ask.mockResolvedValue({ reply: 'TEST ONLY completed answer.', sources: [] });
    mocks.stream.mockResolvedValue({ sources: [], chunks: (async function* () { yield 'TEST ONLY completed answer.'; })(), getResult: () => ({ reply: 'TEST ONLY completed answer.', sources: [] }) });
  });
  afterEach(() => vi.unstubAllEnvs());
  it.each(['/chat', '/stream'])('settles one reservation on completed %s', async path => {
    expect((await send(path)).status).toBe(200);
    expect(mocks.reserve).toHaveBeenCalledOnce(); expect(mocks.complete).toHaveBeenCalledOnce(); expect(mocks.release).not.toHaveBeenCalled();
  });
  it.each(['/chat', '/stream'])('refuses zero balance before generating %s', async path => {
    mocks.reserve.mockRejectedValue(new CreditError(402, 'No test credits.'));
    expect((await send(path)).status).toBe(402);
    expect(mocks.ask).not.toHaveBeenCalled(); expect(mocks.stream).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });
  it.each(['/chat', '/stream'])('replays a completed answer without another charge or generation: %s', async path => {
    mocks.reserve.mockResolvedValue({ id: 'TEST-existing', userId: 'TEST-credits-user', replay: { reply: 'TEST saved answer.', history: [], sources: [] } });
    expect((await send(path)).status).toBe(200);
    expect(mocks.ask).not.toHaveBeenCalled(); expect(mocks.stream).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled(); expect(mocks.release).not.toHaveBeenCalled();
  });
  it('refunds a failed nonstreaming request exactly once', async () => {
    mocks.ask.mockRejectedValue(new Error('TEST provider failed'));
    expect((await send()).status).toBe(503); expect(mocks.release).toHaveBeenCalledOnce(); expect(mocks.complete).not.toHaveBeenCalled();
  });
  it.each([false, true])('refunds rejected model completion and exposes a safe error (blocked=%s)', async blocked => {
    const error = new AiResponseError(blocked);
    mocks.ask.mockRejectedValue(error);
    const response = await send();
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ code: error.code, retryable: !blocked, creditStatus: 'released' });
    expect(response.body.data).toBeUndefined();
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('refunds provider truncation without sending partial text, history or done', async () => {
    mocks.stream.mockResolvedValue({ sources: [{ title: 'Tawa-tawa' }], chunks: (async function* () {
      throw new AiResponseError();
    })(), getResult: vi.fn() });
    const response = await send('/stream');
    expect(response.text).toContain('AI_RESPONSE_INCOMPLETE');
    expect(response.text).toContain('event: sources');
    expect(response.text).not.toContain('event: chunk');
    expect(response.text).not.toContain('event: done');
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('reports pending credit recovery truthfully if the refund transaction is unavailable', async () => {
    mocks.ask.mockRejectedValue(new AiResponseError());
    mocks.release.mockRejectedValueOnce(new Error('TEST database unavailable'));
    const response = await send();
    expect(response.body).toMatchObject({ code: 'AI_RESPONSE_INCOMPLETE', retryable: false, creditStatus: 'recovery_pending' });
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it.each(['/chat', '/stream'])('reports generic provider failure and pending recovery for %s', async path => {
    mocks.ask.mockRejectedValue(new Error('PRIVATE provider credential'));
    mocks.stream.mockRejectedValue(new Error('PRIVATE provider credential'));
    mocks.release.mockRejectedValueOnce(new Error('PRIVATE database unavailable'));
    const response = await send(path);
    if (path === '/chat') {
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ code: 'AI_UNAVAILABLE', retryable: false, creditStatus: 'recovery_pending' });
    } else {
      const terminal = response.text.split('\n\n').find(event => event.startsWith('event: error\n'));
      expect(terminal).toBeDefined();
      expect(JSON.parse(terminal!.split('data: ')[1]!)).toMatchObject({ code: 'AI_UNAVAILABLE', retryable: false, creditStatus: 'recovery_pending' });
      expect(response.text).not.toContain('event: done');
    }
    expect(response.text).not.toContain('PRIVATE');
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  describe.each(['json', 'stream-setup', 'stream-chunks'] as const)('terminal %s failure contract', phase => {
    it.each(['released', 'recovery_pending', 'not_reserved'] as const)('reports truthful credit state %s for each failure kind', async creditStatus => {
      const failures = [
        { error: new Error('PRIVATE provider credential'), code: 'AI_UNAVAILABLE', retryable: true },
        { error: new DOMException('PRIVATE timeout detail', 'TimeoutError'), code: 'AI_UNAVAILABLE', retryable: true },
        { error: new AiResponseError(), code: 'AI_RESPONSE_INCOMPLETE', retryable: true },
        { error: new AiResponseError(true), code: 'AI_RESPONSE_BLOCKED', retryable: false },
      ];
      for (const failure of failures) {
        mocks.reserve.mockClear(); mocks.release.mockClear(); mocks.complete.mockClear();
        mocks.ask.mockClear(); mocks.stream.mockClear();
        if (creditStatus === 'not_reserved') vi.stubEnv('DR_AI_CREDITS_MODE', 'off');
        if (creditStatus === 'recovery_pending') mocks.release.mockRejectedValueOnce(new Error('PRIVATE refund unavailable'));
        mocks.ask.mockRejectedValue(failure.error);
        if (phase === 'stream-chunks') {
          mocks.stream.mockResolvedValue({ sources: [], chunks: (async function* () { throw failure.error; })(), getResult: vi.fn() });
        } else {
          mocks.stream.mockRejectedValue(failure.error);
        }
        const response = await send(phase === 'json' ? '/chat' : '/stream');
        const events = response.text.split('\n\n').filter(event => event.startsWith('event: error\n'));
        const body = phase === 'json' ? response.body : JSON.parse(events[0]!.split('data: ')[1]!);
        expect(body).toEqual({ ...(phase === 'json' ? { status: 'error' } : {}),
          message: failure.error instanceof AiResponseError ? failure.error.message : 'Dr. Ai is temporarily unavailable. Please try again later.',
          code: failure.code, retryable: creditStatus !== 'recovery_pending' && failure.retryable, creditStatus });
        if (phase === 'json') expect(response.status).toBe(503);
        else {
          expect(events).toHaveLength(1);
          expect(response.text).not.toContain('event: done');
          expect(response.text).not.toContain('event: chunk');
        }
        expect(response.text).not.toContain('PRIVATE');
        expect(mocks.complete).not.toHaveBeenCalled();
        expect(mocks.release).toHaveBeenCalledTimes(creditStatus === 'not_reserved' ? 0 : 1);
        expect(phase === 'json' ? mocks.ask : mocks.stream).toHaveBeenCalledOnce();
      }
    });
  });
  it.each(['/chat', '/stream'])('preserves pre-generation credit errors and does not promise a refund for %s', async path => {
    mocks.reserve.mockRejectedValue(new CreditError(402, 'No test credits.'));
    const response = await send(path);
    expect(response.status).toBe(402);
    expect(response.body).toEqual({ status: 'error', message: 'No test credits.', code: 'AI_CREDIT_ERROR',
      retryable: false, creditStatus: 'not_reserved' });
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.ask).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it.each(['/chat', '/stream'])('reports pending recovery when saving the completed %s answer fails', async path => {
    mocks.complete.mockRejectedValueOnce(new CreditError(503, 'The completed answer could not be saved.'));
    mocks.release.mockRejectedValueOnce(new Error('PRIVATE database unavailable'));
    const response = await send(path);
    const body = path === '/chat' ? response.body : JSON.parse(response.text.split('\n\n')
      .find(event => event.startsWith('event: error\n'))!.split('data: ')[1]!);
    expect(body).toMatchObject({ code: 'AI_CREDIT_ERROR', retryable: false, creditStatus: 'recovery_pending' });
    expect(response.text).not.toContain('event: done');
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.complete).toHaveBeenCalledOnce();
  });
  it('refunds an incomplete stream and does not emit a completion event', async () => {
    mocks.stream.mockResolvedValue({ sources: [], chunks: (async function* () { yield 'partial'; throw new Error('TEST stream failed'); })(), getResult: () => ({ reply: 'partial', sources: [] }) });
    const response = await send('/stream'); expect(response.text).toContain('event: error'); expect(response.text).not.toContain('event: done'); expect(mocks.release).toHaveBeenCalledOnce(); expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('does not charge an empty answer or unsuccessful settlement', async () => {
    mocks.ask.mockResolvedValue({ reply: '', sources: [] }); expect((await send()).status).toBe(503); expect(mocks.release).toHaveBeenCalledOnce();
    mocks.ask.mockResolvedValue({ reply: 'test', sources: [] }); mocks.complete.mockRejectedValue(new Error('TEST save failure'));
    expect((await send()).status).toBe(503); expect(mocks.release).toHaveBeenCalledTimes(2);
  });
  it('requires a valid request identifier in test billing mode', async () => {
    expect((await request(app).post('/chat').send({ message: 'test' })).status).toBe(400); expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it('keeps the existing free path unchanged while billing is off', async () => {
    vi.stubEnv('DR_AI_CREDITS_MODE', 'off'); expect((await send()).status).toBe(200); expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });
});
