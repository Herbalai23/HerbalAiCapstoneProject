import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Options } from 'express-rate-limit';
import { BoundedRateLimitStore } from '../src/lib/bounded-rate-limit-store.js';

const storeWithWindow = (capacity = 2) => {
  const store = new BoundedRateLimitStore(capacity);
  store.init({ windowMs: 1_000 } as Options);
  return store;
};

afterEach(() => { vi.useRealTimers(); });

describe('bounded process-local API counters', () => {
  it('increments separate clients and does not extend their window', () => {
    const store = storeWithWindow();
    const reset = store.increment('first').resetTime;
    expect(store.increment('first')).toEqual({ totalHits: 2, resetTime: reset });
    expect(store.increment('second').totalHits).toBe(1);
    expect(store.size).toBe(2);
  });

  it('rejects unknown clients at capacity without evicting existing counters', () => {
    const store = storeWithWindow();
    store.increment('first');
    store.increment('second');
    for (let index = 0; index < 50; index += 1) {
      expect(store.increment(`overflow-${index}`).totalHits).toBe(Number.MAX_SAFE_INTEGER);
    }
    expect(store.size).toBe(2);
    expect(store.increment('first').totalHits).toBe(2);
  });

  it('reclaims expired capacity without a database or background timer', () => {
    vi.useFakeTimers();
    const store = storeWithWindow(1);
    store.increment('expired');
    vi.advanceTimersByTime(1_001);
    expect(store.increment('new').totalHits).toBe(1);
    expect(store.get('expired')).toBeUndefined();
    expect(store.size).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts a new window for an expired client and supports safe resets', () => {
    vi.useFakeTimers();
    const store = storeWithWindow();
    store.increment('first');
    vi.advanceTimersByTime(1_001);
    expect(store.increment('first').totalHits).toBe(1);
    store.decrement('first');
    store.decrement('first');
    expect(store.get('first')?.totalHits).toBe(0);
    store.resetKey('first');
    expect(store.get('first')).toBeUndefined();
    store.increment('second');
    store.resetAll();
    expect(store.size).toBe(0);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])('rejects invalid capacity %s', capacity => {
    expect(() => new BoundedRateLimitStore(capacity)).toThrow('positive safe integer');
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])('rejects invalid window %s', windowMs => {
    expect(() => new BoundedRateLimitStore(1).init({ windowMs } as Options)).toThrow('positive safe integer');
  });
});
