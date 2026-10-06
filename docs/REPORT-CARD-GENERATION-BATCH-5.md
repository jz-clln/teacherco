# Batch 5: Report card generation and Section compatibility

Teachers can open **Section → Report Cards**, select an active template with a reviewed mapping, explicitly bind its periods and subjects, review missing data and exact output coordinates, then download one XLSX or a ZIP of all active learners. No global navigation item, PDF generator, AI grading, or permanent report-card history was added. Batch 6 is not started.

## Database and deployment

Verified the linked project against `.env.local` and confirmed the latest remote migration was `0019`. Applied only `0020_report_card_generation_profiles.sql` in a transaction and recorded `0020` as applied. Earlier migrations were not replayed.

`report_card_generation_profiles` holds one current configuration per `(section_id, template_id)`:

- `id`, `teacher_id`, `section_id`, `template_id`
- `mapping_id`, `mapping_revision`, `template_sha256`
- `bindings`, `revision`, `created_at`, `updated_at`

Example configuration, with actual UUIDs replacing the placeholders:

```json
{
  "periodBindings": { "period_1": "SECTION-PERIOD-UUID" },
  "subjectBindings": { "TEMPLATE-SUBJECT-UUID": "SECTION-SUBJECT-UUID" }
}
```

No grades, learner values, LRN, output bytes, or generation history are stored in this table. Section, template, mapping, and account deletion cascade to the configuration. Resetting/recreating a mapping requires a new configuration. Editing a mapping invalidates the saved mapping revision until compatibility is confirmed again.

Authenticated clients have owner-filtered SELECT access only. Configuration writes go through `save_generation_profile`, with active/verified access, active owned Section/template, reviewed owned mapping, exact source hash, exact active Section UUID bindings, and expected profile identity/revision checks. Triggers also validate privileged insert/update mistakes. Cross-owner administrator access is not allowed. Business conflicts use `PT409`, avoiding the PostgREST retry behavior of serialization-error codes.

`report_card_generation_snapshot` returns one consistent SQL snapshot for the authenticated owner. It includes active learners, active subjects/periods, saved Grade Book cells, source/mapping/profile identities, Section metadata and the reliable adviser source. It does not mutate academic data. Query limits return an extra sentinel row; the application rejects oversized snapshots instead of silently truncating them.

## Teacher workflow

1. Only active templates with reviewed mappings appear in the template selector.
2. Every template period and subject starts unbound for a new profile. Teachers choose Section UUIDs explicitly and check a confirmation before saving. Labels never trigger automatic matching. Previously confirmed bindings can be reloaded and edited.
3. Readiness verifies the actual source SHA, revalidates mapping coordinates/merges against that workbook, validates compatibility, and reports active learner, complete, and missing-data counts.
4. Missing-data warnings are shown per learner, with the first 12 warning labels and a remaining count for large mappings. Selecting a learner shows every mapped field, worksheet/range, and exact value. Preview does not modify a workbook.
5. Generation requires confirmation that the teacher reviewed the saved Grade Book and accepts the missing values. Replacing a mapped ordinary formula requires a separate confirmation.

Archived Sections display a read-only explanation. Loading messages, disabled controls and an immediate request lock prevent repeat-click requests. Compatibility edits invalidate readiness. A stale download is rejected and must be reviewed again.

## Deterministic source rules

| Mapped value | Source |
| --- | --- |
| Learner name | Active Section learner's `display_name` |
| Grade level, Section, school year, school name, school ID | Section fields |
| Adviser name | Account profile `full_name`, only when the Section identifies the owner as its adviser through `is_adviser` |
| Subject label | Explicitly bound active Section subject name |
| Period grade | Saved Grade Book cell for the exact learner, Section subject UUID, and period UUID |
| LRN, final average, general remarks | Missing/blank: no authoritative source in this batch |
| Subject final grade and remarks | Missing/blank: no authoritative Section value or universal calculation rule |

The existing Grade Book has no separate review-status flag; its saved values are used after the teacher's generation-time review confirmation. No class-text inference, period averaging, AI calculation or Passed/Failed inference occurs. Missing and null values clear the mapped cell; numeric zero remains numeric zero. Manual generation-time overrides are not supported, so LRN is never collected or persisted by this workflow.

## Generation and OpenXML strategy

Runtime generation does not round-trip through ExcelJS. ExcelJS is used only by tests to build fixtures and verify generated files can be opened.

The server downloads the immutable original using the existing private source helper, verifies its size and SHA-256, then runs the existing Batch 4A ZIP/OpenXML safety parser and Batch 4B mapping validator. No validation, encryption, external-reference, or XSS rule is relaxed.

The writer resolves worksheet parts through package relationships and records XML spans with SAX. It patches only the mapped top-left cell (the merge master for an exact merged mapping). Other cells in a rectangular range remain unchanged. Existing cell styles and unrelated children are preserved. Missing rows/cells are inserted in coordinate order. The source buffer is never mutated or uploaded again.

Strings use escaped inline strings, including literal Excel escape-sequence protection. Formula-looking text stays text. Grades use numeric values. The writer removes only the mapped cell's prior formula/value/inline-string children and replaces its value type as necessary. It preserves namespace prefixes and UTF-8/UTF-16LE encoding for modified worksheet XML.

Unmodified ZIP entry contents remain byte-for-byte identical after decompression: styles, shared strings, images, drawings, chart parts, relationships, workbook properties, sheet order, hidden-sheet state, print settings and protection metadata are retained. Within modified worksheets, untouched XML spans—including unmapped formulas and protection elements—remain unchanged. The generated ZIP container can have different compression/headers; the stored source retains its original complete bytes and SHA.

