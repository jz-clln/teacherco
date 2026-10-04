# Class Overview refresh + What Changed

> This documents the preceding functional batch. The subsequent [Design System v2](DESIGN_SYSTEM_V2.md) updates its presentation: Sync/Import/Export are visible, Edit is in the header, More contains grading settings, and the browser entry point now runs the broader design-system fixtures. The data and calculation descriptions below still apply.

## Delivered

The class overview now reads in this order: compact class identity and Take attendance / More, four primary metrics, What Changed, Needs Attention, links to detailed class areas, and up to three recent assessments. Existing colors, Poppins, card styling and app navigation are reused. There is no new database table, migration, persisted summary, AI call, tracking system or service-worker change.

**More** contains Edit class details, Import record, Sync updated record, and Export record. It is a disclosure with ordinary keyboard-focusable buttons/links: Enter/Space opens it, Tab reaches actions, Escape closes it and returns focus, outside presses dismiss it, and moving focus out closes it. The existing edit form remains in use; its dialog now focuses an input and traps Tab. Escape closes the dialog first, then the menu on a second press.

**Learners** lives at `/classes/[classId]/learners`. The existing add/remove learner forms moved there, with user-facing wording changed to “learner.” Their server actions return to that page and invalidate both it and the overview. The overview links to Learners and no longer renders a full roster or a large Add Student button.

## What Changed

`latestClassChanges` verifies active, onboarded teacher access and class ownership, then reads only the newest row of the existing `class_record_sync_versions`. It projects the comparison and before/after learner and score arrays needed to calculate the summary. It does not fetch 50 versions, full snapshots, historical attendance arrays, raw uploaded records or grading configuration. Only the compact resulting insights reach the overview client. Work grows with scores in one version, not the length of the history.

The label is **Since your last record update**, accompanied by the sync date. It describes that immutable sync, not the last visit or subsequent manual changes.

Deterministic insights include new learners, learners receiving new scores, corrected scores, attendance records changed, grade values changed, new activities, score-average movement, and benchmark crossings. Counting uses learner/assessment IDs where available. Blank scores stay unscored; zero is a real score. Protected and missing-data notices are not counted as applied changes.

The score-average helper is shared with current metrics: each active learner's total earned / possible points, averaged across learners with recorded scores. This is not the printed/transmuted term grade. A first scored record does not invent a previous zero average. Crossings use the current class benchmark and require scores before and after.

At most four insights appear, prioritized by below-benchmark crossings, average movements of at least one percentage point, upward benchmark crossings, additions, score/attendance changes, then smaller average or printed-grade/activity updates. Competency movement, missing-work concerns and new absence-threshold crossings are not inferred without appropriate evidence.

**Show evidence** explains the formula, before/after averages and scored-learner counts, current benchmark and scope. **View changes** and the evidence link navigate to the existing sync page with the exact version ID and hash. That version expands and loads its existing before/after comparison lazily. Direct links also work when a version has moved beyond the first history page, without changing pagination. The existing JSON download retains access to the underlying snapshots.

No history shows a sync CTA, or import when the class has no scored record. No meaningful changes shows **You’re up to date**. Read failures are explicit and are never presented as “no changes.” Sections have compact Suspense loading states.

## Needs Attention

Reuses `buildInsights`, `ATTENTION_RULES` and the current score/attendance queries. No competing alert system was created. Shows at most three learners with their leading reason; **View all** opens `/classes/[classId]/attention` with all reasons and the existing rule definitions. Current rules cover below-benchmark averages, three consecutive recorded absences, and low recent attendance. Empty and failed reads have separate states. Metric read failures now fail visibly rather than producing partial averages or a misleading zero.

## File inventory

Created:

- `src/features/classes/change-summary.ts` — deterministic version comparison summary.
- `src/features/classes/overview-data.ts` — guarded server reads and request-local query sharing.
- `src/features/classes/class-more-menu.tsx` — accessible action disclosure.
- `src/features/classes/overview-view.tsx` — header, metrics, insights, attention and class-area links.
- `src/app/(dashboard)/classes/[classId]/learners/page.tsx` — existing learner management in its own area.
- `src/app/(dashboard)/classes/[classId]/attention/page.tsx` — full existing attention results.
- `tests/class-overview.test.tsx`, `tests/class-overview-data.test.ts`, `tests/class-learners.test.tsx`.
- `tests/class-overview-browser.mjs`, `tests/browser-fixtures/class-overview.tsx`.
- This handoff document.

Modified:

- `src/app/(dashboard)/classes/[classId]/page.tsx` — overview layout and streamed sections.
- `src/app/(dashboard)/classes/[classId]/records/sync/page.tsx` — version deep links.
- `src/features/classes/edit-class-details.tsx` — menu trigger style and dialog focus.
- `src/features/classes/stats.ts` — shared average formula and explicit read errors.
- `src/features/classes/insights.ts` — explicit attendance read errors.
- `src/features/learners/actions.ts`, `add-student-dialog.tsx`, `delete-student-button.tsx` — learner-area redirects and terminology.
- `src/features/records/record-sync.tsx`, `sync-actions.ts` — open a requested existing version without eager snapshot downloads.
- `tests/record-sync-ui.test.tsx` — version deep-link regression coverage.

## Validation and deployment

Focused command:

```sh
npm test -- --configLoader native --pool=threads tests/class-overview.test.tsx tests/class-overview-data.test.ts tests/class-learners.test.tsx tests/record-sync.test.ts tests/record-sync-database.test.ts tests/record-sync-ui.test.tsx tests/record-sync-workbook.test.ts tests/invite-access.test.ts
```

59 focused tests pass, including all existing record-sync tests plus the new deep-link regression. Typecheck, changed-file lint and production build pass.

`node tests/class-overview-browser.mjs` checks the actual overview components and app shell at **320, 360, 390, 430, 768, 1024 and 1440px**, with normal and long names. No horizontal overflow; menus stay on-screen; mobile metrics are 2×2; bottom navigation remains usable; keyboard/outside dismissal and edit form interaction pass. It also checks no-history, unchanged and error states. Screenshots are under ignored `test-results/class-overview/`. Browser fixtures use synthetic records and a mocked edit action, not a production account or database. The script requires an existing production build for the local Poppins font files.

No new deployment configuration or database step is required for this batch. Deploy the web changes normally. The previously delivered record-sync migration 0015 must already be installed for history to exist; it is not changed here. After deployment, smoke-test an authenticated class, a sync-version deep link and learner add/remove with an authorized teacher account.

Unrelated known baseline failures from earlier work: whole-repository lint in `use-dictation.ts`; the broad test command includes a Playwright test in Vitest and has report-provider mocks / score-sheet focus failures. Those broad suites were not rerun for this batch; focused checks above are the validation claim.

Suggested commit: `feat: add classroom change insights`
