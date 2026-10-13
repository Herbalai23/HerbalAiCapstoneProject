# Admin presentation extraction — local checkpoint

Six tab views now live in `herbalaifrontend/src/features/admin/sections`:
`DashboardSection`, `SuggestionsSection`, `HerbsSection`, `UsersSection`,
`KnowledgeBaseSection`, and `AuditLogsSection`.

The main Admin screen is reduced from 2,469 to 1,349 lines. Each section is
at most 410 lines, with typed data/callback props and no API calls or state effects.
The screen still owns requests, state, review actions, sidebar and dialogs.
See the updated [beginner debugging map](../../ARCHITECTURE.md).

Validation:
- All frontend CI regression groups plus architecture guards: 565 tests passed.
- Focused Admin/workflow/session/ban/config regressions: 142 passed, overlapping the full suite.
- Frontend lint, TypeScript and production builds: exit 0.
- Exact source comparison: all six extracted JSX trees unchanged after newline normalization.
- All pre-render Admin state/effect/action statements unchanged against the original baseline.
- Chrome: all six tabs rendered against an isolated read-only loopback fixture;
  no captured Inspect console warnings/errors. No live database or provider calls.
- Git whitespace check passed.

The next bounded extraction is Admin state/actions, followed by Messenger and
Suggestions. No commit, push or deployment was performed. Existing Gemini markup,
styles, URLs, credentials, database schema and unrelated dirty documents are preserved.
