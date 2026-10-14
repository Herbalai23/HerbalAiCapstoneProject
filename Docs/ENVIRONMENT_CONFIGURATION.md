# Private environment configuration

Environment files, including `.env.example`, are intentionally not distributed in this repository. Keep real values in Railway/Vercel's protected settings or in locally created, Git-ignored `.env` files. Do not paste them into issues, screenshots, reviews, logs or committed documentation.

## Backend

Create `herbalaibackend/.env` privately for local development, or set variables directly in Railway. For Docker Compose, create a private root `.env` using the variable names required in `docker-compose.yml`; restrict it to the deployment owner. Do not copy a production database or credential into an isolated test environment.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Private PostgreSQL connection string; preserve certificate validation for hosted databases. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Separate cryptographically random signing keys, at least 32 characters each in production. Generate them privately; never reuse placeholders. |
| `NODE_ENV`, `PORT` | Execution mode and backend listening port. |
| `FRONTEND_URL`, `BACKEND_URL` | Public application origins. These are not credentials. |
| `FRONTEND_ADDITIONAL_ORIGINS` | Explicit approved additional frontend origins, if required. |
| `GEMINI_API_KEY` | Private AI provider credential. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Private administrator bootstrap identity, required only for deliberate seeding. Never seed against production as part of a test. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Optional Google sign-in configuration; preserve the existing production callback. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Optional image-upload provider configuration. |

Production refuses missing, short, placeholder or identical JWT signing keys. Development/test processes generate random ephemeral keys only when keys are omitted. Such sessions expire on restart; configure private local keys when persistent local sessions are needed. Existing configured keys are not automatically rotated by this code.

## Email delivery

Use `EMAIL_DELIVERY_MODE=log` locally to prevent unintended email delivery. Controlled mailbox tests can use `allowlist` with `EMAIL_ALLOWED_RECIPIENTS`. Production uses `live` and requires a configured provider. Keep `REQUIRE_EMAIL_VERIFICATION=true` when delivery is ready.

| Provider | Required configuration names |
| --- | --- |
| Gmail API (`EMAIL_PROVIDER=gmail`) | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER_EMAIL` |
| Resend (`EMAIL_PROVIDER=resend`) | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| SMTP (`EMAIL_PROVIDER=smtp`) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` |

All private client secrets, refresh tokens and passwords belong only in protected runtime settings. Email provider acceptance is not proof of Inbox delivery; use a permitted inbox test to confirm receipt.

## Frontend

Only public connection settings belong in `herbalaifrontend/.env.local` or Vercel: `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOCKET_URL`. Never prefix credentials with `NEXT_PUBLIC_`; these values are embedded in browser code. Rebuild after changing the public connection URLs.

## Optional tuning and test payments

Available tuning names are defined in the backend runtime configuration, including `herbalaibackend/src/config/env.ts`: `HERB_CACHE_TTL_MS`, `AUTH_USER_CACHE_TTL_MS`, `AUTH_USER_CACHE_MAX_ENTRIES`, `SLOW_REQUEST_THRESHOLD_MS`, `DR_AI_MAX_COSINE_DISTANCE`, `DR_AI_CHAT_MODELS`, `DR_AI_MAX_OUTPUT_TOKENS`, the `DR_AI_*TIMEOUT_MS` values, `DR_AI_MAX_MODEL_ATTEMPTS`, `DR_AI_MODEL_COOLDOWN_MS`, and the bounded `DB_POOL_*` settings plus `DB_TRANSACTION_MAX_WAIT_MS`. Code defaults are authoritative; do not import old deployment-template defaults.

Test-credit configuration uses `DR_AI_CREDITS_MODE`, `DR_AI_TRIAL_CREDITS`, `DR_AI_CREDIT_PACKAGES`, `PAYMONGO_TEST_SECRET_KEY` and `PAYMONGO_TEST_WEBHOOK_SECRET`. Leave credit mode off unless deliberately enabling the supported sandbox workflow. Never substitute live payment credentials.

Isolated CI uses synthetic credentials for an ephemeral loopback database. Synthetic fixture values and public taxonomy/citation identifiers are not production credentials and must not be reused as such.

## Repository checks

Run `node scripts/repository-security.mjs` before committing to reject tracked environment files, private-key files and recognizable provider credentials without printing secret values. Provider-pattern checks cannot prove that every possible secret has been detected; investigate any exposed credential and rotate it at its provider. Removing a file from the current tree does not erase its Git history. Coordinate history rewrites separately and never force-push production branches as routine cleanup.
