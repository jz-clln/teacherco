# TeacherCo Batch 2 — Section setup, links and rosters

Implemented October 5, 2026, using the existing Batch 1 schema. The earlier Batch 1 working-tree changes were preserved.

## Features and boundaries

1. **Routes:** `/sections`, `/sections/new`, `/sections/[sectionId]`, `/sections/[sectionId]/edit`, `/sections/[sectionId]/classes`, `/sections/[sectionId]/classes/link`, `/sections/[sectionId]/learners`, `/sections/[sectionId]/learners/add`, and `/classes/[classId]/section`. Section routes have a shared header, text tabs, loading state and safe retry error state.
2. **Components:** `ClassAreaTabs`, `SectionTabs`, `SectionForm`, `SectionLifecycle`, `SectionActionButton`, `LinkedClasses`, `ClassLinkChoices`, `ClassSectionPicker`, `LearnerAdder`, and `SectionRoster`. Reused existing buttons, grouped surfaces, text-tab styles, layout and native confirmation dialog.
3. **Actions:** `createSection`, `updateSection`, `archiveSection`, `reactivateSection`, `deleteSection`, `linkClassToSection`, `unlinkClassFromSection`, `addLearnerToSection`, `addLearnersFromClassToSection`, `createLearnerInSection`, `deactivateSectionEnrollment`, `reactivateSectionEnrollment`; read-only picker actions `searchSectionLearners` and `getLinkedClassLearners`.
4. **Queries:** `ownedSection`, `listSections`, `sectionMembers`, `sectionClasses`, `classChoices`, `readClassSummary`, and paginated internal roster/class readers. Section-list counts use embedded PostgREST counts instead of fetching learner profiles or assessments. Counts are active Section memberships and all linked classes. The class-link management page reads only its current class summary plus Section choices. Owner-scoped reads paginate where needed; learner search returns 50 matches with a refine-search notice.
5. **Existing integration:** updated Classes landing page, AppShell selection logic, class details model/editor, class overview query/header, and the reusable confirmation dialog's optional pending state. Existing class creation remains unchanged, as explicitly permitted by the brief; optional Section selection at creation can be a later small enhancement. Teachers can link immediately afterward.
6. **Section list:** Classes stays the default. Internal Classes/Sections text tabs provide access to grouped Section rows. Active Sections precede a separate Archived group. Rows show display name, grade, year, adviser status when true, linked-class count and active-learner count. Empty state explains the concept without a large illustration.
7. **Creation:** visible labels, required name/grade/year, optional school name/ID, adviser checkbox, field limits, loading and immediate submit lock. A request UUID makes retries idempotent. Browser-supplied ownership is not trusted. Adviser-only Sections with zero classes are valid.
8. **Editing:** updates only Section details. Existing database context validation blocks academic conflicts with linked classes. The form shows a safe, readable error; it does not copy metadata or unlink classes.
9. **Adviser:** `sections.is_adviser` only. Teachers may manage Sections with it false. Account roles are unchanged.
10. **Archive/reactivate:** lower-frequency More area with confirmation. Updates only Section status; archived Sections remain visible and accessible with all relationships intact.
11. **Deletion:** the More area blocks deletion when classes are linked. An unlinked Section requires its exact name plus explicit confirmation explaining membership removal and retention of learner profiles/classes. The database FK handles a concurrent link safely.
12. **Linking:** shows owned, currently unlinked classes with compatible/incompatible groups and visible reasons. Confirmation includes class, grade, year, learner count and destination. Updates only `classes.section_id` (standard existing timestamp triggers still run). One Section may have many subjects; the same subject may have classes in multiple Sections.
13. **Unlinking:** explicit confirmation; clears only the expected Section link. Compare-and-set filters prevent an outdated page from clearing or replacing a more recent relationship. A deliberate Change Section action includes the expected old Section ID.
14. **Class integration:** a quiet Section metadata row links to the Section and relationship-management page. The existing details dialog shows the current relationship and Change/Unlink access. Historical `classes.section` remains editable as “Section label in record,” distinct from the relationship. The class page is otherwise preserved.
15. **Section roster:** independent exact-ID memberships. Defaults to active learners; Show inactive learners reveals retained memberships. Remove updates status to inactive. Reactivate updates the same membership row.
16. **Existing learners:** searchable owner-only profiles, with existing class/name/year context. Already-member rows are disabled and inactive membership is explained. Selection and a confirmation are required before adding. Database uniqueness is the final duplicate-membership safeguard.
17. **From a linked class:** choose a linked class, load its active roster, select exact learner records, then confirm. Select all is available; unusually large rosters select the first 500 with explicit wording. Adds memberships only, never new copies of existing learners or class-enrollment changes. Server actions recheck ownership, linkage and selected active learner IDs.
18. **New learner:** first/last name only, confirmation, request UUID and retry support. Creates an owned learner and Section membership. If enrollment fails, compensating cleanup targets only a newly created, otherwise unreferenced profile; pre-existing profiles are retained. This uses normal authenticated requests, without a new transactional RPC or migration.
19. **Same-name records:** whitespace/case-normalized names flag possible duplicates under different IDs, including duplicate names within the selection. Server-side checks require a Keep separate decision. The warning receives focus when displayed. No merge, reassignment, score move or automatic identity decision exists.
20. **Comparison:** shows active exact-ID learners in both, only Section, and only the chosen linked class. Informational reads do not write. Add/Review links open that class and learner in the picker; a subsequent explicit confirmation is still required. Inactive Section membership links reveal the existing row for reactivation.
21. **Authorization:** every action obtains server-side authenticated, email-verified, active access; every Section/class/profile mutation scopes ownership. Existing RLS and composite FKs provide a second boundary. Admin role adds no ownership bypass. No routine Section action uses a service-role client. Errors expose no SQL, constraint names or stack traces.
22. **Schema:** no new migration, table, constraint or RPC was added in Batch 2. Existing 0016 was reused. The older migration ledger was not reconciled or modified.
23. **Existing classes:** no automatic linking or backfill.
24. **Rosters:** no automatic synchronization in either direction.
25. **Identity:** no learner merging.
26. **Record Sync:** snapshot/apply RPCs, revision triggers, versions and idempotency unchanged. Section UI actions create no sync versions or revision changes.
27. **What Changed:** unchanged and class-scoped.
28. **Attendance, Reports, Ask and Check:** remain class-scoped; no Section grading/attendance/analytics added.
29. **Privacy:** no LRN input, display, column or storage added.
30. **Future scope:** no report-card/SF9/template/grade-book/subject-catalog/sharing/organization features or tables added.

