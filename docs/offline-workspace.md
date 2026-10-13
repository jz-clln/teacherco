# Offline workspace

The website includes a public, precached workspace at `/offline-workspace.html`.
Open it from the app header or Settings → Offline. After initial online sign-in,
the app downloads the teacher's records into account-scoped IndexedDB. An uncached
page opened without connectivity falls back to this workspace. No authenticated
HTML, API response, session token, or learner record is stored in the service
worker's public asset cache.

## Available offline

- Create/edit/archive classes and Sections; restore archived records.
- Create/edit learners; enroll existing learners or remove roster memberships
  while retaining historical records.
- Take attendance, including for a class or learner created on the device.
- Create manual activities, enter/clear scores, and calculate term grades using
  the same grading engine as the online app and the cached class grading rules.
- View imported grades and checked scores. Their existing source protections
  remain in place; edit them through their original online import/Check workflow.
- Set up Section subjects and periods and enter manual Section Grade Book grades.
- Download/restore a device backup, including pending attendance. Restore requires
  the same account and no outstanding device work that would be overwritten.

AI, image checking, cloud imports, and preparing or changing report-card templates still need connectivity.
The workspace does not turn every server-rendered page into an offline page.
Teachers use the offline workspace for these tasks when disconnected.

## Sync and conflicts

Local edits and their outbox entries are saved in one IndexedDB transaction.
Related records upload in creation order before attendance. The app retries on
reconnect, focus, and every 30 seconds while open. Background delivery after the
browser closes is not promised. An expired session requires online sign-in.

Migration `0026_offline_records.sql` adds an invoker-rights RPC and account-scoped
operation receipts. RLS and relationship checks apply to every write. Stable
UUIDs and receipts make retries safe after a lost response. Receipts store only
opaque identifiers, not duplicate learner data. Record changes compare the
editable fields with their downloaded baseline; newer cloud values require
explicit conflict review. Unrelated fields are preserved. A conflict pauses the
queue to protect dependent changes.

Local revisions protect against edits in another tab, in-flight uploads and a
background refresh completing after a newer local save. Clearing the cache keeps
pending work and its dependent records. Backups remain important: browser data
can be cleared or evicted, and device storage is not a cloud backup.

## Rollout

1. Apply migration `0026_offline_records.sql` to the intended Supabase project
   before deploying the app (`supabase db push --linked`, after reviewing its
   dry-run output).
2. Build and deploy the app. `prebuild` compiles the existing TypeScript grading
   functions into the public offline module before the service worker is built.
3. Open the deployed app online and allow records/service-worker preparation to
   finish. Open Offline workspace, disconnect, save a synthetic test record,
   reload, reconnect and verify sync. Use the same browser profile throughout.

## Verification

The API and PGlite tests cover ownership, field validation, pagination, dependency
creation, conflict resolution, idempotency and deletion replay. Browser scripts
use synthetic local records and mocked cloud APIs:

```
node tests/offline-workspace-browser.mjs
node tests/offline-records-races-browser.mjs
node tests/offline-attendance-browser.mjs
node tests/offline-attendance-layout-browser.mjs
```

They default to a production server at `http://127.0.0.1:3336`; override with
`OFFLINE_TEST_URL`. Service workers are disabled in development mode.

## Offline report cards

While online, open a Section's Report Cards page, save its reviewed subject/term
matches, and choose **Save for offline**. The teacher's original workbook,
reviewed mapping, matches and printable layout are saved in account-scoped
IndexedDB. The package contains no prefilled learner grades or temporary LRNs.
Preparation requires access to the owned active Section and template and checks
that its source and matches did not change during preparation.

Open **Offline workspace > Report cards**, choose the saved template and learner,
and review the output. Generation uses the current device Section Grade Book,
including unsynced edits. Teachers can download Excel or print without a network
request. All connected periods are required for a final grade and remarks.
Changed grades, memberships or template copies require a new review before output.
Temporary LRNs remain in memory only. Refresh the offline copy after changing
mappings or matches online; cloud changes cannot be detected while disconnected.

The same cell writer, number formatter and print renderer are used online and
offline. Excel retains original workbook parts, including images and styles;
mapped grade cells are centered. Printing defaults to A4 and fit to width, limits
scaling to the available height to avoid splitting a report area, and also offers
Short/Letter. Fonts must be installed or already available on the device.
Unsupported drawings/charts can be omitted from print previews; Excel preserves
them. Formulas are not recalculated. Each saved copy is included in device backups.

Migration 0026 was deployed to the linked Supabase project on 2026-10-13. This
report-card feature does not require another schema migration. App deployment is
separate. The offline report engine is bundled by `scripts/build-offline.mjs` and
precached by the service worker alongside the workspace.

Run `tests/report-card-generation-actions.test.ts` first to generate the synthetic
fixture, then `node tests/offline-report-browser.mjs` against a production server.
The browser check disconnects before reloading, generates an Excel file, inspects
fonts/images/grades, invokes the print path, and checks local edits and mobile layout.
