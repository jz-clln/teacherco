# Academic Sections Foundation — Batch 1 handoff

Implemented and validated October 4–5, 2026. No Section UI is included.

## Implementation

1. **Migration:** `supabase/migrations/0016_academic_sections.sql`. The repository's previous latest migration was 0015.
2. **New schema:**
   - `sections`: `id uuid` primary key/default generated UUID; `teacher_id uuid` required; `name text` required/non-whitespace/max 120; `grade_level text` required/non-whitespace/max 50; `school_year text` required/non-whitespace/max 30; nullable `school_name text` max 160 and `school_id text` max 30; `is_adviser boolean` required/default false; `status text` required/default active/check active or archived; required `created_at` and `updated_at timestamptz` default now. Unique `(id, teacher_id)` and index `(teacher_id, status, school_year)`. Similar names are permitted.
   - `section_enrollments`: generated UUID primary key; required UUID `teacher_id`, `section_id`, `learner_id`; required `status text` default active/check active or inactive; required created/updated timestamps default now. Unique `(section_id, learner_id)`; indexes `(section_id, status)`, `(learner_id)`, `(teacher_id)`. Both tables reuse `set_updated_at()`.
3. **Existing tables:** nullable `classes.section_id`, partial lookup index where non-null, composite ownership FK; `learners` gains unique `(id, teacher_id)`. Existing metadata columns remain intact.
4. **FK strategy:** Section owner references `auth.users` with cascade. Enrollment `(section_id, teacher_id)` references the matching Section with cascade. Enrollment `(learner_id, teacher_id)` references the matching learner with `NO ACTION DEFERRABLE INITIALLY DEFERRED`. Class `(section_id, teacher_id)` references the matching Section with the same deferred non-cascading rule. Cross-owner relationships fail even for privileged callers.
5. **Section deletion:** a linked class prevents hard deletion at transaction completion. Explicitly unlink classes first. Deleting an unlinked Section cascades its memberships, never its learners or classes.
6. **Learner deletion:** any active or inactive Section membership prevents ordinary learner deletion. Deferred constraints allow intentional account cascades to remove all related records within one transaction.
7. **RLS/security:** owner policies plus restrictive active-access policies protect both tables. Anonymous/public grants are revoked. Authenticated owners receive Section select/insert/update/delete and enrollment select/insert/update, but no enrollment hard-delete grant. Service role retains privileged access. Application admin status confers no academic ownership bypass. Owner and enrollment relationship fields are immutable. Trigger functions are not exposed as browser RPCs; integrity triggers use fixed empty search paths.
8. **Active access:** explicit restrictive `has_active_access()` policies cover the new tables, including verified-email and active-profile requirements. Migration 0014's earlier dynamic policy installation is not relied upon for new tables.
9. **Academic context:** both class and Section triggers compare grade/year and school ID when both IDs are meaningful. Comparison collapses whitespace, trims and ignores case; stored metadata is not rewritten. Section text and school-name equality are not required. Class linking/context writes serialize on the Section row through a deliberate no-op row update. This creates a row version as well as a lock, protecting repeatable-read transactions from an old snapshot. Section validation reads linked classes without acquiring class locks in reverse order. The no-op update refreshes the Section's `updated_at`, but never class sync revision.
10. **Import preflight:** selected workbook metadata passes the owner-scoped linked-context preflight and the database guard before learner/grade writes. Metadata is saved first, eliminating the previous late Section-conflict failure after scores were written. No selected metadata means no proposed context change. This does not turn the existing multi-request import into an all-or-nothing transaction for unrelated network or grade-import failures.
11. **Class details:** `updateClassDetails` checks the linked Section before updating, fails closed on lookup errors, and translates database context conflicts into a teacher-facing error. It neither unlinks the class nor edits Section metadata.
12. **Learner cleanup:** `deleteLearner` checks both other class memberships and all Section memberships. Section-linked learners are retained while the current class membership is removed. Lookup errors stop deletion. Class orphan cleanup includes Section memberships and retains profiles if those checks fail; the FK remains the final race safeguard.
13. **Delete-all/account cleanup:** delete-all removes classes, then Sections (cascading their memberships), then learners and notes. Failures stop dependent cleanup. Direct auth-account cascade was tested locally and remotely.
14. **Types:** `Section` and `SectionEnrollment` added to `src/types/domain.ts`; `TeacherClass.section_id?: UUID | null` preserves compatibility. No generated Supabase types convention exists to regenerate.
15. **Data-access boundary:** `src/features/sections/context.ts` contains the small server-used, owner/RLS-scoped validation helper. No unnecessary CRUD actions, browser-supplied owner authorization, service-role application path, or Section linking UI was added.
16. **No backfill:** no real Sections or memberships were created; existing classes remain unlinked.
17. **Stable class IDs:** no class recreation, copying or replacement. Populated-upgrade tests compare existing rows, including IDs and timestamps.
18. **Record Sync:** snapshot/apply RPCs, revision triggers, idempotency and history business logic are unchanged. Existing database tests now run against the complete migration chain.
19. **What Changed:** unchanged and class-scoped; Section activity creates no versions.
20. **Attendance:** remains class-scoped. No advisory attendance was added.
21. **Privacy:** no LRN, external reference, learner number or student number storage added.
22. **Scope:** no report-card, SF9, Section grade-book, subject catalog, organization or membership tables; no navigation renaming or Section screens. Section archive affects only Section lifecycle. Roster membership never automatically synchronizes between classes and Sections.

## Validation results

