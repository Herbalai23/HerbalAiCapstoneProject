# Start here: Herbal-Ai's project map

This guide is for teammates who are not confident reading code. Start with the symptom, not with every file.

## What changed, and what did not

The organization follows the patterns in [Kainara's demo branch](https://github.com/Chimairel/Kainara/tree/demo), reviewed at commit `95693ec97ed4e902c0b6fbe9b42db9b0c7fbc323`: a frontend `src` folder, thin grouped routes, feature folders, shared controls, and layered backend workflows/domain rules.

We kept the deployment roots named `herbalaifrontend` and `herbalaibackend`. Renaming them would require separate Vercel/Railway configuration work. Existing page addresses, API endpoints, database schema, email templates and Gemini's layout are preserved.

This is a structural refactor, not a new product. Admin's six tab views live in `features/admin/sections`. `AdminScreen.tsx` assembles the sidebar, dialogs and sections; `useAdminWorkspace.ts` owns state, loading, filters and session handling. Four `features/admin/actions` modules handle review, herbs, knowledge-base and users. Messenger separates its screen, state hook, socket-lifecycle hook, types and display helpers. Suggestions separates its unchanged screen from `useSuggestionSubmission.ts` (fields, requests, uploads, revision links and list refresh). Each of these feature folders has a small debugging README.

## Three ideas to remember

1. **Frontend = what the user sees.** Screens, buttons, forms and displayed messages.
2. **Backend = what the system permits and does.** Validation, authentication, AI workflows, notifications and saved records.
3. **Database = stored information.** Do not edit or delete tables to repair a screen.

An HTTP request is the frontend asking the backend to do something. Its status tells you whether it succeeded. The database is usually not the first place to debug.

## Folder map

```text
herbalaifrontend/
  src/
    app/                       Website addresses and root styles/layout
      (public)/                Home, About, Library, Community, Sources, Privacy
      (auth)/                  Sign in/up, email verification and password recovery
      (member)/                Dr. Ai, Messenger, Credits and Suggestions
      (admin)/                 Admin entry point
      api/auth/google/complete/ Google callback forwarding
    features/                  Actual screens and feature-specific helpers
    components/
      core/                    Navbar, Footer, BrandMark, theme and PWA
      shared/                  Dialogs, images, empty/error states
      ui/                      Buttons, inputs, cards, badges, alerts
    lib/
      context/AuthContext.tsx  Current user and session actions
      axios.ts                 Shared backend connection and refresh handling
      request-cache.ts         Short-lived browser request caching
    validation/                Registration name validation
    data/                      Regional plant-name reference data
    proxy.ts                   Existing protected-page cookie checks
  public/                      Public images, icons, favicon and service worker
  scripts/                     Frontend-specific regression tests

herbalaibackend/
  src/
    routes/                    API addresses
    middlewares/               Login, role, validation and request guards
    controllers/               Read requests; return HTTP responses
    services/                  Carry out workflows
      auth.service.ts          Stable entry to the authentication workflows
      auth/
        registration.ts        Create local accounts and send initial verification
        password-auth.ts       Login, password setup/change/reset and reset emails
        email-verification.ts  Verify email and resend verification
        google-auth.ts         Existing Google sign-in workflow
        sessions.ts            Refresh and logout
      ai/                      Existing Dr. Ai and knowledge-base workflows
    domain/                    Account-ban and password-capability rules
    repositories/              Read/write database records and transaction boundaries
    schema/                    Validate API input
    contracts/                 Shared workflow response meanings
    lib/                       Database/provider/email/socket infrastructure
    config/                    Environment and connection settings
  prisma/                      Database schema, migrations and explicit data tools
  tests/                       Backend regressions

scripts/                       Cross-project regressions and deployment tools
.github/workflows/             Automated CI gates
Docs/                          Existing operations, research and acceptance documents
```

Parentheses in `(auth)` and other route folders are organizational only. They do not appear in the browser address and do not replace backend permissions.

## Symptom → files to check

All frontend paths below are inside `herbalaifrontend/src`; backend paths are inside `herbalaibackend/src`.

| What is wrong? | Frontend starting point | Backend starting point |
| --- | --- | --- |
| Home page content | `features/home/HomeScreen.tsx` and nearby Home components | Public herb data: `controllers/herb.controller.ts` |
| Header/footer, mobile menu, theme | `components/core/Navbar.tsx`, `Footer.tsx`, `DisplayPreferences.tsx`; styles: `app/globals.css` | Usually none unless user/session data is wrong |
| Sign in or session refresh | `features/auth/SignInScreen.tsx`, `lib/context/AuthContext.tsx`, `lib/axios.ts` | `controllers/auth.controller.ts` → `services/auth/password-auth.ts` or `sessions.ts` |
| First/last-name validation | `features/auth/SignUpScreen.tsx`, `validation/registration-name.ts` | `schema/auth.schema.ts` → `services/auth/registration.ts` |
| Verification email | `features/auth/VerifyEmailScreen.tsx` | `services/auth/registration.ts`, `email-verification.ts` → `lib/mailer.ts` |
| Forgot/reset/set password | `features/auth/ForgotPasswordScreen.tsx`, `ResetPasswordScreen.tsx`, `features/account/PasswordSettings.tsx` | `services/auth/password-auth.ts`; capability: `domain/password-capability.ts` |
| Google sign-in | `features/auth/GoogleSuccessScreen.tsx`, `app/api/auth/google/complete/route.ts` | `services/auth/google-auth.ts`; callback transport in `controllers/auth.controller.ts` |
| Dr. Ai stops or shows an error | `features/chat/ChatScreen.tsx`, `dr-ai-stream.ts` | `services/ai/chat/ask-ai-service.ts`, `services/ai/core/response-completion.ts` and `routes/chat.routes.ts` |
| Library cards, herb details/comments | `features/library/LibraryScreen.tsx`, `HerbComments.tsx`, `HerbReferences.tsx` | `controllers/herb.controller.ts` and `repositories/herb.repository.ts` |
| Forum posts, replies, likes | `features/community/CommunityScreen.tsx`, `ThreadDetailScreen.tsx`, `forum-comments.ts` | `controllers/forum.controller.ts` and `repositories/forum.repository.ts` |
| Bell notifications | `features/notifications/NotificationBell.tsx`, `notification-state.ts` | `controllers/notification.controller.ts`, `repositories/notification.repository.ts` |
| Private chat | Layout: `features/messenger/MessengerScreen.tsx`; history/send/search: `useMessengerState.ts`; socket reconnect/cleanup: `useMessengerConnection.ts`; ordering/reconciliation: `messenger-sync.ts` | `controllers/message.controller.ts`, `repositories/message.repository.ts` |
| Submission/history or request changes | `features/suggestions/SuggestHerbScreen.tsx` for display, `useSuggestionSubmission.ts` for form/list requests, `SuggestionReviewEditor.tsx` for admin review fields; decision: `features/admin/actions/review-actions.ts` | `controllers/suggest.controller.ts`, `repositories/suggest.repository.ts`, `lib/suggestion-review-email.ts` |
| Admin dashboard or knowledge base | Views: `features/admin/sections/DashboardSection.tsx`, `KnowledgeBaseSection.tsx`; loading/state: `features/admin/useAdminWorkspace.ts`; saving/import: `features/admin/actions/knowledge-base-actions.ts` | `controllers` and `services/ai/knowledge-base` for the failing endpoint |
| Credits/refund display | `features/credits/CreditsWallet.tsx`, `features/chat/ChatScreen.tsx` | `services/credit-chat.service.ts`, `contracts/workflow-contracts.ts` |
| Sources/About links | `features/sources/SourcesScreen.tsx`, `features/about/AboutScreen.tsx`, `lib/external-links.ts` | Herb citation data in `repositories/herb.repository.ts` |

If a page file contains only `export { default } from ...`, follow that path. The actual screen is in `features`. An import starting `@/` means “start at the frontend `src` folder.”

### Admin: which file?

Inside `features/admin/sections`, `SuggestionsSection.tsx` contains the review queue, `HerbsSection.tsx` the herb list, `UsersSection.tsx` user search/filter/cards, and `AuditLogsSection.tsx` the audit display. Change what appears in these sections; check `useAdminWorkspace.ts` when loading, filters or session state fails. The sections receive data and callbacks and do not contact the database/API themselves.

Inside `features/admin/actions`, `review-actions.ts` handles approve/reject/request-changes, `herb-actions.ts` handles herb edit/delete, `knowledge-base-actions.ts` handles fact forms/save/import/toggles, and `user-actions.ts` applies returned ban results and copy feedback. These modules receive the current state and callbacks from the workspace hook; they do not create a second store or change backend permissions. Shared API-error display is in `admin-feedback.ts`.

For a short Admin-only troubleshooting table, open `features/admin/README.md`.

## How one request travels

```text
User clicks a button
  → Feature screen validates and submits through the shared API client
  → Backend route chooses its controller
  → Middleware checks session, permissions and input
  → Controller passes validated data into the workflow/repository
  → Repository reads/writes permitted database records
  → Controller returns success/error data
  → Feature screen displays the result
```

Some existing controllers call repositories directly; this refactor did not invent extra service wrappers around those calls. Email, Google, AI and sockets are external dependencies with their own failure modes.

## A safe five-minute debugging routine

1. Write down the page address, clicked action, account role and exact visible error. Never record passwords, cookies, verification/reset links or tokens.
2. Open Chrome Inspect → **Console**. Reproduce once. Record the first relevant red error, not every informational PWA notice.
3. Open **Network**, filter **Fetch/XHR**, and inspect the failing request's path, status and response message. Do not share authorization headers or a raw HAR containing account data.
4. Use the table above. Screen-only problems start in the frontend; rejected requests start in the backend controller and its guards.
5. Recheck the same action and Console after a small fix. Try signed-out access and the relevant role, not just an administrator.

| Result | Meaning / next check |
| --- | --- |
| No request appears | Button/form logic, browser validation or disabled-state rules. |
| 400 | Submitted input was rejected. Read the response message and matching schema. |
| 401 | Missing/expired authentication. A successful refresh-and-retry can be expected; a repeated failure is not. |
| 403 | The account is not permitted, banned or requires verification. Do not bypass the guard. |
| 404 | Wrong route or unavailable record; compare the request path with its backend route. |
| 409 | The record/session changed or the operation conflicts. Re-read before retrying. |
| 429 | Rate limit or cooldown. Do not repeatedly submit to force it through. |
| 500/503 | Server/provider failure. Check sanitized backend logs, not production credentials. |
| 200 but the display is stale | Check response data, state updates, cached requests or socket events. |

“Current password is incorrect” is a validation result, not automatically a defect. Request Changes needs the existing minimum review-note length. Registration still requires each first/last name to contain 5–10 letters under the existing validation rules.

For Dr. Ai, inspect its streamed response events as well as the HTTP status: a stream can start successfully and later report an application error. Never promise a completed refund when the shared contract says recovery is pending.

## Editing rules that keep debugging manageable

- Put a screen's own UI/helpers beside it in its feature folder.
- Put a genuinely reused visual control in `components/shared` or `components/ui`.
- Keep `app/**/page.tsx` as a thin URL entry, with route metadata when needed.
- Keep authorization and database constraints on the backend even when the frontend validates too.
- Keep pure account rules in `domain`; email/database/socket clients stay in `lib`.
- Keep public API names stable while splitting workflows. The authentication facade does this.
- Do not rename database tables, edit production data or change hosting settings as a “folder cleanup.”
- Do not remove tests merely because an implementation file moved; update their source paths and keep their assertions.

## Low-quota checks

From the repository root, `node --test scripts/architecture.test.mjs` checks the folder boundaries, imports, route inventory and thin entries. Install either application's TypeScript dependencies first. This check does not connect to Neon.

From each application folder, run `npm run lint` and `npx tsc --noEmit`. From the frontend folder, also run `npm run build`. After structural moves, stale ignored `.next` output can refer to old paths; regenerate the local build cache rather than changing valid source to satisfy stale types.

CI continues running the existing regression suites and adds the architecture guard. Database acceptance belongs on an explicitly isolated local/CI database. Never run migrations, seed/import tools or broad database tests against Neon just to check this refactor.

## Deployment status

A successful local build is not a deployment. This refactor remains local until an explicitly approved commit/release passes the full CI gate and public/admin browser checks. Do not overwrite Gemini's newer commits or unrelated review documents during release.
