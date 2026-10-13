# Messenger: start debugging here

| Problem | File to open |
| --- | --- |
| Sidebar, message bubbles, mobile back button or user-picker layout | `MessengerScreen.tsx` |
| Search, loading older history, sends, edits, attachments or contact selection | `useMessengerState.ts` |
| Connection does not resume after coming back online / tab focus | `useMessengerConnection.ts` |
| Wrong message order, duplicates or late history replacing another conversation | `messenger-sync.ts`, then the state hook |
| Avatar, timestamp or role label display | `messenger-presentation.tsx` |
| Meaning of a contact, message or conversation field | `types.ts` |

The screen displays the interface. The state hook owns the current contact,
draft, requests, filters and history. The connection hook owns socket listeners,
authentication-token retrieval, browser resume listeners and cleanup.
`messenger-sync.ts` contains the existing ordering/recovery helpers.

## If a message does not appear

1. Open Inspect → Console and Network → Fetch/XHR.
2. Check whether `/messages` succeeded and returned a message.
3. Check that the message belongs to the signed-in user and active contact.
4. If a socket disconnect occurred, check the connection hook's recovery and
   `/auth/socket-token` result before changing history rendering.
5. Keep revision/ownership checks in the backend; do not bypass permissions.

Send/edit/delete responses are reconciled with the same message handlers as
socket events. Edits and deletions must not insert unrelated messages into the
active conversation. History requests for a previous contact must not replace
the newly selected contact's messages.

## Preserve the current behaviour

- The route retains its Suspense boundary for query-string navigation.
- Keep current message sorting, cancellation, search delays and pagination.
- Keep the mobile no-auto-focus behaviour and Gemini's existing markup/styles.
- Each render supplies the same stable ref objects to the connection hook.
  Its dependency array explicitly lists those refs for lint correctness.
- A refactor test must not contact Neon, send real messages or upload real files.

From the repository root:

```text
node --test scripts/messenger-sync.test.mjs scripts/messenger-connection-hook.test.mjs scripts/messenger-state-hook.test.mjs scripts/architecture.test.mjs
```

These tests use fake API/socket/browser dependencies. Full isolated backend CI
and live verification are still required before releasing the accumulated refactor.
