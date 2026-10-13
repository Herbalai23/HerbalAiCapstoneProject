# Suggestions extraction — local acceptance, 2026-10-13

## Change

The former 923-line `SuggestHerbScreen.tsx` now separates into:

| File inside `herbalaifrontend/src/features/suggestions` | Responsibility |
| --- | --- |
| `SuggestHerbScreen.tsx` — 655 lines | Existing form, submission cards, filters, status and session-retry display |
| `useSuggestionSubmission.ts` — 391 lines | Fields, requests, image preview, validation, revision links and list refresh |
| `types.ts` | Submission shape |
| `README.md` | Plain-English symptom-to-file debugging guide |

The Suspense boundary, layout, classes, text, multipart payloads, owner-scoped
list request, refresh timing and cancellation remain unchanged. The backend
still determines editable ownership and History eligibility.

## Evidence

- All 11 extracted callback bodies and the complete hook sequence match the
  pre-extraction snapshot. The screen's JSX matches after comment/line-ending
  normalization.
- Nine new regressions evaluate the actual hook with fake React/API/browser
  dependencies: validation, new multipart submission, failed revision/draft
  preservation, reset, image guards/cleanup, owner-scoped history/counts,
  cancelled responses, linked revision loading and session-outage redirect.
- Existing workflow and session-outage assertions now read the screen and
  state hook together, without removing assertions.
- Architecture boundaries and the new hook suite are scheduled in frontend CI.

## Read-only Chrome checks

The local production build used a loopback API fixture with eight synthetic
owned submissions. No production API, database, email or upload was used.

- All: five records on page one, three on page two; pagination disabled at the end.
- Active: three records, resetting pagination to page one.
- History: five reviewed records supplied by the fixture.
- Edit/resubmit: existing notes and fields prefilled; cancelling cleared the draft.
- Direct `/suggest?edit=202`: the revision opened and prefilled correctly.
- Mobile at 390 × 844: revision layout remained usable, with document width
  375 pixels and viewport width 390; cancel still worked.
- No captured error/warning Console entries during these checks.

No create/resubmit button was submitted in the browser. Unit tests cover those
payloads against mocks. The viewport was restored, temporary tabs closed and
the fixture stopped.

## Release status

Local only. See `REFACTOR_FINAL_LOCAL_CHECKS_2026-10-13.md` for combined results.
Full isolated backend CI and post-release live checks remain release gates.
