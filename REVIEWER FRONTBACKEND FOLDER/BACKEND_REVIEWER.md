# Herbal-Ai Backend Defence Reviewer

Prepared: 12 October 2026. Code reference: `b74cae4`. This is a backend technical reviewer, not a project-manager guide.

## 1. What the backend does

The backend is the server-side authority. It validates input, authenticates accounts, checks roles/ownership, stores and retrieves records, coordinates external providers and sends responses/events to the frontend.

**Thirty-second answer:**

> Our backend uses Node.js, Express and TypeScript with Prisma and PostgreSQL. It protects accounts and administrator actions, manages source-reviewed herb records, retrieves context for Dr. Ai, and supports community, messaging, notifications and email. Transactions and operation-specific constraints protect conflicting writes. External AI and email remain dependencies, so we handle timeouts and report failures rather than promising guaranteed delivery or accuracy.

## 2. Architecture and request lifecycle

```text
HTTPS /api request
    -> Express middleware: request timing, headers, origin/body handling
    -> Router: selects the endpoint
    -> Authentication / role / schema middleware where configured
    -> Controller: coordinates this request and returns HTTP/SSE output
    -> Service: authentication, AI, email or other workflow logic
    -> Repository: Prisma queries, transactions and parameterized vector SQL
    -> PostgreSQL or an external provider
    -> Response; socket notifications where the workflow requires them
```

Not every controller uses every layer, but this separation keeps HTTP handling, workflow rules and database access easier to understand and test.

| Tool | Actual responsibility |
| --- | --- |
| Node.js and Express 5 | Run the HTTP API and middleware. |
| TypeScript and Zod | Development-time types and runtime request/config validation. |
| Prisma 7 with its PostgreSQL adapter | ORM queries, relations, migrations and transactions. |
| PostgreSQL and pgvector | Relational data and 768-dimensional embedding storage/search. |
| bcryptjs | Salted password hashing and comparison, cost factor 12. |
| JSON Web Tokens | Signed access/refresh credentials with expiry. |
| Google auth library | OAuth code exchange and ID-token verification. |
| Gemini integration | Generate embeddings and source-contextual answers. |
| Socket.IO server | Public forum room events and authenticated private-user room events. |
| Multer and Cloudinary | Parse constrained image uploads and store hosted image assets. |
| Mailer adapter | Gmail API, Resend or SMTP, depending on configuration. |
| Vitest, Supertest, native test scripts | Workflow, HTTP and isolated database regression checks. |

Deployment: Vercel hosts the frontend; Railway runs the backend; Neon hosts PostgreSQL. The browser uses same-origin `/api` forwarding for ordinary HTTP calls and the configured socket endpoint for live events. Do not say a Namecheap domain is the database or that moving to a VPS automatically changes OAuth branding.

## 3. Roles, authentication and authorization

The stored roles are `contributor` and `admin`. An anonymous visitor is an access condition, not a third database role. Visitors can read public published herbs and discussions. Protected workflows require authentication; administrative endpoints additionally require the admin role. Ownership checks are also necessary: being signed in does not authorize editing any user's records.

### Local signup and login

1. Validate username/email, first/last-name policy and password input.
2. Check for account conflicts and hash the password with bcrypt.
3. Create a contributor account; do not let a request assign itself an admin role.
4. If verification is required, issue a 24-hour verification link and attempt email delivery.
5. Local login verifies the password, checks account/verification/ban state, and creates tokens.

Custom signup currently restricts each first/last name to 5–10 Unicode letters with no internal spaces, digits or punctuation. This is a product rule, not reliable identity verification. Legacy, Google and display-name flows do not all apply the same registration policy. Explain that limitation honestly.

### Access and refresh tokens

- Access JWT: 15 minutes.
- Refresh JWT: seven days, with a random JWT ID; recorded in the `Token` table.
- The payload includes user identity, role and session version.
- Production cookies are HttpOnly and Secure; auth cookies currently use SameSite=None in production and Lax in development.
- Access-session validation also checks current account/session state rather than trusting a signature alone.
- Refresh validates the stored token and current session version, then rotates the refresh token.

