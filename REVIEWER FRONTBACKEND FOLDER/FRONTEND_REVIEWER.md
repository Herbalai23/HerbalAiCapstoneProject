# Herbal-Ai Frontend Defence Reviewer

Prepared: 12 October 2026. Code reference: `b74cae4`. Read this independently of the backend reviewer.

## 1. What the frontend does

The frontend is the part people see and interact with: navigation, plant cards, forms, conversations, notifications and administrator screens. It collects input, makes API requests, and presents the server's response as a loading, success, empty or error state.

**Thirty-second answer:**

> Our frontend uses Next.js, React and TypeScript. It presents the medicinal-plant library, Dr. Ai, community, messenger and administrator workflows. React state updates the interface after API responses or socket events. We validate input for usability, but permissions and final validation are enforced by the backend.

The frontend is not the database, is not the AI model, and cannot grant a user administrator rights just by showing a button.

## 2. Technologies and why they are used

| Technology | Actual role in Herbal-Ai | A simple explanation |
| --- | --- | --- |
| Next.js 16 App Router | File-based routes, shared root layout, builds, headers and API rewrites | Each page has a route; common setup can be shared. |
| React 19 | Interactive components and state-driven rendering | When state changes, the relevant interface updates. |
| TypeScript | Types for users, records, events and component props | It catches many programming mistakes before running the app. |
| Tailwind CSS 4 and project CSS | Utility classes, theme tokens and responsive styles | They keep spacing, colours and breakpoints consistent. |
| Axios | Credentialed API calls and coordinated session refresh | It centralizes request handling instead of repeating it on every page. |
| Browser Fetch/ReadableStream | Dr. Ai server-sent event parsing | The answer can arrive in chunks rather than all at once. |
| Socket.IO client | Forum, message and notification events | Connected browsers can receive updates without a manual refresh. |
| Zod | Runtime validation of credit-related responses | Server data still needs checking after TypeScript compilation. |
| Recharts | Administrator dashboard charts | It visualizes totals returned by the API. |
| Lucide icons, locally bundled fonts | Consistent icons and typography | These improve readability without defining business permissions. |
| Manifest and service worker | PWA installation and selected static-asset caching | The website can have an app-like launcher and reuse cached assets. |

TypeScript checks code during development; it does not automatically validate everything received over the network. Runtime checks and backend validation are still necessary.

## 3. Page and component map

| Area | Route | What the user does |
| --- | --- | --- |
| Home | `/` | Understand the project and enter the library or assistant. |
| Library | `/library` | Search/filter published herbs and open their records and discussions. |
| About and evidence | `/about`, `/sources`, `/privacy` | Read purpose, source methodology and privacy information. |
| Account access | `/signup`, `/signin` | Create an account or sign in locally or through Google. |
| Recovery | `/verify-email`, `/forgot-password`, `/reset-password` | Redeem verification/recovery links and follow server outcomes. |
| Dr. Ai | `/chat` | Ask educational questions and read linked sources. |
| Community | `/community`, `/community/new`, `/community/[id]` | Browse/start discussions, like and comment/reply. |
| Messenger | `/messenger` | Find a contact and exchange private messages. |
| Suggestions | `/suggest` | Submit a herb, review status, and revise a requested submission. |
| Credits | `/credits` | Inspect the configured test-credit wallet and supported test checkout. |
| Admin console | `/admin` | Review suggestions, manage records/users/KB, inspect charts and audit logs. |

Shared components include `Navbar`, `Footer`, `NotificationBell`, `AccessibleDialog`, `ProfileEditorModal`, `PasswordSettings`, `HerbReferences`, `HerbComments` and `SuggestionReviewEditor`. Reusing components keeps the same behaviour and vocabulary across screens.

Most interactive pages/components use `'use client'` because they need browser events, hooks or storage. The root layout supplies fonts, global styling, display preferences, PWA setup and `AuthProvider`. Do not claim every page is server-rendered or that every page is a client component.

## 4. How a click becomes a working feature

Example: searching for Lagundi in the library.

1. The user enters a search term in a labelled input.
2. The page records the input in React state.
3. The page requests library data through `/api/herbs` with the relevant filters.
4. Next.js forwards `/api` to the configured Express backend.
5. The backend retrieves eligible records and responds with JSON.
6. The frontend updates the displayed cards and result count.
7. If no records match, it shows an empty result rather than pretending the network failed. A failed request is handled separately.

