import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  environment: {
    DATABASE_URL: 'postgresql://fixture:fixture@example.invalid/unused?sslmode=verify-full',
    NODE_ENV: 'production',
    DB_POOL_MIN: 0,
    DB_POOL_MAX: 10,
    DB_POOL_WARMUP_CONNECTIONS: 2,
    DB_POOL_IDLE_TIMEOUT_MS: 60_000,
    DB_POOL_CONNECTION_TIMEOUT_MS: 10_000,
    DB_POOL_MAX_LIFETIME_SECONDS: 1_800,
    DB_POOL_METRICS_INTERVAL_MS: 60_000,
    DB_TRANSACTION_MAX_WAIT_MS: 12_000,
  },
  pools: [] as Pool[],
  connectionAttempts: 0,
  failingConnection: -1,
  query: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock('../src/config/env.js', () => ({ ENV: fixture.environment }));
vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: class {} }));
vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    $queryRawUnsafe = fixture.query;
    $disconnect = fixture.disconnect;
  },
}));
vi.mock('pg', async importOriginal => {
  const actual = await importOriginal<typeof import('pg')>();
  const { EventEmitter } = await import('node:events');
  class FixtureClient extends EventEmitter {
    _queryable = true;
    _ending = false;

    connect(callback: (error?: Error) => void) {
      const connectionIndex = fixture.connectionAttempts++;
      callback(connectionIndex === fixture.failingConnection ? new Error('Synthetic connection failure') : undefined);
    }

    end(callback?: () => void) {
      this._ending = true;
      this.emit('end');
      callback?.();
    }
  }

  class FixturePool extends actual.default.Pool {
    constructor(settings: import('pg').PoolConfig) {
      super({ ...settings, Client: FixtureClient } as unknown as import('pg').PoolConfig);
      fixture.pools.push(this);
    }
  }

  return { default: { Pool: FixturePool } };
});

describe('database pool lifecycle without a real database', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubEnv('NODE_ENV', 'production');
    Object.assign(fixture.environment, { DB_POOL_MIN: 0, DB_POOL_MAX: 10, DB_POOL_WARMUP_CONNECTIONS: 2 });
    fixture.pools = [];
    fixture.connectionAttempts = 0;
    fixture.failingConnection = -1;
    fixture.query.mockReset().mockResolvedValue([{ ready: 1 }]);
    fixture.disconnect.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    for (const pool of fixture.pools) {
      if (!pool.ending) await pool.end();
    }
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('warms two connections and the Prisma query path before readiness', async () => {
    const database = await import('../src/lib/prisma.js');
    await database.warmDatabasePool();
    expect(database.getDatabasePoolMetrics()).toEqual({ total: 2, idle: 2, waiting: 0, connected: 2, removed: 0, errors: 0 });
    expect(fixture.query).toHaveBeenCalledExactlyOnceWith('SELECT 1');
  });

  it('releases every idle socket after one minute without keepalive queries', async () => {
    const database = await import('../src/lib/prisma.js');
    await database.warmDatabasePool();
    await vi.advanceTimersByTimeAsync(60_001);
    expect(database.getDatabasePoolMetrics()).toEqual({ total: 0, idle: 0, waiting: 0, connected: 2, removed: 2, errors: 0 });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(fixture.connectionAttempts).toBe(2);
    expect(fixture.query).toHaveBeenCalledTimes(1);
  });

  it('does not close an in-use connection when its idle timer would expire', async () => {
    const database = await import('../src/lib/prisma.js');
    const connection = await fixture.pools[0]!.connect();
    await vi.advanceTimersByTimeAsync(60_001);
    expect(database.getDatabasePoolMetrics()).toMatchObject({ total: 1, idle: 0, removed: 0 });
    connection.release();
    await vi.advanceTimersByTimeAsync(60_001);
    expect(database.getDatabasePoolMetrics()).toMatchObject({ total: 0, idle: 0, removed: 1, errors: 0 });
  });

  it('opens a fresh connection on the next checkout after an idle drain', async () => {
    const database = await import('../src/lib/prisma.js');
    await database.warmDatabasePool();
    await vi.advanceTimersByTimeAsync(60_001);
    const connection = await fixture.pools[0]!.connect();
    expect(database.getDatabasePoolMetrics()).toMatchObject({ total: 1, connected: 3, removed: 2, errors: 0 });
    connection.release();
  });

  it('still reports unexpected connection faults and permits subsequent recovery', async () => {
    const database = await import('../src/lib/prisma.js');
    const pool = fixture.pools[0]!;
    const connection = await pool.connect();
    connection.release();
    connection.emit('error', new Error('Connection terminated unexpectedly'));
    expect(database.getDatabasePoolMetrics()).toMatchObject({ total: 0, removed: 1, errors: 1 });
    expect(console.error).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ event: 'database_pool_error', message: 'Connection terminated unexpectedly' }));
    const replacement = await pool.connect();
    expect(database.getDatabasePoolMetrics()).toMatchObject({ total: 1, connected: 2, waiting: 0, errors: 1 });
    replacement.release();
  });

  it('respects an explicit nonzero minimum instead of silently overriding it', async () => {
    fixture.environment.DB_POOL_MIN = 2;
    const database = await import('../src/lib/prisma.js');
    await database.warmDatabasePool();
    await vi.advanceTimersByTimeAsync(60_001);
    expect(database.getDatabasePoolMetrics()).toMatchObject({ total: 2, idle: 2, removed: 0 });
  });

  it('caps warmup at the maximum pool size rather than deadlocking startup', async () => {
    fixture.environment.DB_POOL_MAX = 1;
    fixture.environment.DB_POOL_WARMUP_CONNECTIONS = 20;
    const database = await import('../src/lib/prisma.js');
    await database.warmDatabasePool();
    expect(database.getDatabasePoolMetrics()).toMatchObject({ total: 1, idle: 1, waiting: 0 });
  });

  it('lets explicitly disabled warmup avoid opening any startup connections', async () => {
    fixture.environment.DB_POOL_WARMUP_CONNECTIONS = 0;
    const database = await import('../src/lib/prisma.js');
    await database.warmDatabasePool();
    expect(fixture.connectionAttempts).toBe(0);
    expect(fixture.query).not.toHaveBeenCalled();
  });

  it('releases successful warmup connections before propagating a partial failure', async () => {
    fixture.failingConnection = 1;
    const database = await import('../src/lib/prisma.js');
    await expect(database.warmDatabasePool()).rejects.toThrow('Synthetic connection failure');
    expect(database.getDatabasePoolMetrics()).toMatchObject({ total: 1, idle: 1, waiting: 0 });
    expect(fixture.query).not.toHaveBeenCalled();
  });

  it('propagates an ORM readiness failure without retaining borrowed sockets', async () => {
    fixture.query.mockRejectedValue(new Error('Synthetic ORM readiness failure'));
    const database = await import('../src/lib/prisma.js');
    await expect(database.warmDatabasePool()).rejects.toThrow('Synthetic ORM readiness failure');
    expect(database.getDatabasePoolMetrics()).toMatchObject({ total: 2, idle: 2, waiting: 0 });
  });

  it('closes the ORM and all remaining pool connections during shutdown', async () => {
    const database = await import('../src/lib/prisma.js');
    await database.warmDatabasePool();
    await database.closeDatabasePool();
    expect(fixture.disconnect).toHaveBeenCalledTimes(1);
    expect(database.getDatabasePoolMetrics()).toMatchObject({ total: 0, idle: 0, removed: 2 });
  });
});