JWT signatures detect tampering; JWT payloads are not encryption. HttpOnly cookies reduce direct script access to cookies, but are not complete XSS/CSRF protection. Normal browser HTTP calls use cookies; the implementation also has token-bearing response/socket pathways, so do not claim tokens never enter JavaScript anywhere.

### Logout, password changes and banning

Password change/reset increments the session version and invalidates recovery/session material in the relevant repository transaction. Session invalidation disconnects the account's private sockets in the running server. Banning revokes access without requiring physical deletion of the user. Temporary bans use a server-recorded expiry.

These protections are not a claim of centrally coordinated multi-instance socket invalidation: cross-instance broadcasting would require additional infrastructure.

## 4. Google OAuth and optional Herbal-Ai password

The sign-in scopes are `openid`, `email` and `profile`. These do not grant every signing-in user Gmail sending permission. Sender-mail authorization is a separate deployment integration.

The backend creates a random OAuth state and stores it in an HttpOnly cookie. The callback verifies that state, exchanges the code, and verifies Google's ID token for the configured client audience. It requires a Google-verified email. Accounts are found by email or created as contributors when appropriate, with ban checks before final access.

The callback bridges to the frontend's `/api/auth/google/complete` route through a form POST, so app authentication is established on the frontend domain instead of relying on tokens in a redirect query string. Allowed post-login destinations are restricted.

For a new Google-only account, an internal random hash satisfies the database password field but is **not** a password the user knows. `localPasswordSet=false` distinguishes this from a usable local password. The API exposes `set`, `unset` or `unknown` capability for the settings UI. The user can request an optional local-password setup email; creating it does not change the Google password.

## 5. Email verification and password recovery

Verification and password-reset tokens are cryptographically random, typed, expiring records. Their redemption is guarded against repeated use. The current token repository stores token values; do not claim these records are hashed merely because passwords are hashed.

| Workflow | Where the link goes | Important rule |
| --- | --- | --- |
| Verify account | `/verify-email?token=...` | Verification link expires after 24 hours. |
| Reset/create local password | `/reset-password?token=...` | Link expires after one hour and is single-use. |
| Revise requested submission | `/suggest?edit=<id>` | Requires the owning account; it is not an auth token. |

Password reset redemption updates the password, confirms local-password capability, advances the session version and revokes related tokens atomically. Reset/change schemas enforce at least eight characters and at most 72 UTF-8 bytes for the new password. The signup schema's password check is not identical; do not claim every entry point has precisely the same maximum.

Recovery requests use generic eligibility wording to reduce account enumeration and apply throttling, including the one-hour account password-link cooldown. Email delivery modes are `live`, `allowlist` and `log`. Log/allowlist suppression is intentionally distinguishable from provider acceptance.

**Provider accepted is not the same as received in Inbox.** The provider can accept a message that is delayed, filtered or sent to Spam. Verification and reset delivery were separately confirmed in a controlled mailbox during the project checks; that is evidence for those tests, not every future address.

## 6. Database: explain tables by purpose

| Group | Tables/models | Why they exist |
| --- | --- | --- |
| Identity and sessions | `User`, `Token` | Accounts, password capability, verification, bans and recovery/refresh records. |
| Library and provenance | `Herb`, `HerbSource` | Plant information, publication/evidence state, sources, reviewer and image attribution. |
| Plant discussions | `HerbComment`, `HerbCommentLike` | Record comments, reply relationships and per-user reactions. |
| Submission review | `SuggestedHerb` | Contributor draft/review data, status, references and revision number. |
| Community | `Thread`, `ThreadComment`, `ThreadLike`, `ThreadCommentLike`, `Tag`, `ThreadTag` | Discussions, replies, reactions and tag relationships. |
| Private messaging | `ChatMessage` | Sender/receiver, content, optional image, timestamps and edited/deleted flags. |
| AI retrieval | `KnowledgeBase` | Active reviewed QA facts, metadata and embeddings. |
| Accountability | `AuditLog`, `Notification` | Selected admin actions and persistent user notification/read state. |
| Test credits | `CreditWallet`, `CreditLedger`, `CreditRequest`, `CreditPurchase` | Balance, adjustments, idempotent AI requests and test purchases. |