The browser does not connect directly to Neon. It requests data from the backend. The backend is responsible for deciding which records may be returned.

## 5. State and hooks: explain them confidently

- **Props:** values passed from a parent component to a child, such as a record, loading flag or callback.
- **`useState`:** interface data that should trigger rendering, such as search text, the open dialog, messages or a loading state.
- **`useEffect`:** starts and cleans up outside subscriptions, such as socket listeners or visibility listeners.
- **`useRef`:** mutable information that persists across renders without causing a render, such as a socket, request controller or current contact.
- **`useMemo`:** derives a value from dependencies, such as ordered comments or filtered notification categories.
- **`useCallback`:** stabilizes a function used by effects or child components.
- **Context:** makes shared session data available through `AuthProvider` and `useAuth`, avoiding repeated manual prop passing.

Cleanup matters. An old socket listener or an old request must not update the screen after the user changes contacts, changes accounts or leaves the page. Messenger helpers merge records by identity and guard against stale responses.

## 6. Authentication and account settings

### Session startup and login

`AuthProvider` checks `/auth/me` and maintains the user, loading and session-unavailable states. The interface waits for the session check rather than immediately assuming everyone is signed out.

Local login sends a username/email identifier and password to `/auth/login`. On success, the frontend displays the returned user and clears stale cached reads. Ordinary requests include cookies through `withCredentials`.

When an access token expires, Axios coordinates a refresh instead of launching an independent refresh for every failed request. Waiting requests retry after refresh succeeds. Session-generation checks reject responses from a previous login/logout boundary. An outage is not automatically treated as proof that the account logged out.

### Signup rules

The current custom signup requires first and last names with **5–10 letters each**, normalized for Unicode. Numbers, punctuation and internal spaces are not accepted in these fields. Username rules differ: 3–30 alphanumeric/underscore characters. Signup requires a password of at least eight characters.

The frontend provides immediate feedback; the backend independently validates the request. These registration-name rules do not mean every display name, legacy name or Google-provided profile is restricted identically. Short or multi-part real names are a current product-policy limitation, not evidence of a fake user.

### Google sign-in and optional local password

Google login redirects to the OAuth workflow; the frontend does not receive or change the user's Google password. Account settings use server-reported password capability:

- `set`: a local Herbal-Ai password exists; show Change Password.
- `unset`: show No password set and the optional Set Password workflow.
- `unknown`: avoid assuming a legacy account has no password; present an appropriate recovery/setup choice.

Set Password requests a secure email link. Changing an existing password requires the current Herbal-Ai password. A successful password change/reset invalidates existing sessions. The password form's hidden username input assists autofill without adding a visible field.

## 7. Dr. Ai from the frontend's perspective

1. The user types a question. The page rejects empty input and tracks the sending state.
2. The client sends the question and bounded conversation history to `/api/chat/stream`.
3. Fetch includes credentials and a UUID `X-Idempotency-Key` for this attempt.
4. The stream parser handles `sources`, `chunk`, `done` and terminal errors.
5. Chunks progressively update the answer, while citations point users back to repository records.
6. A response is completed only after the terminal completion signal. A closed stream is not automatically a successful answer.
7. On failure the draft is restored. Credit feedback distinguishes released, not reserved, pending recovery and unknown outcomes.

The current API accepts up to six retained history turns, arranged as complete user/model pairs. This is bounded conversational context, not unlimited memory or training on the user's conversation. The chat page's in-memory history is different from persistent private messenger records.

**Do not say:** “The frontend generates the medical answer,” or “If it starts displaying text, the AI has succeeded.” Generation and completion validation happen on the backend.

## 8. Forum, messenger and notifications

### Forum

Thread comments are ordered newest-first with a deterministic identity tie-break. The page joins the thread's socket room and receives `forum:comment` events. Received records are merged into local state, so connected viewers can see new comments without refreshing.

Likes, replies and deletions still use authorized API requests. A disabled button prevents accidental duplicate clicks in that browser, but the backend must protect concurrent writes. Reply totals now use actual comment records, including retained deleted placeholders, rather than trusting a historical counter.

### Messenger

The initial conversation/history reads use HTTP. Socket events then deliver `private_message`, `message_edited` and `message_deleted` updates. History is paged, and older messages are fetched on demand. Reconnect/focus/visibility recovery resynchronizes with the server because disconnected sockets can miss events.

Selecting a user does not make their whole database record public. The backend determines the allowed contact/profile fields and authorized message history. Messages are access-controlled and transported over HTTPS/WSS; do not call this end-to-end encryption.

