# Admin state and actions: local checkpoint

This extends the previous Admin section extraction. The candidate remains
uncommitted and not deployed.

## Changes

- `AdminScreen.tsx`: presentation, sidebar, dialogs and access-state displays.
- `useAdminWorkspace.ts`: existing React state, list loading, search/filter
  effects, session handling and action composition.
- Four typed action factories: review, herbs, knowledge-base and users.
- `admin-feedback.ts`: the existing shared Axios error-message helper.
- Existing regression readers follow the actual hook/action implementations.
  The seven logout tests load the real hook and its real action factories
  with mocked React/API dependencies.
- Added 14 actual-factory regressions and a bounded-module architecture guard.
- Updated the root debugging map and added an Admin-only troubleshooting README.

## Evidence

| Check | Result |
| --- | --- |
| Complete frontend workflow regression groups, including new action/architecture checks | 580 passed |
| Focused logout/actions/workflow/architecture/deployment checks | 80 passed; overlaps full suite |
| Frontend lint | Exit 0, no warnings |
| Frontend TypeScript | Exit 0 |
| Production build with loopback API/socket addresses | Exit 0 |
| Source/AST comparison against the pre-extraction local snapshot | 23 callback bodies, hook order and JSX preserved, ignoring comments/newline/indentation-only formatting |

Chrome used a read-only local fake API/socket fixture, not live credentials or
Neon. All six Admin tabs rendered. The KB form opened, cancelled and reopened
with its seven fields reset. At 390 × 844 the menu expanded, selecting Users
closed it, and Public Site returned to the homepage.

No captured console warnings/errors in the tested views. Mobile page width
was 375px within the 390px viewport. These are empty-data fixture checks, not
full live acceptance of every populated record or external provider.

The refactor does not change API payloads, revision checks, authentication,
email/refund meanings, database schema, hosted settings or Gemini's layout.
No database tests, migrations, live emails, real herb mutations or publications
were performed.

## Next bounded task

Messenger presentation/state separation, then Suggestions. Full isolated
backend CI and live public/admin verification remain release gates for the
whole accumulated refactor; this local frontend check is not a live release.