A primary key identifies a row. Foreign keys connect records and define deletion behaviour. Unique constraints prevent particular duplicate identities, such as username/email, one like per user/target, a source suggestion's publication link and a per-user credit request key. Indexes accelerate selected lookup/filter patterns; they do not make every possible query fast.

`Herb` and `KnowledgeBase` hold `vector(768)` values through pgvector. They are not separate vector-database services. Images are hosted in Cloudinary; their URLs/attribution remain in database records.

**Do not delete “useless tables” to make the database smaller.** Empty tables may support essential workflows. User relations can cascade-delete messages, suggestions or audit logs; credit relations can restrict deletion. Disabling a test user may preserve history better than deleting it. Any cleanup needs an identified scope, backup and a deliberate retention decision.

Audit logs record selected application actions. They are not a cryptographically immutable ledger and do not capture arbitrary direct SQL edits or every routine visit.

## 7. Herb visibility and administrative review

Public herb reads require `publicationStatus=PUBLISHED` and `isVerified=true`. Publication states include Draft, Published, Hold and Archived. Evidence class and provenance are independent fields.

### New suggestion

The backend authenticates the submitter, validates text, handles an optional upload and stores a Pending suggestion. It does not immediately publish that information or treat the author's claims as reviewed knowledge.

### Approve and publish

1. Admin authentication/role checks run.
2. The controller checks Pending status and the submitted revision.
3. Required information/source/reference coverage and evidence class are validated.
4. The system prepares retrieval data as appropriate.
5. A database transaction conditionally changes the Pending suggestion at the expected revision.
6. It creates the linked published/verified herb and its sources, writes any prepared vector and records the review audit.
7. After the saved decision, it attempts notification/email delivery and refreshes relevant cached data.

A reference must identify what fields it supports. Publication coverage includes identity, medicinal uses, preparation and dosage, plus any written warnings. Choosing a DOH/PITAHC evidence label alone is not authority to claim a cure or institutional endorsement.

### Request Changes and resubmit

Request Changes requires reviewer notes of 10–2,000 characters and a revision number. The saved record becomes `ChangesRequested`; the backend attempts an in-app notification and an email with review notes and the edit link. Delivery status is returned separately. Email failure does not silently erase the recorded decision, and it is not permission to issue the same decision repeatedly.

The owning contributor loads the submission, revises it and resubmits. Conditional status/ownership checks prevent another account or a resolved request from being overwritten; revision increases and the submission returns to Pending for review.

Approved and Rejected submissions become History-eligible 24 hours after `reviewedAt`. Pending and Changes Requested remain Active. This is a timestamp-based list filter, not a cron deletion job. The API returns counts and `historyEligibleAt` so the client need not invent timing.

## 8. How Dr. Ai actually works: RAG

RAG means **Retrieval-Augmented Generation**. The project retrieves eligible repository material and supplies it as context for an existing model. It does not train a new foundation model or automatically scrape the web for each answer.

```text
Question and bounded recent history
    -> identify language, plant names/aliases, topic and follow-up context
    -> retrieve exact/lexical source candidates where available
    -> otherwise generate a query embedding and search pgvector similarity
    -> filter/select relevant published herbs and active KB records
    -> build source-grounded context and safety instructions
    -> generate an answer or return a constrained fallback
    -> validate generation/completion and return source metadata
```

An embedding is a numerical representation of text. Similarity search helps locate conceptually related records, even when wording differs. The code combines plant-name/alias matching, lexical relevance, bounded conversation context and cosine-distance thresholds; not every question calls every retrieval path. A similarity score is **not** a medical confidence percentage.