### Notifications

The bell fetches persistent notifications and receives socket notifications for the signed-in user. It tracks unread/read state and refreshes on reconnect/focus. Community likes/replies and direct messages can appear there. Browser autoplay rules can affect sounds; a sound is not proof of delivery.

Not every in-app notification is also an email. Verification, password recovery and suggestion-review email are specific server workflows. Normal forum reactions should not be described as guaranteed email delivery.

## 9. Suggestion and administrator UI

Suggested herbs are submitted as multipart form data, with an optional image. My Submissions distinguishes Pending, Changes Requested, Approved and Rejected. Approved/rejected records stay Active for 24 hours after review, then appear in History. **History is a view, not automatic deletion.** The backend supplies eligibility and counts.

For requested changes, `/suggest?edit=<id>` opens the contributor's own revision workflow. They sign in, read the notes, edit the submission and resubmit. An email link is navigation, not permission to edit another account's record.

Admin review requires source references and an evidence classification before publication. Request Changes needs at least ten characters of reviewer notes. Review requests include a revision number; if another administrator already changes the record, the UI should report the conflict and refresh instead of displaying a false success.

Admin sections are Dashboard, Suggestions, All Herbs, Users, Knowledge Base and Audit Logs. The user-management layout remains Gemini's design. Editor metadata/labels were repaired without redesigning it. A ban dialog asks for type/duration/reason and confirmation; merely opening it does not ban anyone.

## 10. Accessibility, responsiveness and PWA

- Label form inputs; connect separate labels with `htmlFor`/`id`.
- Give icon-only controls accessible names. Keyboard users need visible focus and appropriate button/link semantics.
- Accessible dialogs handle focus and dismissal; focus must not disappear into the background.
- Loading, empty and error states should explain what happened and provide a sensible next action.
- Use responsive layouts and theme tokens; test actual scroll/navigation instead of relying on one narrow screenshot.
- The service worker caches selected same-origin static assets. It does **not** cache all pages, API responses, private history or AI answers for offline use.
- The custom PWA installation flow intentionally intercepts `beforeinstallprompt`. Its “Banner not shown” console message is informational, not a JavaScript exception.

## 11. Inspect Console, Network and Issues

Check these after changing or demonstrating a feature:

| Inspect area | What to look for | How to explain it |
| --- | --- | --- |
| Console | Exceptions, failed effects, hydration warnings, CSP violations | Trace the action and source; do not hide the message as a fix. |
| Network | API status, response shape, duplicates, timing and socket failures | A 401 followed by refresh 200 and retried 200 can be successful recovery. |
| Issues | Form metadata, cookie policy, deprecations and security findings | Classify the issue; the badge count is not a count of broken features. |
| Elements/accessibility | Labels, accessible names, overflow and focus | An attractive control can still be inaccessible. |
| Security | Valid HTTPS and insecure resource problems | A trusted certificate alone does not prove every application feature is secure. |

The last release's live check covered 20 public/admin views/dialogs. No runtime exceptions or CSP violations were captured. Repeated Cloudinary cookie notices remained, and one unidentified cache-miss observation did not reproduce when the editor reopened. Do not claim the browser had absolutely no notices or that every future session must be identical.

The frontend now sends an enforcing baseline CSP without production `unsafe-eval`. Inline scripts/styles remain permitted for the current rendering architecture, so this is not a strict nonce-based policy. Credit-schema validation uses Zod's `jitless` mode to avoid dynamic-code compilation under that policy.

## 12. Panel questions and suggested answers

**Q: Why use Next.js instead of plain HTML?**

A: We need routed pages, reusable React components, interactive state and a deployable build. Next.js also supplies shared layout, response headers and API forwarding. Plain HTML alone would not organize these interactive workflows in the same way.

**Q: What is the difference between frontend validation and backend validation?**

A: Frontend validation helps the user correct mistakes quickly. Backend validation is authoritative because someone can bypass our form and call the API directly.

**Q: How do you prevent someone from opening `/admin` manually?**

A: The UI checks session/role to guide navigation, but that is not the security boundary. The backend authenticates every protected request and enforces administrator permissions.

**Q: Why does a comment appear without refresh?**

A: After the server saves it, a socket event reaches browsers subscribed to that discussion. React merges the comment into state and renders it. Reconnection is still needed after network loss.

**Q: Is the assistant using the same real-time mechanism as Messenger?**