Ordinary mapped formulas are listed by coordinate and require explicit replacement confirmation. Unmapped formulas are preserved and never evaluated. Shared, array, data-table and calculation-chain formula targets are blocked conservatively because replacing them could require modifying unrelated parts. Digitally signed packages are blocked. Normal workbook/worksheet editing protection is preserved; encryption is still rejected. Password verifiers are never exposed in readiness or compatibility responses.

## Delivery, privacy and limits

`POST /api/sections/[sectionId]/report-cards/generate` produces one private, `no-store`, `nosniff` attachment response. It checks request origin and limits its streamed JSON body to 4 KiB. It uses normal authenticated Supabase access, not service-role credentials.

Before generating, the server rechecks ownership, active account/Section/template, reviewed mapping, source SHA, mapping identity/revision, profile identity/revision, active bindings and learner membership. A SHA-256 digest of the reviewed snapshot detects data changes. A fresh access/snapshot check immediately before delivery catches edits made during generation.

One learner downloads `Learner-Name-Report-Card.xlsx`. All active learners are generated sequentially in one server request and downloaded as `Section-Name-Report-Cards.zip`. ZIP entries receive a numeric prefix to avoid duplicate-name collisions. Filenames are sanitized and never include an LRN field.

No generated files are uploaded to Storage, public URLs are not created, and no history rows are written. Output buffers are scoped to the request; browser object URLs are revoked after downloading. Existing service-worker rules keep application data network-only.

Initial limits are explicit rather than partial exports:

- 50 active learners per bulk ZIP; larger Sections can generate individual cards.
- 3 MiB maximum source workbook for this exporter and 3 MiB maximum delivered XLSX/ZIP, leaving room below the deployment response cap. Batch 4A's 10 MiB upload/view limit remains unchanged.
- 12 MiB maximum aggregate XLSX buffers before ZIP compression.
- Readiness supports up to 500 active learners, 500 active subjects and 30,000 saved grade cells per Section.
- The existing parser's workbook complexity limits still apply. Generation additionally requires explicit, ordered row/cell coordinates.
- No background jobs, resumable exports, PDF, manual LRN entry, calculated final grades, formula engine, or permanent history in this batch.

## Validation

Unit/database/component/route coverage includes profile create/update/conflicts, owner/admin/inactive/unverified/anonymous denial, source and mapping staleness, exact arbitrary UUID bindings, three/four periods, missing/zero semantics, no automatic label matching, formula confirmation, merged output, Unicode/XML escaping, original SHA, generated XLSX loading, preserved unrelated parts/images/drawings/charts/hidden sheets/protection/unmapped formulas, one/bulk output, no LRN payload storage, inactive learner exclusion, archived Sections, request-size/origin/privacy handling, loading locks and readiness invalidation.

Commands:

```text
npx vitest run tests/report-card-generation tests/report-card-template tests/report-card-mapping tests/section-gradebook tests/record-sync tests/class-overview --configLoader native --pool threads --maxWorkers 2
npm run typecheck
npm run lint
npm run build
```

Production build and typecheck pass. Focused lint on all Batch 5 files passes. Repository-wide lint currently reports six pre-existing errors: `use-dictation.ts` (`react-hooks/set-state-in-effect`), and CommonJS imports in local `test-results/commit-batches.cjs` and `test-results/supabase-inspect.cjs`; it also reports two unused-argument warnings in `reports-evidence.test.ts`. These unrelated files were not changed.

Final regression result: **246 tests passed across 23 files**, including **39 Batch 5 tests**. Batch 4A viewer/parser, Batch 4B mappings, Section Grade Book, Class Record Sync and class overview regressions passed. `git diff --check` passed (only existing Windows line-ending notices).

The opt-in `tests/report-card-generation-browser.mjs` uses synthetic temporary accounts against the explicitly matched linked project, exercises the production UI/downloads and remote ownership/access rules, checks the source hash and academic snapshots, captures 320/360/390/430/768/1024/1440 px screenshots, and removes fixtures in `finally`. Service-role access is confined to test fixture setup/cleanup.

Final browser/remote result: **passed** against the local production build and linked Supabase project. Verified protected source upload, unbound initial selectors, explicit compatibility save, missing-data readiness, exact preview, formula confirmation, single XLSX, two-learner ZIP excluding an inactive learner, Unicode names, numeric zero, blanks, hidden sheets, source SHA and unrelated parts, unchanged academic data, no generated Storage objects, stale profile rejection, cross-owner administrator denial, pending/suspended denial, source-hash and direct-write rejection, archived Section behavior, and no document overflow at all seven widths. Temporary accounts, workbooks, profiles and academic fixtures were removed. Screenshots are under `test-results/report-card-generation/`.

The live download smoke identified and fixed a proxy-origin mismatch: request-origin validation now uses the actual request Host and forwarded HTTP/HTTPS protocol instead of Next's internal URL. A route regression proves proxied same-origin requests work while unrelated origins remain blocked. Browser validation used a local production server; the hosted Vercel application has not been deployed by this task.

## Changed files

- `supabase/migrations/0020_report_card_generation_profiles.sql`
- `src/features/report-card-generation/{model,data,actions,writer,workspace}.ts[x]`
- `src/app/(dashboard)/sections/[sectionId]/report-cards/page.tsx`
- `src/app/api/sections/[sectionId]/report-cards/generate/route.ts`
- `src/features/sections/area-tabs.tsx` (Section tab only)
- `tests/helpers/database.ts` (migration ceiling 0020)
- `tests/report-card-generation-{database,actions,writer,ui,route}.test.ts[x]`
- `tests/report-card-generation-browser.mjs`
- This handoff document.

Suggested commit: `feat: generate report cards from mapped templates`

Changes are not committed or pushed. The remote database migration is applied; the application must be deployed to expose the new workflow on the hosted site.