When no sufficiently relevant source exists, the system uses a cautious no-match response. Embedding/retrieval failure has a separate unavailable-source response. Pediatric/preparation cases have additional constrained handling; a matching plant is not permission to invent a dose for a child.

Generation uses configured Gemini model candidates with timeouts and bounded attempts. Defaults in code include a 90-second request deadline, 15-second model timeout, 4,096 output-token allowance and up to four model attempts; hosted configuration can override bounded values. An output token is not a character or a word. More tokens can reduce truncation but consume more quota and do not establish answer correctness.

The assistant has explicit educational/source-grounding instructions and completion checks, including incomplete/safety-blocked outcomes. These reduce risk; they do not prove zero hallucinations, perfect translation or medical suitability. The supported language heuristics explicitly distinguish English, Tagalog and Cebuano; do not claim verified accuracy in every Philippine dialect.

## 9. AI streaming, failures and credits

The non-streaming endpoint is `POST /api/chat`; streaming is `POST /api/chat/stream`. Both authenticate the user, rate-limit and validate input. The current chat limit is 30 requests per 10 minutes per authenticated user. Input is limited to 1,000 question characters. History retains up to six turns in complete user/model pairs, with per-turn and total character bounds.

SSE events expose sources and answer chunks. A `done` event with completed state is the terminal success signal. An HTTP 200 stream can later emit an error: status 200 at stream startup is not proof of completed generation. Disconnect/deadline handling aborts unfinished work where supported.

Shared failures use `AI_RESPONSE_INCOMPLETE`, `AI_RESPONSE_BLOCKED`, `AI_UNAVAILABLE` or `AI_CREDIT_ERROR`, plus a safe message, retryability and credit status. Authentication, validation and rate-limit failures before the controller have their own contracts.

Credit modes are **off or test only**. When enabled, a UUID idempotency key identifies the attempt, the repository reserves credit, and completion stores the response. A replay of the same completed request can return its original answer without a second debit. Reusing a key for different input is not an authorized new request.

| Credit status on an error | Honest user-facing meaning |
| --- | --- |
| `not_reserved` | This path did not hold a new credit reservation. |
| `released` | The failed attempt's reservation was returned. |
| `recovery_pending` | Immediate release could not be confirmed; wait for reconciliation/recovery. |
| Unknown to the client | Check the authoritative wallet/result instead of guessing. |

PayMongo checkout is constrained to test keys. Payment return-page navigation is not payment proof; webhook/provider reconciliation and unique purchase/ledger operations govern test-credit grants. Do not describe the capstone as accepting real payments.

## 10. What if two users click at the same time?

Node.js can interleave asynchronous requests while database/provider operations are running. They do not have to finish in click order. Correctness depends on the operation's database rules, not solely on JavaScript execution or a disabled UI button.

### Two administrators approve the same suggestion

Both may read revision 3 as Pending. Approval uses a conditional update for that status/revision inside a transaction. One request changes the row and creates the publication/audit; the other no longer matches and is rejected as a conflict. The unique source-suggestion link adds a duplicate-publication boundary. A transaction failure rolls back its related writes.

### Two users like the same thread

The like repository locks the relevant thread row with `FOR UPDATE`, changes the per-user reaction and derives the total from actual reaction rows inside a transaction. Composite keys enforce one reaction per user/target. Different users can each legitimately like it.

### The same user rapidly clicks a toggle twice

Serialization prevents inconsistent totals, but two successful toggle requests can mean like then unlike. A toggle is not inherently idempotent. The frontend's sending-state control reduces accidental repeats; explain the intended semantics rather than promising every duplicate click is ignored.

### Duplicate AI/payment request or reused reset link

AI/purchase request keys and ledger operation keys protect their own duplicate-processing boundaries. Password recovery is consumed conditionally in a transaction, so an already redeemed/expired/revoked token cannot simply be used again.

**Panel answer:**

> The server accepts concurrent requests, but conflicting writes have operation-specific protections. We use conditional revision updates for review, transactions and row locks for reactions, and unique/idempotency keys for credit operations. We tested these boundaries in isolated PostgreSQL. This does not mean unlimited users or that every endpoint has the same concurrency strategy.

