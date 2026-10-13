# Accumulated architecture refactor — final local checks

Date: 2026-10-13. Baseline: `3de6ec4533d28fff95d4d5174fb607c8fd66e8aa`.
Working branch: `codex/mvp-acceptance-ci`. No new commit, push or deployment.

## Completed announced phases

1. Frontend `src` organization, grouped thin route entries, feature folders,
   shared controls, source aliases and Tailwind source scanning.
2. Backend authentication facade split into registration, passwords, Google,
   email verification and session workflows; pure account policies separated
   from provider/database infrastructure.
3. Admin's six presentation sections, state/workspace hook and four action modules.
4. Messenger's state, socket lifecycle, types and display helpers.
5. Suggestions' form/list state hook and shared type, keeping its existing screen.
6. Architecture guards, migrated regression readers and plain-English debugging guides.

Deployment roots, page URLs, endpoints, schema, credentials, hosted settings,
email templates and Gemini's approved layout stay unchanged. Unrelated local
documents are not part of this candidate.

## Automated local results

| Check | Result |
| --- | --- |
| All frontend native regression groups scheduled in CI | 604 passed |
| Targeted backend auth/domain/authorization/cache suites using mocks | 111 passed across 10 files |
| Architecture suite | 12 passed, already included in the frontend total |
| Backend lint and source TypeScript check | Passed |
| Frontend lint | Passed |
| Frontend production build | Passed |
| Frontend TypeScript check after build | Passed |
| `git diff --check` | Passed |

The combined runner also repeats the architecture suite, so its raw total is
727 executions, not 727 unique tests. The distinct frontend/backend total is
715 tests. Do not describe this as a completed remote full-CI run.

Backend test environment values from local dotenv files were blanked before
supplying test-only values. The database target was unreachable loopback
`127.0.0.1:55438`; email mode was `log`. These selected suites mock
persistence and providers. No Neon operations or live messages were performed.

## Preservation evidence

Direct comparison against the Git baseline checks 56 moved JSX files, including
expanding all six Admin section expressions and including Messenger's moved
display helpers. No JSX mismatches remain after comment and CRLF/LF
normalization. All 14 authentication/helper function bodies match, and global
CSS rules match apart from the required Tailwind scanning directives.

Additional snapshot comparisons confirm unchanged callback bodies and hook order:

- Admin workspace/actions: 23 callbacks.
- Messenger state/socket: 17 callbacks. Four stable ref objects were added to
  socket-effect dependencies to satisfy exhaustive-deps, without changing their identities.
- Suggestions state: 11 callbacks.

The handwritten frontend TypeScript modules are below 900 lines. The larger
regional plant-name dataset remains data rather than being artificially split.
This is not a claim that every existing backend module has been rewritten.

## Combined production-build browser checks

Chrome used a read-only loopback API/socket fixture, not real accounts:

- Admin: Dashboard, Pending Suggestions, All Herbs, Users, Knowledge Base,
  Audit Logs, and return to Public Site.
- Public/member: settled URL and heading checks for Home, Library, About,
  Community and Messenger; Sources and Privacy navigation.
- Messenger: populated incoming/outgoing conversation display.
- Suggestions: pagination, Active/History filters, revision prefill/cancel,
  direct revision link and mobile 390 × 844.

No captured Console errors or warnings during these checks. Temporary viewport
override was reset, QA tabs closed and the local fixture stopped. Library and
user lists were empty synthetic data where applicable; this does not establish
live data correctness or full end-to-end provider/database acceptance.

## Remaining release gates

1. Explicit authorization to commit/push this accumulated refactor candidate.
2. Inspect newer Gemini/remote changes and preserve them when preparing release.
3. Full remote CI, including database acceptance on an isolated CI database.
4. Deploy only the accepted candidate, then recheck live public/admin Console,
   account workflows and relevant permissions.

No production database cleanup, migration, seed, real submission, payment,
email delivery or AI quota consumption was performed for these local checks.
Do not claim this refactor is live until those release gates are completed.

## Where teammates start

Use root `ARCHITECTURE.md` first. The Admin, Messenger and Suggestions feature
READMEs point from the visible symptom to the responsible implementation file.
Keep backend permission checks even if a screen also validates its inputs.
