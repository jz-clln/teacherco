# Batch 6 — report-card production hardening

## Size-limit solution

Upload and generation both accept sources up to 10 MiB. Direct responses remain limited to 3 MiB; larger validated outputs use private temporary Storage. Each generated XLSX is bounded at 12 MiB, aggregate archive input at 48 MiB, and final download at 50 MiB. Existing ZIP expansion, entry-count, XML, external-reference, encryption and XSS restrictions remain in force.

## Generation compatibility UX

Template preview and mapping show structural generation compatibility, source-size support, mapping review status, mapped-formula confirmation requirements and authorized-use/blank-template guidance. Section compatibility also checks the source before presenting bindings. Readiness distinguishes Available, Missing, Optional and Unsupported; numeric zero remains available. The workbook viewer remains read-only and ordinary workbook/worksheet protection stays intact.

## Ephemeral LRN design

LRNs are optional and offered only when mapped. Inputs accept 12 digits, preserve leading zeroes and bind to existing learner UUIDs. Teachers can paste one column in the explicitly displayed learner order; LRNs are never used to match learners. Values live in component state and the generation request, clear after every generation attempt or page departure, and are not written to learner records, profiles, history, filenames, analytics or application logs. Generated files necessarily contain supplied LRNs, including temporary private output until deletion. There is no LRN autosave or browser database/cache persistence.

## Temporary-output/download strategy

Migration `0021_temporary_report_card_outputs.sql` creates a private bucket and owner/access policies, not an output-history table. Paths contain expiry, owner UUID and random output UUID; no learner names or LRNs. Signing lasts 60 seconds, objects expire after 14 minutes, and the client acknowledges delivery through an authenticated owner-only cleanup endpoint. Failed delivery also attempts cleanup.

The authenticated application response is private/no-store. Browser Storage fetches use `cache: 'no-store'`, omit credentials and referrers, and the existing service worker treats these requests as network-only. Upload metadata requests private/no-store. Supabase's signed endpoint returns an Expires header instead of Cache-Control; its response lifetime is checked against the 60-second signing window. Do not interpret upload metadata as a guarantee of a no-store response header from that endpoint.

The deployed `report-card-cleanup` Edge Function accepts a separate secret held in Vault and function secrets. The active `teacherco-report-card-cleanup` cron job invokes it every minute when expired objects exist. It deletes through Storage APIs, never reads file contents, processes bounded batches up to 500 objects, and retries on later invocations. The installer writes temporary secret files with restricted permissions and removes them; secrets are not committed or printed.

## Output validation

Every XLSX is reopened and checked before download or archive insertion: ZIP CRC, safe OpenXML package, exact original part inventory, hashes of every untouched part, mapped cell contents/types, absence of formulas at written targets, and unchanged original source SHA-256. Protection and unrelated formulas, merges, hidden sheets and media are preserved. Validation uncovered and fixed a closing-cell offset bug when a mapped cell was last in its row. Validation errors contain no XML or learner values.

## Bulk-generation behavior

Batches are explicit, ordered, exhaustive and bounded by both 50 learners and estimated aggregate bytes. The server verifies batch boundaries and active learners. The UI names the learner range and tells teachers to download every listed batch. Each batch is one ZIP/request, not one request per learner. Actual output-size checks still apply; a failed oversized batch delivers no partial archive.

## Privacy/security changes

Ordinary generation, signing and acknowledgement use the authenticated owner's client. Only scheduled cleanup uses a server-side service credential. Cross-owner and administrative accounts gain no access to another teacher's files. Active verified access, same-origin requests, streamed request-size limits and owner paths are enforced. Overwrites are denied. No generated workbook or request body is logged by application code. Friendly errors avoid SQL, credentials, XML and LRNs. No public bucket or generated-output history was added.

## Stale-data handling

Generation compares the reviewed digest and profile revision against a fresh atomic snapshot. Section/template state, source hash, reviewed mapping, profile, explicit UUID bindings, active roster and Grade Book values are checked again before delivery. The private path repeats freshness/access checks before and after signing; failures trigger deletion and require a fresh review.

## Performance changes

Source parsing, mapping validation, XML trees, source ZIP and part hashes are reused inside each generation request. No long-lived learner-data cache is introduced. Every output still receives independent validation. Conservative bulk limits are retained.

Local synthetic measurements (milliseconds, rounded):

