# Admin: where do I debug?

Start with the symptom, then open one file. You do not need to read the entire dashboard.

| Symptom | Start here |
| --- | --- |
| Sidebar, mobile menu markup or dialog layout | `AdminScreen.tsx` |
| A tab looks wrong | The corresponding file in `sections/` |
| Tab data does not load, search/filter results are stale | `useAdminWorkspace.ts` |
| Login, access-denied or logout state | `useAdminWorkspace.ts`; display guards remain in `AdminScreen.tsx` |
| Approve, reject or request changes | `actions/review-actions.ts` |
| Edit/delete a published herb | `actions/herb-actions.ts` |
| Add/edit/import a knowledge fact, source fields or active toggle | `actions/knowledge-base-actions.ts` |
| User ban result is not reflected in the list | `actions/user-actions.ts` |
| API error text is wrong | `admin-feedback.ts` |
| Which fields should a record have? | `types.ts` |

## How these files work together

```text
AdminScreen displays the interface
  → useAdminWorkspace holds current state and loads lists
  → action module handles a button/form and calls the existing API
  → backend validates permissions/input and updates the record
  → returned result updates state
  → the relevant section displays the result
```

The action modules are ordinary function factories, not another React store.
The hook supplies current record values and setters each render. Do not add
hooks or a separate account/session store inside an action factory.

## Read an error safely

Open Inspect → Console and Network → Fetch/XHR. Record the failing endpoint,
status and response message. Compare the table above with that action's file.
Do not share cookies, passwords, account tokens, reset links or raw request headers.

Check the hook for loading/filter issues; check the action module for failed
saves. Check backend permission/input guards for 400/403 results rather than
removing those protections.

## Preserve existing behaviour

- Keep Gemini's classes, text, markup and responsive behaviour.
- Keep request revisions and evidence requirements on review actions.
- A saved change request can still have email-delivery or list-refresh trouble;
  do not display that as an unsaved decision or retry the decision blindly.
- Keep cache invalidation after successful saves.
- Do not seed, migrate or query Neon to test a frontend-only structural move.

From the repository root, focused checks include:

```text
node --test scripts/admin-logout.test.mjs scripts/admin-sections.test.mjs scripts/admin-workspace-actions.test.mjs scripts/workflow-integrations.test.mjs scripts/architecture.test.mjs
```

The action tests use fake API responses, not a database or real email delivery.
CI still runs the complete existing regression groups.