## 11. Community, messenger and notifications

Forum public GET routes return eligible threads/comments. Creating content or reacting requires authentication. Deleting content additionally checks author/admin permission as appropriate. Replies validate that the parent belongs to the same existing discussion.

The backend persists comments and their relevant notification records, then emits room events. Reply recipients are selected from the discussion/parent relationship; do not create a notification for a user's own action as if another person replied. New thread likes can notify the author; unlike/self-like paths do not represent new incoming likes.

Thread list/detail reply counts are derived from actual comment records, including retained deleted placeholders. Removing displayed content through soft deletion does not necessarily remove its structural row or reply relationships.

Private messages are persisted with sender and receiver IDs. HTTP history queries limit access to the signed-in user's conversation. Editing/deletion enforce the relevant message ownership rules. Socket authentication validates a current session and joins the user's private room server-side; the browser cannot arbitrarily choose another user's private room.

Sockets deliver events, not permanent storage or guaranteed delivery to offline users. On reconnect, the frontend reads server state again. In-app notifications are saved with recipient/read state and delivered to that user's room. Forum activity notification does not imply that the system emails every reaction.

HTTPS/WSS encrypt transport. Private messaging is not implemented as end-to-end encrypted messaging; authorized server/database access remains possible.

## 12. API groups to recognize

All paths below are under `/api`. This is a study map, not a list of endpoints that anyone may call without permissions.

| Group | Representative requests | Authority |
| --- | --- | --- |
| Auth | `POST /auth/signup`, `/login`, `/refresh-token`, `/logout`; `GET /auth/me` | Validation and appropriate credential/session rules. |
| Verification/recovery | `GET /auth/verify-email`; `POST /auth/forgot-password`, `/reset-password`, `/password-setup`, `/change-password` | Token redemption or authenticated password-settings controls. |
| Google | `GET /auth/google`, `/auth/google/callback` | OAuth state, code and verified ID-token checks. |
| Library | `GET /herbs`, `/herbs/:id`, `/herbs/catalog`; `PUT /herbs/:id` | Public publication filters; writes require admin. |
| Suggestions | `POST /suggest`, `/suggest/:id/resubmit`, `/approve`, `/request-changes`, `/reject` | Submitter ownership or administrator review and revisions. |
| Assistant | `POST /chat`, `/chat/stream` | Auth, limits, input and source/credit controls. |
| Forum | `GET /forum/threads`; `POST /forum/threads/:id/comments`, `/like` | Public reads; authenticated/owned actions. |
| Messaging | `GET /messages/conversations`, `/messages/history/:userId`; `POST /messages` | Current-user conversation authorization. |
| KB | `/knowledge-base` and paged/import workflows | Administrator-managed source-grounded facts. |
| Notifications | `/notifications` | Current account's notification ownership. |
| Admin | `/auth/users`, user ban/unban, `/stats`, `/admin/audit-logs` | Administrative permission. |
| Test credits | `/credits`, `/credits/checkout`, reconciliation, `/credits/webhook` | Current user or signed provider event as applicable. |

The webhook has separate raw-body/signature handling; it is not an authenticated browser form. The backend health endpoint returns a basic running response and does not by itself prove that database, Gemini and email are all healthy.

## 13. Security, performance and honest limitations

