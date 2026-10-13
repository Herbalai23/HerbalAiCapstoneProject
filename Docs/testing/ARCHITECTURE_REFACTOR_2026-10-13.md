# Architecture foundation: local validation

Date: 2026-10-13. Candidate is uncommitted and not deployed.

## Scope

- Reference: Kainara/demo at `95693ec97ed4e902c0b6fbe9b42db9b0c7fbc323`.
- Starting Herbal-Ai checkout: `3de6ec4533d28fff95d4d5174fb607c8fd66e8aa`; live code remains `b74cae4602431f817a5f579c8ede994a8710c7bb`.
- Kept deployment roots, public URLs, backend endpoint names, database schema and hosted settings unchanged.
- Moved frontend code into `src`, grouped route entries, and placed 19 actual screens in feature folders.
- Organized shared/core/UI controls, feature helpers, registration validation and plant-name reference data.
- Moved the existing Proxy with the Next.js router; updated aliases, Tailwind scanning, font paths, component-generator settings and regression readers.
- Split authentication into five workflow modules behind its existing stable service entry; moved ban/password-capability rules into `domain`.
- Extracted administrator record types without changing administrator UI or handlers.
- Added a plain-English [project map and symptom-to-file guide](../../ARCHITECTURE.md), plus an automated architecture gate.

## Passing checks

| Check | Result |
| --- | --- |
| All existing frontend CI regression groups | 548 passed |
| Architecture/import/route boundary regressions | 8 passed |
| Mocked authentication, password, verification, role, ban/capability and session-cache regressions | 111 passed |
| Backend lint and source TypeScript checks | Exit 0 |
| Strict TypeScript checks for the three affected domain-policy/contract test files | Exit 0 |
| Frontend lint and source/generated-route TypeScript checks | Exit 0 |
| Next.js production build, including Proxy | Exit 0; existing page inventory preserved |
| Git whitespace check for candidate code/config/tests | Exit 0 |

The first aggregate run exposed the new CI architecture step needing an explicit test filename for the existing CI-coverage regression. That configuration was corrected and the complete frontend workflow groups rerun: 556 total passing tests including the new architecture gate.

## Behaviour/layout preservation evidence

A one-off comparison against the starting commit checked all 56 moved JSX-bearing source files: their JSX was identical. All 14 authentication/helper function bodies were identical after extraction. Global style rules were identical except for source-scanning directives.

Chrome checks used a production build and a loopback-only, read-only fake API/socket fixture. No real account was used or created; no database or real email/AI provider was called.

- Desktop: Home, Library loading/empty state, protected Admin redirect to Sign In, fake local login, Admin Dashboard, Users and Knowledge Base.
- Mobile at 390 × 844: Admin Knowledge Base, expandable admin navigation and return to the public homepage.
- No captured console warnings/errors in those views.
- Observed mobile document width 375px within the 390px viewport; desktop document width 1351px within 1366px.
- Restored the browser viewport and closed the QA tab afterward.

These are fixture-based spot checks, not a claim of full live-data acceptance or a pixel comparison of every screen.

## Explicit limitations / next stage

Large existing Admin, Messenger and Suggestions screen implementations remain in their feature folders. This pass does not claim Kainara's maximum-module-size discipline has been fully adopted. Further state/section extraction should keep Gemini's markup and the existing assertions.

Production/Neon database acceptance was not run. Real concurrent token rotation and other database-backed workflows still need the existing isolated CI acceptance gates before release. No migrations, seed/import commands, production data cleanup or live email requests were performed.

No commit, push or deployment was performed. Release requires a separately authorized candidate and the full CI/live verification process. Existing unrelated dirty review/operations documents remain outside this candidate.
