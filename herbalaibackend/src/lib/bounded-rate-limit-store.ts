import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit';

export class BoundedRateLimitStore implements Store {
  readonly localKeys = true;
  private readonly clients = new Map<string, ClientRateLimitInfo>();
  private windowMs = 60_000;
  private lastPrunedAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly maxKeys: number) {
    if (!Number.isSafeInteger(maxKeys) || maxKeys < 1) {
      throw new Error('Rate-limit store capacity must be a positive safe integer');
    }
  }

  init(options: Options): void {
    if (!Number.isSafeInteger(options.windowMs) || options.windowMs < 1) {
      throw new Error('Rate-limit window must be a positive safe integer');
    }
    this.windowMs = options.windowMs;
  }

  get size(): number {
    return this.clients.size;
  }

  get(key: string): ClientRateLimitInfo | undefined {
    const client = this.clients.get(key);
    if (client && client.resetTime && client.resetTime.getTime() <= Date.now()) {
      this.clients.delete(key);
      return undefined;
    }
    return client;
  }

  increment(key: string): ClientRateLimitInfo {
    const now = Date.now();
    const client = this.get(key);
    if (client) {
      client.totalHits = Math.min(Number.MAX_SAFE_INTEGER, client.totalHits + 1);
      return client;
    }
    if (now - this.lastPrunedAt >= 1_000) {
      for (const [clientKey, entry] of this.clients) {
        if (entry.resetTime && entry.resetTime.getTime() <= now) this.clients.delete(clientKey);
      }
      this.lastPrunedAt = now;
    }
    if (this.clients.size >= this.maxKeys) {
      return { totalHits: Number.MAX_SAFE_INTEGER, resetTime: new Date(now + this.windowMs) };
    }
    const entry = { totalHits: 1, resetTime: new Date(now + this.windowMs) };
    this.clients.set(key, entry);
    return entry;
  }

  decrement(key: string): void {
    const client = this.get(key);
    if (client) client.totalHits = Math.max(0, client.totalHits - 1);
  }

  resetKey(key: string): void {
    this.clients.delete(key);
  }

  resetAll(): void {
    this.clients.clear();
    this.lastPrunedAt = Number.NEGATIVE_INFINITY;
  }
}
