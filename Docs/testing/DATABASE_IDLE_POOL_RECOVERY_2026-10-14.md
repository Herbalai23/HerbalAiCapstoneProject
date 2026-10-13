# Database idle-pool recovery

## What the logs mean

An idle `database_pool_error` is not automatically a failed user request. The
driver removes the broken connection, and later requests can open a replacement.
Do not hide these errors or automatically retry writes: a lost connection can
leave a write's outcome uncertain.

Railway recorded paired idle disconnects while two connections were retained.
That matches the old pool's minimum of two. The provider/network reason for
those particular disconnects is not proven. Neon documents that scale-to-zero
can disconnect idle clients even when those clients are still connected.
The old minimum skips idle-time eviction of the last two sockets; the separate
maximum lifetime can still remove them. They are not literally immortal sockets.

## Narrow backend change

| Setting | Default | Meaning |
| --- | --- | --- |
| `DB_POOL_MIN` | `0` | No permanently retained idle sockets. |
| `DB_POOL_IDLE_TIMEOUT_MS` | `60000` | Close an unused socket after one minute. |
| `DB_POOL_WARMUP_CONNECTIONS` | `2` | Warm startup connections separately from idle retention. |

Startup still warms Prisma's query path and fails if readiness cannot complete.
An explicit zero warmup skips that check, as needed by isolated startup fixtures.
Warmup is capped by `DB_POOL_MAX`; active connections are not killed by the idle
timeout. Explicit overrides remain supported. Setting a nonzero minimum
intentionally prevents idle eviction below that count.

No scheduled database pings, automatic write retries, schema changes, new
credentials, frontend changes or environment-file edits are part of this fix.
After an idle period the first real request can pay a reconnection/wake-up cost;
keeping an unused database awake merely to avoid that cost wastes quota.

## Verification and release boundaries

The lifecycle tests use the installed PostgreSQL pool with simulated clients and
accelerated clocks. They do not connect to Neon. Configuration, startup,
eviction, active connections, unexpected faults, recovery and shutdown are covered.

A local candidate is not a live fix. Before promoting it, run full CI against an
isolated PostgreSQL service, preserve the current frontend commit, and recheck
application Console and current-deployment Railway logs after deployment.
Do not promise that application-side eviction prevents every provider/network
disconnect, or attribute the historical errors to a confirmed provider incident.

Local validation: all 140 tests in eight focused/offline regression files pass,
including 26 pool/startup checks. Backend lint/build, strict fixture typechecking
and all 12 architecture checks pass. A broad-suite attempt was stopped because
unguarded SQL-backed suites require a local PostgreSQL service; they encountered
the deliberately unreachable loopback database, not Neon. That attempt is not
counted as a passing full suite. No database migration or test-data mutation was
performed on the live database by these validation commands.

## Primary references

- [node-postgres pool settings](https://node-postgres.com/apis/pool)
- [Neon and long-running application pools](https://neon.com/blog/using-neons-auto-suspend-with-long-running-applications)