23. **Full chain:** all migrations 0001–0016 pass in an empty PGlite environment, with only Supabase-owned auth/storage scaffolding and the pgcrypto-extension availability substitution. A populated 0015 upgrade preserves class/learner/assessment IDs, metadata, scores, attendance, grading config, reports, term-4 records, history and revision; all old class links remain null.
24. **Batch 1 tests:** 37 passed: 22 database/migration tests, 13 action tests, 2 import UI tests. Parameterized and combined cases cover the requested relationships, lifecycle, security and context scenarios. The exact rollback-only remote SQL smoke script also runs locally.
25. **Record Sync:** existing model, workbook, UI and 10 database transaction tests passed. A new linked-class sync test also passed. Existing current three-term rules remain intact; legacy term-4 data is retained.
26. **Other regression tests:** invite/access/actions/form/database, exams, grades, roster, create-class, activity slots, class overview data, learner page, workbook grading parser and DepEd grading passed. Across the selected suites: **151 tests passed in 20 files** (37 new + 114 existing).
27. **Typecheck:** `npm run typecheck` passed after final code/test changes.
28. **Lint:** ESLint passed for all changed application/test TS/TSX/MJS files. `git diff --check` passed.
29. **Production build:** `npm run build` passed. Using that local production build against the verified remote database, **15 authenticated pages passed with a null Section link**: Today, Classes, class overview, learners, assessments, scores, term grades, attendance, records, sync, export, Check, Reports, Ask and Settings. Temporary browser test account/class were deleted.
30. **Remote Supabase:** verified new project `qsmyzajvkpkdsmwezwfa` against app URL, service credential project and local CLI link without printing secrets. Existing required tables/functions were present, but the prior migration ledger was empty. Installed only 0016 in a transaction, recorded 0016 as applied, and aligned the final whitespace-only validation checks. Final migration-list verification shows 0016 applied. Final rollback-only smoke passed: tables/column/RLS/grants, active owner, anonymous and suspended denial, admin isolation, cross-owner FK rejection, context checks, deletion protections/account cascade, existing sync score/history, current class projection and null link behavior. All SQL smoke fixtures rolled back. A separate real PostgreSQL two-session test confirmed a Section edit waits for a concurrent class link and then rejects incompatible grade context; its temporary account was removed.
31. **Failures:** no remaining failures in the selected validation. Initial new-test fixture issues were corrected. An automatic approval-review usage limit briefly blocked the final remote text-check adjustment; retry through normal approval succeeded. Previously known failures outside these selected suites were not rerun or represented as fixed. No claim is made that the entire repository lint/test suite passes.

## Files and handoff

32. **Created:**
   - `supabase/migrations/0016_academic_sections.sql`
   - `src/features/sections/context.ts`
   - `tests/helpers/database.ts`
   - `tests/academic-sections-database.test.ts`
   - `tests/academic-sections-actions.test.ts`
   - `tests/academic-sections-import.test.tsx`
   - `tests/academic-sections-browser.mjs`
   - `tests/sql/academic-sections-smoke.sql`
   - `docs/academic-sections-batch-1.md`
33. **Modified:** `src/types/domain.ts`; class `details-actions.ts`; learner `actions.ts` and `roster-import.tsx`; settings `actions.ts`; `tests/record-sync-database.test.ts`.
34. **Remaining risks/limits:** older migration ledger entries 0001–0015 are absent despite installed schema. They have not been blindly marked applied or replayed. Reconcile the old schema against those migrations before a future general `supabase db push`. Imports retain their pre-existing multiple-request behavior for unrelated failures. Concurrent transactions can fail and require retry; inconsistent class/Section context cannot be committed. Repeatable-read behavior is reasoned from the row-version strategy and PostgreSQL isolation rules, rather than claimed as a completed two-session test at that isolation level.
35. **Manual steps:** deploy the application changes when ready; the new database migration is already installed. No teacher setup/backfill is needed. Audit/reconcile the pre-existing migration ledger before future CLI pushes. Changes remain uncommitted and unpushed; no secrets or build/signing artifacts are staged.
36. **Suggested commit:** `feat: add academic sections foundation`.

## Repeating the checks

Run the new foundation and database regression tests:

```powershell
npm test -- --configLoader native --pool=threads tests/academic-sections-database.test.ts tests/academic-sections-actions.test.ts tests/academic-sections-import.test.tsx tests/record-sync-database.test.ts
npm run typecheck
npm run build
```

Only after verifying the intended linked project, the committed SQL smoke script may run through `supabase db query --linked --file tests/sql/academic-sections-smoke.sql`. It encloses all fixtures in a rollback transaction and does not touch real user data. The browser check requires a locally running production server on port 3316 and `SECTIONS_TEST_PROJECT_REF` explicitly set to the verified project; it creates/deletes one temporary test account and keeps credentials only in process memory.

For a further two-session concurrency smoke on controlled disposable fixtures:

1. Create an active test owner, an unlinked Grade 8 class and compatible Section.
2. Session A: `BEGIN; UPDATE classes SET section_id = '<section>' WHERE id = '<class>';` Leave the transaction open.
3. Session B: `BEGIN; UPDATE sections SET grade_level = 'Grade 9' WHERE id = '<section>';` It must wait.
4. Commit A. B must reject the incompatible update; roll B back. Verify both committed grades match.
5. Reverse the order: update the unlinked Section first, hold that transaction, then try linking the old-grade class. Linking must reject after the Section edit commits.
6. For repeatable-read coverage, establish B's snapshot before A changes the Section row, then repeat. A serialization failure is also a valid safe result; retry the whole rejected transaction.
7. Delete only the temporary test account, which cascades its fixtures.

The repeatable-read retry behavior follows [PostgreSQL transaction isolation documentation](https://www.postgresql.org/docs/current/transaction-iso.html). The deliberately updated Section row makes concurrent changes visible as a row-version conflict, rather than relying on a lock alone.