## Validation

31. **New automated tests:** 31 passed: 22 action workflows against PGlite with the complete migration chain and real RLS/FKs; 5 comparison/context/model tests; 4 UI/submit-lock/navigation tests. Covers owner attribution/spoofing, access states, ownership denial, edit/archive/delete/link behavior, stale relationships, context mismatch, existing/from-class/new learners, compensating cleanup, retained inactive identity, same-name review, read-only comparisons and mobile selection. Existing Batch 1 tests additionally cover four Math classes/four Sections, five subjects/one Section, account deletion and database invariants.
32. **Regression run:** 188 passed, 4 pre-existing failures across 24 selected test files (192 tests). Passing coverage includes all selected academic Sections, class/learner/import, sync, invite/access, attendance, checking, Ask/evidence and design-system tests. Four `reports-evidence.test.ts` OpenAI narrative tests fail because the unchanged `src/lib/ai/provider.ts` still throws “AI provider is not configured yet.” Its implementation, narrative module and test file have no diff from HEAD. The other ten report-evidence tests pass. No whole-repository success is claimed. Total selected automated result including new suites: **219 passed, 4 pre-existing failures**.
33. **Typecheck:** `npm run typecheck` passed.
34. **Lint/design:** changed-file ESLint and `git diff --check` passed. New Section application code contains no service-role key, persistent learner identifiers, blur/backdrop-filter, morphism or decorative gradient styles. Dialog dimming is the existing legitimate black overlay. Mobile global navigation remains exactly Today, Classes, Check, Reports, Ask; Sections selects Classes. Controls use existing 44px targets, labels, focus styles and reduced-motion conventions.
35. **Build:** `npm run build` passed, including all new dynamic routes.
36. **Browser/responsive:** production-build browser smoke covers create/edit, double-click prevention, adviser-only learner creation, class link/unlink, class-page relationship, existing learner selection, add-from-class duplicate warning/Keep separate, deactivate/reactivate, comparison, context error, archive/reactivate, linked-delete blocking and confirmed deletion. Nine surfaces tested at **320, 360, 390, 430, 768, 1024 and 1440px** with no page-level overflow. Long Section, school, class and learner labels exercised. Screenshot review led to stacked comparison controls on phones and more room for long Section titles. Screenshots are under ignored `test-results/section-setup/`.
37. **Remote smoke:** ran against the explicitly verified configured new project `qsmyzajvkpkdsmwezwfa`, using the local production build and normal authenticated server actions. Service credentials were confined to the test harness for fixture setup/cleanup and never printed. Tests used one temporary account per run and deleted it in `finally`, including failed harness runs. Class snapshot, existing score, attendance, sync revision and history were asserted unchanged after Section operations. No real teacher data was edited.
38. **Remaining limits:** optional Section selection during class creation is deferred; use the new class relationship page. Learner creation uses two requests with compensating cleanup rather than a new database transaction. If the network fails during both enrollment and cleanup, retrying the same form reuses the request ID; an owned profile can remain until retry if cleanup cannot reach the server. No offline Section editing is promised. Existing AI report-narrative test failures are unchanged. Changes are not deployed, committed or pushed.