| Fixture | Learners | Source parse | Mapping validation | First XLSX | All XLSX writing + validation | ZIP | Total | Observed process RSS MiB |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Three terms | 50 | 15.8 | 4.1 | 11.5 | 237.7 | 18.5 | 285.0 | 211.5 |
| Four quarters | 50 | 2.3 | 0.4 | 3.8 | 202.7 | 18.8 | 225.9 | 260.1 |
| 4 MiB source | 10 | 2.7 | 0.3 | 72.1 | 640.5 | 1656.3 | 2330.0 | 288.8 |
| 9 MiB source | 4 | 8.0 | 0.6 | 75.8 | 315.4 | 1485.8 | 1844.7 | 376.8 |

RSS includes the test runner and earlier cases; these are local measurements, not isolated Vercel memory or network guarantees. Readiness took 1,361 ms end-to-end in the local production browser against remote Supabase with the 4 MiB fixture. This includes network and UI time; a Vercel production latency baseline remains to be measured after deployment. Raw benchmark output is generated under ignored `test-results/report-card-hardening/`.

## Test/regression results

Full regression run: 557 tests passed across 65 files; one opt-in performance test skipped in the normal run and passed separately. Request/download tests are included. Coverage includes generation, mapping, parser/protection, Grade Book, Sections, Class Record Sync, access/security, Reports/Ask, output tampering, large sources, LRN validation/privacy and exhaustive batch boundaries.

Validation also corrected test infrastructure: Vitest excludes Playwright specs, the score-sheet focus test flushes React state, and Reports tests mock the actual provider boundary. The dictation capability check uses a hydration-safe external-store snapshot; generated test artifacts are excluded from lint.

## Build/browser/remote results

Typecheck, lint and production build pass. Production-browser synthetic flow checks upload, explicit bindings, readiness, formula confirmation, single XLSX, bulk ZIP, Unicode, zero/missing values, hidden sheets, ordinary protection, unchanged source/academic data, stale review rejection, access boundaries and responsive widths 320/360/390/430/768/1024/1440. Large-output smoke verifies optional LRNs, cleared inputs, private downloads and delivery cleanup. Scheduled orphan deletion and actual signed-token/header expiry passed against the remote project using disposable fixtures. Final remote audit: zero synthetic accounts and zero temporary output objects remaining.

Migration 0021, the private bucket, cleanup function, Vault secret and active minute schedule are installed on the linked Supabase project. Application changes have not been pushed or deployed to Vercel.

## Remaining limitations

- Signed URLs are bearer capabilities for their short lifetime. Already delivered files cannot be revoked; teachers control downloaded copies.
- Cleanup is best effort on acknowledgement, with scheduled retries. A service outage can delay physical deletion; expired paths cannot be read through normal owner policies, but infrastructure administrators retain privileged access.
- Large workbooks remain subject to ZIP/OpenXML complexity limits, generated-size limits and the hosting function's runtime/memory limits. Batch estimates are conservative rather than exact.
- Unsupported formula structures, digital signatures and malformed coordinates remain blocked; no protection bypass, formula engine, PDF export or new major feature was added.
- Local production/browser validation does not replace a post-deployment Vercel smoke or production latency measurement.

## Files changed

- Generation: `src/features/report-card-generation/{actions,data,model,workspace,writer,compatibility,download-response,output-validation,request,temporary-output}.ts[x]`.
- Templates: `src/features/report-card-templates/{package,workbook,upload-form}.ts[x]`; template preview and mapping pages under `src/app/(dashboard)/report-cards/templates/[templateId]/`.
- API: generation and cleanup routes under `src/app/api/sections/[sectionId]/report-cards/`.
- Infrastructure: migration 0021, `supabase/config.toml`, `supabase/functions/report-card-cleanup/index.ts`, `scripts/install-report-card-cleanup.mjs`.
- Tests: generation actions/browser/UI, hardening, performance, temporary Storage/database, request/download-response, shared database helper, Reports evidence and score-sheet tests.
- Supporting validation: `eslint.config.mjs`, `vitest.config.ts`, `src/features/exams/components/use-dictation.ts`; this handoff.

## Concise commit name

`chore: harden report card generation for production`

Implementation references: [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions), [private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [downloads](https://supabase.com/docs/guides/storage/serving/downloads), [Storage response headers](https://github.com/supabase/storage/blob/master/src/storage/renderer/renderer.ts).
