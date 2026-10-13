# Messenger refactor — local checkpoint

This candidate is uncommitted and not deployed.

## Structure

- `MessengerScreen.tsx`: existing interface and Suspense boundary, reduced
  from 1,023 to 573 lines.
- `useMessengerState.ts`: current contact/draft, API requests, search,
  pagination, history and attachment/edit/send state, 521 lines.
- `useMessengerConnection.ts`: socket authentication/listeners, browser
  resume handling and cleanup, 78 lines.
- `types.ts`: the existing contact/message/conversation definitions.
- `messenger-presentation.tsx`: existing avatar, time, date and role helpers.
- A feature README maps symptoms to files for non-coder teammates.

No frontend layout, backend API endpoint, message payload, database schema,
sorting rule or provider setting changed.

## Checks

| Check | Result |
| --- | --- |
| Complete frontend CI regression groups, including new tests | 594 passed |
| Focused Messenger/architecture/deployment regressions | 66 passed; overlaps full suite |
| Frontend lint and TypeScript | Exit 0, no lint warnings |
| Next.js production build with loopback API/socket addresses | Exit 0 |
| Source/AST preservation comparison | JSX, 17 callbacks and expanded hook sequence preserved |
| Candidate whitespace check | Exit 0 |

The extracted socket hook explicitly lists its four supplied stable useRef
objects as effect dependencies for exhaustive-deps correctness. Their identities
remain stable in the state hook. The six new connection tests cover guards,
event registration, token retrieval, resume throttling, session callbacks and
exact cleanup. Seven new state-hook tests exercise actual extracted state
handlers with fake responses, including sends/edits and stale-contact history.

## Chrome evidence

All browser checks used a read-only loopback API/socket fixture with fixed fake
contacts/messages, never Neon or real user messages.

- Desktop conversation list and populated incoming/outgoing thread rendered.
- Load older messages inserted the fixed older fixture message.
- An unsent draft enabled Send; clearing it disabled Send. No send was submitted.
- Message options opened the edit form; Cancel restored normal presentation.
  No edit or delete was submitted.
- User picker loaded two fake contacts and switching to the second contact
  displayed its empty conversation.
- Mobile at 390 × 844: back-to-conversations navigation, reopening a populated
  thread, and linked-contact query navigation worked.
- Both incoming and outgoing messages were visible when checks were scoped to
  the actual Conversation region rather than the hidden sidebar preview.
- Mobile page width equalled its 390px viewport.
- No captured Console warnings/errors in the checked views.
- Temporary Chrome viewport overrides were reset and QA tabs closed.

These are fixture-based spot checks, not full production acceptance or a claim
that all populated-record/provider cases were checked live. No uploads, email
requests, database tests, migrations or real messaging mutations were performed.

## Next

Suggestions screen extraction. Full isolated backend CI and live public/admin
checks still gate release of the accumulated architectural refactor.
