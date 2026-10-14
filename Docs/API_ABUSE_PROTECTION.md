# API abuse protection

This layer reduces application-level abuse; it does not guarantee availability during a distributed denial-of-service attack. Edge filtering is still needed for traffic that can exhaust bandwidth, connections or CPU before application middleware runs.

## Backend policy

- All `/api` traffic reaching Express shares a per-client budget before JSON/form parsing, session validation, controller work or database queries. Default: 600 requests per 60 seconds. This relatively generous budget accommodates normal navigation and users sharing one campus/public IP; it is not a measured capacity guarantee.
- IPv4 clients use Express's client IP; IPv6 clients are grouped by /64. The existing production `trust proxy = 1` policy is unchanged. Only platform-verified proxy behavior should justify changing it; do not blindly trust arbitrary forwarded headers or key by an unverified token/cookie.
- Existing stricter login, signup, email-link, password-setting, AI and credit limits remain in effect. Successful and unsuccessful requests both consume the general budget. Do not automatically retry rejected writes.
- Rejection returns HTTP 429, `API_RATE_LIMITED`, `Retry-After`, standard rate-limit headers and private/no-store cache policy. It does not expose the client IP, session or submitted data.
- Stateless GET/HEAD `/api/health` and `/api/test` remain available without consuming this budget. Similar-looking paths and writes are not exempt. Normal CORS preflight handling remains before the limiter.
- POST `/api/credits/webhook` keeps its separate 120/minute limit and raw-body signature verification before the general middleware. This avoids sharing the visitor bucket with provider callbacks. No browser challenge is added to webhooks. Google callbacks and verification/reset flows remain ordinary bounded API requests; they are not blanket exemptions.

## Counter storage and limits

Counters are in memory, not Neon. Capacity is bounded to 10,000 tracked client keys by default; expiry pruning is throttled to once per second for new clients. When capacity is full, unfamiliar clients receive 429 instead of growing memory without bounds or evicting existing counters to bypass limits. Known clients retain their existing allowance. Expired entries are reclaimed on subsequent traffic; there is no background timer or external service.

Counters reset when the process restarts and are not shared between replicas. The present deployment has one replica. Before scaling horizontally, use a reviewed shared store; do not add rate-limit writes to the production application database. A distributed botnet can still spread traffic across many keys. This middleware does not cover Socket.IO's separately handled transport or replace edge-level defenses.

## Hosting review — 14 October 2026

Vercel's production project showed System Mitigations Active, no system bypass rules and zero custom rules. Bot Protection and Attack Mode were off. Platform DDoS mitigation is active; bot challenges are a separate feature. Railway's service exposed Under Attack Mode but showed custom Edge Rules unavailable on the current plan. No paid upgrade, DNS change, bypass, allowlist or hosting setting was changed during this review.

Do not enable a JavaScript challenge across the backend as a routine precaution: OAuth, email links, WebSocket clients and payment providers must be checked for compatibility. Under Attack Mode is an incident response option, not a substitute for an API-compatible steady-state policy.

Official references:
- https://vercel.com/docs/vercel-firewall/ddos-mitigation
- https://docs.railway.com/networking/public-networking/specs-and-limits
- https://express-rate-limit.mintlify.app/reference/configuration

## Validation and deployment

Use isolated tests with deliberately tiny thresholds, fake clocks and controller/database mocks to prove rejection before expensive work, independent clients, IPv6 grouping, bounded memory, expiry, health checks, existing auth limits and webhook compatibility. Never flood the live service or production Neon database to test this policy.

Code changes require the normal full-CI-gated release before taking effect. A local passing test does not mean the production limiter has been deployed. After release, use a few ordinary requests, browser Console inspection and Railway logs; do not consume the full live allowance merely to demonstrate 429.