- **Origin/CORS:** trusted-origin rules restrict browser access; unsafe requests also inspect Origin/Sec-Fetch-Site. CORS alone is not authorization, and the implementation is not a claim that all non-browser clients are blocked.
- **Headers:** security headers and the frontend baseline CSP reduce selected risks. Inline allowances remain; do not claim a strict nonce CSP or complete XSS immunity.
- **Validation:** schemas reject malformed workflow data; controllers/repositories enforce roles, ownership, status and revisions.
- **Uploads:** one declared JPEG/PNG/WebP image, up to 5 MB, with multipart limits. MIME filtering alone is not a full malware/content scanner.
- **Database:** connection pooling, selected indexes, pagination, bounded inputs and public-herb caching reduce repeated work. Published-herb caches are invalidated by relevant application updates.
- **External calls:** configured deadlines, bounded attempts and safe error feedback prevent some hanging requests; provider availability/quota can still fail.
- **Scaling:** current in-process caches, rate limits and socket invalidation are not a distributed Redis/shared-state design. More instances need deliberate coordination, not just a larger hosting plan.
- **Privacy/logging:** avoid exposing passwords/tokens/provider secrets. Some normalized diagnostics are intentionally bounded; do not claim every existing log is automatically anonymous.
- **Operational readiness:** TLS, credits, provider configuration, backups and restore capability need separate checks. This reviewer does not claim a newly verified backup or recovery drill.

## 14. Testing evidence you can explain

The application release referenced here passed frontend lint/type/build and 548 frontend regressions. Backend CI passed 175 Vitest files with 2,762 tests, 31 native safety checks, and 10 isolated admin/vector acceptance tests. A separate preparation/concurrency gate passed 300 tests; suites may overlap, so do not add all figures and call them unique coverage.

Examples include review races, transaction rollback, session/recovery boundaries, notification/like persistence, API authorization, upload/validation errors and AI failure/credit recovery. Real PostgreSQL tests use CI service containers with pgvector, not the production Neon database. Tests show expected outcomes under the tested conditions; they are not production load-test capacity figures.

Controlled mailbox verification/reset delivery was confirmed separately. Live browser inspection checked console/network/Issues and preserved the real admin session. It observed successful refresh-token recovery after an expired-session 401. Third-party cookie notices were classified separately rather than counted as backend exceptions.

## 15. Panel questions and suggested answers

**Q: Why PostgreSQL and Prisma?**

A: We need related accounts, submissions, publications, conversations and constraints. PostgreSQL supplies relational integrity and transactions, while pgvector supports embedding search. Prisma provides typed queries/migrations; raw vector/locking SQL is used where appropriate.

**Q: Is the AI trained by your team?**

A: We integrate an existing Gemini model. Our work includes the repository, retrieval and safety/workflow integration. RAG supplies relevant records at request time; it is different from training model weights.

**Q: Why use both exact names and vector search?**

A: Exact names/aliases preserve specific plant identity; semantic retrieval helps differently worded questions. Relevance filters prevent simply using the nearest record when it is not sufficiently related.

**Q: Are your sources a guarantee of medical accuracy?**

A: No. We preserve references and evidence boundaries, but reviewed traditional use is not proof of clinical efficacy or patient-specific safety. The assistant is educational and advises professional consultation for medical decisions.

**Q: What prevents a contributor from publishing their own herb?**

A: Submission and publication are different records/workflows. Publication requires admin authorization, current revision/status, reference coverage and a reviewed decision in a transaction.

**Q: What happens if email fails after Request Changes?**

A: The decision remains saved, and delivery results are reported separately. The contributor can still access their submission through the application; the admin should not assume mailbox receipt or repeat the review action blindly.

**Q: Does the edit link allow anyone to change a submission?**

A: No. It contains a record ID for navigation. The server requires the owning user's authenticated session and the appropriate current status.

**Q: How do you keep two admin approvals from creating duplicate herbs?**

A: Conditional status/revision updates and linked publication creation happen transactionally, with a unique source-suggestion relationship. Only the successful matching review proceeds; a stale request receives a conflict.

**Q: What if an AI response is cut off?**

A: Completion/stream checks do not treat partial output as success. The response identifies the failure and credit state; the frontend restores the draft and avoids claiming a refund when recovery is pending.

**Q: Why not just retry an uncertain credit request with a new ID?**

A: A new ID can represent a second operation. We first reconcile the original result/wallet; completed-request replay uses the original key without another debit.

**Q: Why is a JWT not enough after banning or password reset?**

A: A previously signed JWT may not yet be expired. Current account/session-version checks and token revocation prevent continuing to trust an obsolete credential.

