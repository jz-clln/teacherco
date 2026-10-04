# Class record sync

Teachers can open **Class → Sync updated record**, or follow the sync link from **Import record**. Upload an updated `.xlsx`, review the comparison, confirm the workbook belongs to the class, and apply the changes. The existing first-import and pasted-roster flow remains available.

## Setup

Apply `supabase/migrations/0015_class_record_sync.sql` after migrations 0001–0014, then deploy the web app. The existing server-only `SUPABASE_SERVICE_ROLE_KEY` is required for the atomic apply RPC; it must never be a public environment variable. This implementation does not deploy the migration or change production data. Until the migration is installed, the sync page displays a setup message and disables upload.

## Supported changes

- New learners in the uploaded main roster, matched against this class by normalized first/last name. Duplicate matching names and inactive enrollments block sync for correction. A new name creates a separate learner in this class; linking learners across classes remains in the existing import flow.
- New and corrected raw scores, including zero, using the existing Excel term-sheet detector. Supports three terms. Matches activity titles/destinations rather than row position.
- Printed initial grades, term grades and descriptors. These are the workbook's saved values; TeacherCo's existing grading rules remain unchanged.
- Attendance in visible sheets named `Attendance` or `SF2`, with recognizable learner names and full date column headings (`YYYY-MM-DD` or Excel date cells). Accepted statuses: `P`, `A`, `L`, `E`, or `present`, `absent`, `late`, `excused`, case-insensitive. Ambiguous day-only headings or other marks block sync with an explanation. Standard monthly SF2 files using only day numbers need full dates before this importer can use them.
- Missing learners, activities, term sheets, grades and attendance are shown as notices. Blank cells do not mean zero or deletion. Missing records remain saved. Renames appear as a new learner plus a missing learner; there is no automatic identity merge.
- Typed, checked and exported TeacherCo activities are protected. Their Excel columns are shown as protected, not overwritten.
- HPS changes are reviewed, including adjustments to existing component totals. A maximum cannot change while any saved score for that activity is omitted from the upload; this prevents inconsistent denominators. Empty recognized activities may be created, so the next unchanged upload compares cleanly.

The teacher reviews and accepts the whole valid comparison. Selective cell application, deletion of missing records, automatic restoration, and arbitrary attendance layouts are not part of this version. Cancel by leaving the page or choosing another file; comparison does not write records.

## History and privacy

Every successful sync stores an immutable-to-teachers version with normalized before/after records, recognized uploaded data, filename and comparison. The first sync captures the existing class state before any changes. Later ordinary edits do not alter those snapshots. Versions can be inspected and downloaded as JSON, including the previous state; these downloads are not original Excel workbooks. An unchanged upload does not create another version.

History loads 50 versions at a time, with Load older versions for earlier records. Large change groups show 100 rows initially, with Show more. Version comparisons are fetched only when opened. No original workbook, LRN, raw worksheet, or sex field is uploaded. Formula results must be recalculated and saved in Excel before upload. Files larger than 15 MB are rejected before parsing. Existing workbook parser limits (600 rows, 80 columns) also apply; sync rejects oversized visible sheets rather than silently truncating them.

History belongs to the class and is removed when that class/account is deleted. Existing RLS protects current records; history has its own active-owner SELECT policy. Authenticated/anonymous users cannot insert, update or delete history or call the privileged apply RPC. Private sync data uses server actions and the existing private-page/network-only service-worker policy.

## Reliability

The server authenticates the teacher, verifies ownership, validates recognized data, and recomputes the comparison. It never accepts browser-supplied learner IDs, assessment IDs or mutation plans. The service-only database function verifies active access and ownership again, locks the class, validates the review revision, and writes records and history in one transaction. Failure rolls everything back.

Revision triggers cover learner names, enrollment, assessments, submissions, printed grades, attendance and grading config, including the older import/manual/check paths. A transaction increments and locks each affected class once. Concurrent edits invalidate the review; PostgreSQL deadlock/stale errors ask the teacher to compare again. A stable request UUID makes retries after lost responses return the saved version without duplicate writes. The UI also uses a synchronous submit lock and visible progress.

## Validation

Run `npm test -- --configLoader native --pool=threads tests/record-sync.test.ts tests/record-sync-database.test.ts tests/record-sync-ui.test.tsx tests/record-sync-workbook.test.ts`.

Database tests execute the feature migration in PGlite with the actual related schema/RLS migrations. They cover atomic rollback, idempotency, revision changes through existing write paths, ownership, protected activities, and suspended access. These are local transaction tests; live concurrent PostgreSQL sessions and a deployed authenticated upload should be smoke-tested after applying the migration.
