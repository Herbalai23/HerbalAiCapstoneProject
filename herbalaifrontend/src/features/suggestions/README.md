# Suggestions: start debugging here

| Problem | File to open |
| --- | --- |
| Form, status cards, History tabs, pagination or mobile layout | `SuggestHerbScreen.tsx` |
| Fields, upload validation, submit/resubmit, list refresh or revision prefill | `useSuggestionSubmission.ts` |
| Email revision link parsing, editable status or admin delivery feedback | `suggestion-review.ts` |
| Review fields shown to an administrator | `SuggestionReviewEditor.tsx` |
| Status label or colour | `SuggestionStatusBadge.tsx` |
| Meaning of a saved submission's fields | `types.ts` |

The screen preserves Gemini's markup and styles. The state hook owns the form,
requests, upload preview, session redirect and refresh listeners. Neither file
decides who may edit a database record: that remains a backend permission.

## Follow the request

1. Open Inspect → Console and Network → Fetch/XHR.
2. My Submissions reads `GET /suggest` with `scope=mine`, the selected view,
   page and a five-record limit. Counts and History eligibility come from the
   backend, not a browser-side timer.
3. A revision link reads `GET /suggest/:id`. Only a currently
   `ChangesRequested` record can prefill the revision form.
4. New suggestions use `POST /suggest`; revisions use
   `POST /suggest/:id/resubmit`. Both retain their multipart payload.
5. Start backend debugging at `controllers/suggest.controller.ts`, then
   `repositories/suggest.repository.ts`. Email delivery uses
   `lib/suggestion-review-email.ts`.

Approved/rejected records stay Active for the first 24 hours after review, then
become History. This changes their list placement, not their database retention.
Do not delete records to repair the display.

## Preserve the current behaviour

- Keep the Suspense boundary and the revision destination during sign-in.
- A session outage shows retry; it must not redirect like a confirmed logout.
- Cancel stale list/revision responses when ownership, query or view changes.
- Keep the existing image-type and 5 MB checks and release preview URLs.
- Do not bypass owner checks or send real submissions during refactor tests.

From the repository root:

```text
node --test scripts/suggestions-state-hook.test.mjs scripts/workflow-integrations.test.mjs scripts/auth-refresh.test.mjs scripts/architecture.test.mjs
```

These tests use mocked API/browser dependencies, without Neon or real emails.