**Q: Is a password encrypted in the database?**

A: It is hashed with salted bcrypt, not reversibly encrypted. Login compares an entered password against the hash; we cannot recover the original password from the intended workflow.

**Q: Is administrator logging immutable?**

A: It records selected administrator actions, often with the related transaction. It is not a tamper-proof external ledger, and direct database operations are outside that application's audit coverage.

**Q: Can you remove every test account safely?**

A: Only after identifying it and understanding its relations. Some deletes cascade and some credit relations restrict deletion. We back up scoped records and often disable accounts to preserve audit history instead of deleting blindly.

**Q: How many simultaneous users can the system handle?**

A: We can explain the configured pool, limits and tested concurrency boundaries. We have not established an unlimited-user capacity; a defensible number requires a controlled load test with its environment and results stated.

**Q: Is the credit checkout using real money?**

A: No. The implementation accepts off/test modes and test provider keys. Real-payment operation would need additional configuration, verification and operational review.

**Q: What is your main reliability limitation?**

A: The app depends on hosting, database connectivity, AI quota and mail delivery. We use bounded work and clear recovery states, but need a backup demonstration and cannot guarantee these providers will always be available.

## 16. Source map for detailed follow-up

The first path in each row identifies the application directory. Subsequent `src/` paths in that row are relative to `herbalaibackend/`. Root workflow paths are relative to the repository root.

| Topic | Repository files |
| --- | --- |
| HTTP/server startup | `herbalaibackend/src/app.ts`, `src/server.ts`, `src/index.ts` |
| Endpoint map | `herbalaibackend/src/routes/index.ts`, `src/routes/*.routes.ts` |
| Database schema/pool | `herbalaibackend/prisma/schema.prisma`, `src/lib/prisma.ts` |
| Authentication and Google | `herbalaibackend/src/services/auth.service.ts`, `src/controllers/auth.controller.ts`, `src/lib/access-session.ts` |
| JWT/password/token operations | `herbalaibackend/src/utils/jwt.ts`, `src/utils/password.ts`, `src/repositories/token.repository.ts` |
| Validation, origin and roles | `herbalaibackend/src/schema/auth.schema.ts`, `src/middlewares/request-origin.middleware.ts`, `src/middlewares/role.middleware.ts` |
| Review and revision transactions | `herbalaibackend/src/repositories/suggest.repository.ts`, `src/controllers/suggest.controller.ts`, `src/schema/suggest.schema.ts` |
| Public-herb filtering/cache | `herbalaibackend/src/repositories/herb.repository.ts` |
| RAG and generation | `herbalaibackend/src/services/ai/chat/ask-ai-service.ts`, `src/services/ai/core/gemini-service.ts`, `src/config/drAiSystemPrompt.ts` |
| AI streaming/completion | `herbalaibackend/src/controllers/chat.controller.ts`, `src/services/ai/core/response-completion.ts`, `src/services/ai/core/request-lifetime.ts` |
| Credits and payment test mode | `herbalaibackend/src/repositories/credits.repository.ts`, `src/config/credits.ts`, `src/controllers/credits-webhook.controller.ts` |
| Forum concurrency and notifications | `herbalaibackend/src/repositories/forum.repository.ts`, `src/controllers/forum.controller.ts` |
| Messages and socket boundary | `herbalaibackend/src/controllers/message.controller.ts`, `src/lib/socket-boundary.ts`, `src/server.ts` |
| Mail and request-changes link | `herbalaibackend/src/lib/mailer.ts`, `src/lib/suggestion-review-email.ts` |
| Shared workflow states | `herbalaibackend/src/contracts/workflow-contracts.ts`, `src/lib/password-capability.ts` |
| Automated evidence | `herbalaibackend/tests/`, `.github/workflows/ci.yml`, `.github/workflows/herb-preparation-ci.yml` |

**Remember:** an effective backend answer explains the request, the rule, the data operation and the failure outcome. Avoid claiming protections or capacity that the implementation and tests do not establish.
