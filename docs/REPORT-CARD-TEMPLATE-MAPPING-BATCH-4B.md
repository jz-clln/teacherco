# TeacherCo Batch 4B — Manual template mapping

Implemented October 6, 2026. Open **Settings → Academic tools → Report card templates → a template → Map template**. This batch assigns meanings to workbook locations. It does not generate report cards or insert learner/Grade Book data.

## Migration and persistence

`0019_report_card_template_mappings.sql` follows verified migration 0018. It adds one table, `report_card_template_mappings`, with UUID identity, teacher/template ownership, versioned JSON definition, integer revision, draft/reviewed status, and timestamps. `template_id` is unique and references the immutable template with cascading deletion. There are no Section or Section-subject foreign keys.

One current mapping is stored per template. Creation starts at revision 1. Saves retain identity and increment revision. Reset deletes the current record; a recreated mapping gets a new UUID, so an old revision-1 editor cannot overwrite a recreated revision-1 mapping. Reset requires confirmation and the expected mapping UUID/revision. Template deletion also removes its mapping, and its confirmation now says so. Existing account delete-all behavior cascades through the template.

Only revision-checked save/reset RPCs mutate mappings for ordinary users. Both serialize operations by locking the owned template row, check active verified access, and reject stale identity/revision before writing. Archived templates expose their mappings read-only. Stale edits use SQLSTATE `PT409`, not `40001`: Supabase documents that intentionally raising `40001` can trigger [automatic transaction retries](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b). HTTP 409 returns the conflict promptly and leaves unsaved edits visible.

## JSON format

```json
{
  "formatVersion": 1,
  "templateSha256": "<64-character lowercase source SHA-256>",
  "fields": {
    "learner_name": { "sheet": "Front page", "address": "C8:F8" },
    "lrn": { "sheet": "Hidden lookup", "address": "A1" }
  },
  "periods": [
    { "key": "period_1", "label": "Term 1" },
    { "key": "period_2", "label": "Term 2" },
    { "key": "period_3", "label": "Term 3" }
  ],
  "subjects": [
    {
      "key": "878ef6bd-9917-47ca-8e43-1db016ad0439",
      "label": "Mathematics",
      "labelLocation": { "sheet": "Front page", "address": "B15" },
      "outputs": {
        "period_1": { "sheet": "Front page", "address": "D15" },
        "period_2": { "sheet": "Front page", "address": "E15" },
        "period_3": { "sheet": "Front page", "address": "F15" },
        "final_grade": { "sheet": "Front page", "address": "H15" },
        "remarks": { "sheet": "Front page", "address": "I15" }
      }
    }
  ]
}
```

The displayed hash placeholder above is illustrative; real definitions require the exact stored source hash. Subject keys are stable UUIDs independent of their editable labels. Identical display labels do not imply the same subject. All sheet names are exact and case-sensitive.

Scalar keys are `learner_name`, `grade_level`, `section_name`, `school_year`, `adviser_name`, `school_name`, `school_id`, `lrn`, `final_average`, and `general_remarks`. Each holds only a location. There is no field for an actual learner LRN or a generated value, and strict schemas reject extra value/content properties.

Period slots are `period_1` through `period_8`, with teacher-defined labels. Period count, terminology and subject positions are never inferred. Removing a period clears its local output assignments after confirmation. Subject rows may use unrelated positions or different sheets; their label location and each output location are independent. Every scalar/subject output is optional. Drafts may be partial, and reviewed status means the teacher reviewed internal consistency, not that a future Section is generation-ready.

## Routes, components and actions

- New route: `/report-cards/templates/[templateId]/mapping`.
- `MappingWorkspace`: guided learner/school, grade table, optional-field and review steps; explicit assignment, removal, review, save/draft, reopen and confirmed reset.
- `MappingLink`: entry from the existing detail page.
- Existing `TemplateViewer`/`WorkbookGrid`: optional selection callback and restrained location outlines/tooltips. The default Batch 4A viewer stays read-only and keeps its cell inspector, sheet switching, coordinates and formatting.
- `reviewMapping`: authenticates, loads immutable source bytes, verifies the hash, parses safely and validates/canonicalizes the proposed definition; no mutation.
- `saveMapping`: repeats server validation and calls `save_report_card_mapping` with expected identity/revision and explicit status.
- `resetMapping`: verifies ownership and confirmation, then calls `reset_report_card_mapping` with expected identity/revision.
- `readMapping`: owner-scoped read for the protected route.

Selections and assignments stay local until explicit save. A selected cell can be assigned to a scalar, subject label or output slot. Range mode uses two grid clicks on the same sheet; a labeled A1 input also supports exact manual entry. Hidden sheets require explicit selection. A range reserves a single output area anchored at its top-left cell; it does not define an array of learner values or a fill operation.

On wide screens the existing workbook occupies the main column, with mapping controls alongside. On mobile/tablet the workbook comes first and controls follow below. Existing solid surfaces, restrained green outlines and 44px app controls are used. Workbook font/fill colors are unchanged; mapped meanings appear in tooltips and the assignment list. Long labels wrap. No global navigation redesign, extra grid framework, or new dependency was introduced.

The review lists exact locations, periods, subjects and non-blocking omissions. Clearing an assignment invalidates the previous review. Save/draft buttons become available after server validation. A synchronous pending lock prevents repeated writes. Stale conflicts do not silently merge or overwrite; the teacher can reopen the current saved mapping. A before-unload warning protects unsaved drafts on document navigation/closing; confirmed reopen bypasses a redundant second browser prompt. Changes are not autosaved.