A: No. The assistant streams an HTTP SSE response. Messenger uses Socket.IO events together with HTTP history reads.

**Q: What if two people click at the same time?**

A: Their browsers send separate requests. The frontend cannot guarantee write correctness; backend transactions, conditional revision updates and unique constraints handle the specific operation. Loading/disabled controls only reduce accidental repeats in one interface.

**Q: What happens if the API is unavailable?**

A: We show a request/session-unavailable state with appropriate recovery, rather than treating missing data as an empty successful result. A temporarily failing session check does not automatically clear a valid user.

**Q: Why can Google-only users not enter a current Herbal-Ai password?**

A: They may not have one. We use the server's capability state and offer an email-link setup option instead. Their Google password remains separate.

**Q: Why not automatically retry every failed AI question?**

A: A failed connection can leave completion or credit status uncertain. We restore the draft and reconcile the result/wallet before a user-confirmed retry, preventing misleading refund claims or repeated charging.

**Q: Is PWA installation the same as a fully offline app?**

A: No. We cache selected static assets. Authentication, database reads, live messages and AI still need network access.

**Q: Are all 100 browser Issues system bugs?**

A: No. Issues include repeated third-party-cookie notices for image requests. We distinguish them from exceptions, failed application requests and blocked resources, while retaining meaningful findings for review.

**Q: Does the frontend hold provider secrets?**

A: Gemini, database and email credentials belong on the backend. `NEXT_PUBLIC_*` values are public configuration, such as the API/socket address, and must never contain secrets.

**Q: Does responsive mean you tested every phone?**

A: No. It means the layout adapts to viewport sizes; device testing is separate evidence. We should describe the actual tested screens/devices, not claim universal coverage.

## 13. Frontend demo rehearsal

1. Open the home page over HTTPS. Explain the educational boundary.
2. Search a known herb and show preparation, safety and sources.
3. Sign in and show the session-aware navigation.
4. Ask one supported educational AI question; identify sources and completion/error behaviour.
5. Show a discussion with newest-first comments. Use approved test users only if demonstrating a new reply.
6. Show submission statuses and explain the 24-hour History rule without deleting data.
7. Open admin sections and one editor; explain linked labels, validation and revision conflicts. Do not publish a dummy herb.
8. Check Inspect during the demo; distinguish informational/provider notices from an actual error.

## 14. Source map for follow-up questions

The first path in each row identifies the application directory. Subsequent `app/`, `components/`, `context/`, `lib/` and `public/` paths in that row are relative to `herbalaifrontend/`. These are the implementation references used for this reviewer.

| Topic | Files to study |
| --- | --- |
| Root layout, styling, navigation | `herbalaifrontend/app/layout.tsx`, `app/globals.css`, `components/Navbar.tsx` |
| Session and HTTP | `herbalaifrontend/context/AuthContext.tsx`, `lib/axios.ts`, `lib/request-cache.ts` |
| Signup and password UI | `herbalaifrontend/app/signup/page.tsx`, `lib/registration-name.ts`, `components/PasswordSettings.tsx` |
| Library and sources | `herbalaifrontend/app/library/page.tsx`, `components/HerbReferences.tsx`, `components/HerbComments.tsx` |
| AI interface and protocol | `herbalaifrontend/app/chat/page.tsx`, `lib/dr-ai-stream.ts`, `components/DrAiCreditsStatus.tsx` |
| Forum ordering and events | `herbalaifrontend/app/community/[id]/page.tsx`, `lib/forum-comments.ts` |
| Messenger recovery | `herbalaifrontend/app/messenger/page.tsx`, `lib/messenger-sync.ts` |
| Notifications | `herbalaifrontend/components/NotificationBell.tsx`, `lib/notification-state.ts` |
| Suggestion/admin workflows | `herbalaifrontend/app/suggest/page.tsx`, `app/admin/page.tsx`, `components/SuggestionReviewEditor.tsx` |
| Dialogs and PWA | `herbalaifrontend/components/AccessibleDialog.tsx`, `lib/dialog-focus.ts`, `components/PwaInstall.tsx`, `public/sw.js` |
| CSP, rewrite and runtime credit validation | `herbalaifrontend/next.config.ts`, `lib/credits.ts` |
| Regression tests | Root `scripts/*test.mjs`, workflow `.github/workflows/ci.yml` |

**Remember:** the frontend explains and presents the workflow. The backend decides whether the action is permitted and whether its data can be committed.