## File inventory

39. **Created for Batch 2:**

   - `src/app/(dashboard)/sections/page.tsx`, `new/page.tsx`, `loading.tsx`, `error.tsx`
   - `src/app/(dashboard)/sections/[sectionId]/layout.tsx`, `page.tsx`, `edit/page.tsx`
   - `src/app/(dashboard)/sections/[sectionId]/classes/page.tsx`, `classes/link/page.tsx`
   - `src/app/(dashboard)/sections/[sectionId]/learners/page.tsx`, `learners/add/page.tsx`
   - `src/app/(dashboard)/classes/[classId]/section/page.tsx`
   - `src/features/sections/model.ts`, `data.ts`, `action-helpers.ts`, `actions.ts`, `roster-actions.ts`
   - `src/features/sections/area-tabs.tsx`, `action-button.tsx`, `section-form.tsx`, `section-lifecycle.tsx`, `class-links.tsx`, `class-section-picker.tsx`, `learner-adder.tsx`, `roster-view.tsx`
   - `tests/helpers/section-action-db.ts`
   - `tests/section-workflows.test.ts`, `section-model.test.ts`, `section-ui.test.tsx`, `section-setup-browser.mjs`
   - `docs/ACADEMIC-SECTIONS-BATCH-2.md`

40. **Existing files modified in this batch:**

   - `src/app/(dashboard)/classes/page.tsx`
   - `src/components/layout/app-shell.tsx`
   - `src/components/ui/confirm-dialog.tsx`
   - `src/features/classes/details.ts`
   - `src/features/classes/edit-class-details.tsx`
   - `src/features/classes/overview-data.ts`
   - `src/features/classes/overview-view.tsx`

   The other already-uncommitted Batch 1 files, including migration 0016, are preserved; they are not new Batch 2 changes. No secrets or generated signing/build artifacts are staged.

41. **Suggested commit:** `feat: add section setup and independent roster management`.

## Repeating the focused checks

```powershell
npm test -- --configLoader native --pool=threads tests/section-workflows.test.ts tests/section-model.test.ts tests/section-ui.test.tsx
npm run typecheck
npm run build
```

For the opt-in browser/remote smoke, first verify the configured Supabase project and start the production build locally on port 3326. Set `SECTIONS_TEST_PROJECT_REF` explicitly to the verified ref, then run `node tests/section-setup-browser.mjs`. The harness refuses a mismatched project/link or a non-local application URL. It creates synthetic records under one temporary account and deletes that account afterward. It never applies migrations or touches the migration ledger.