## Validation and security

Server validation checks the uploaded source size/hash again and parses using Batch 4A's bounded ZIP/OpenXML reader. Only supported worksheet types can be mapped. Existing protection, encryption, macro, XML, XSS and external-reference handling remain unchanged. The parser exposes server-side merge rectangles and supported worksheet names without retaining protection hashes or cell contents in the mapping.

Every target must reference an exact existing sheet and a valid uppercase A1 cell/rectangular range within that sheet's bounded preview extent (maximum 2,000 rows × 128 columns). Selecting any cell within a merge canonicalizes it to the entire merged range. Partially intersecting merges are rejected. Rectangular overlap checks include all scalar, subject-label and grade-output assignments. Separate meanings cannot share or overlap an output area, including two different addresses inside the same merge.

Strict versioned JSON accepts only supported keys, labels and locations; duplicate period keys and subject UUIDs fail. Outputs cannot reference undefined period slots. Limits are 8 periods, 60 subject rows, 120-character labels and 128 KiB serialized JSON. Database validation independently enforces JSON shape, source hash, metadata sheet/bounds, uniqueness, target-range overlap and ownership. Full merge/type validation requires the actual workbook and runs in server review/save; future generation must revalidate the source and mappings too, including definitions submitted through direct authenticated RPC calls.

The mapping table has owner-select RLS plus restrictive active/verified access. Anonymous/public privileges are revoked, and authenticated table writes are denied. Security-definer RPCs have an empty search path, explicit authenticated ownership/access checks, and execute grants only to authenticated callers. Another administrator has no cross-owner bypass. Guard triggers also reject mismatched owner/template/hash and invalid identity/revision during privileged mistakes. Normal mapping actions use the cookie-authenticated client, never the service role.

## Verification

- **47 new tests pass:** mapping schema/normalization, flexible 3/4/8/custom periods, arbitrary subjects, merged and hidden-sheet locations, invalid/missing/out-of-bounds locations, overlap rejection, hash mismatch, strict value rejection, source-byte preservation, read-only review, explicit persistence, stale save/reset/recreated identity, active-access RLS, direct-write denial, reset/cascade and grid markers.
- **275 selected regressions pass:** all 47 Batch 4A tests, Grade Book, section actions/database/workflows, record sync, access controls, Ask, PWA cache and slot export. The previously documented unrelated Reports AI failures are outside this selected run; no AI code changed.
- **Migration chain:** 0001–0019 passes locally. A populated 0018 upgrade compares all existing public rows before/after; source/template rows remain unchanged. Grade Book regressions and the browser fixture snapshot cover existing academic data.
- **Typecheck:** passes. **Focused ESLint:** passes. **Production build:** passes with the new route. **`git diff --check`:** passes; existing Windows line-ending notices only.
- **Browser smoke passed:** `tests/report-card-mapping-browser.mjs` uses a production server on port 3329, ordinary authenticated feature actions, and synthetic protected workbook/academic fixtures. It exercises mapping, source hashing, unchanged Grade Book snapshots, two-tab conflicts, access restrictions, reset and the original viewer. Three workspace surfaces are captured at 320, 360, 390, 430, 768, 1024 and 1440px; no horizontal page overflow. Mobile review screenshot visually inspected.
- **Remote:** migration 0019 applied alone to verified project `qsmyzajvkpkdsmwezwfa` and recorded in its ledger. During this batch, only its two new RPC definitions were corrected to PT409, matching the final migration; earlier migrations were not replayed. Browser fixtures are cleaned in `finally` after successful and failed runs. Final remote checks confirmed zero temporary mapping users, fixture templates, mapping rows and source objects; RLS is enabled, authenticated direct UPDATE is denied, and both RPCs contain the non-retrying PT409 conflict handling.

## Limits and next steps

No automatic/AI mapping, subject detection, Section binding, workbook rewriting, LRN values, grade insertion, completed XLSX/PDF/ZIP, or report-card history is implemented. Batch 5 has not started. Protected workbook/sheet editing settings remain intact, and the viewer remains read-only.

This is one current definition, not mapping history or collaboration merge resolution. Custom scalar keys and attendance structures are deferred; the ten supported scalar keys and arbitrary teacher-labeled subject rows cover this batch. Preview bounds and approximate rendering remain Batch 4A limits. Each review/save re-downloads and parses the bounded workbook, so large sources take longer. Unsaved changes do not persist across browser restarts; use Review → Save draft to continue later. Ordinary in-app navigation still requires teachers to heed the visible Unsaved changes notice.

Before deploying, push the code through the normal workflow. Migration 0019 is already applied to the verified project; do not replay it there. No new environment variable, service key or dependency is required. For another environment, apply migrations normally. No commit/push was performed.

## Files

Created: migration 0019; `src/features/report-card-mappings/{model,data,actions,link,workspace}`; the `/mapping/page.tsx` route; `tests/helpers/mapping-fixture.ts`; `tests/report-card-mapping-{model,database,actions,ui}.test.ts[x]`; browser harness; this handoff.

Modified for 4B: template detail page, shared viewer and workbook parser, template delete confirmation, and `tests/helpers/database.ts` (default migration chain 19). Prior uncommitted Batch 3/4A files and the pre-existing deleted handoff ZIP remain untouched by this batch's scope.

Suggested commit: `feat: add manual report card template mapping`.
