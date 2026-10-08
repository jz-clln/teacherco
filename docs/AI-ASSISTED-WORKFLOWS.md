# AI-assisted grades and report cards

## Architecture

The new `assisted-workflows` feature prepares suggestions and review screens for
the existing Grade Book, mapping validator, generation profiles and XLSX writer.
It does not calculate official grades, decide pass/fail, invent missing values or
save AI output automatically.

Template uploads open analysis. A table proposal expands to the existing Batch
4B definition, including individual subject/period locations. The existing
validator checks the definition, source SHA, worksheets, A1 bounds, merged cells
and overlaps before review and again before saving. Review shows a short summary, then **Review N issues** for uncertain
fields and a grouped table confirmation. The manual mapper is under **More > Edit manually**. Manual editing retains the unsaved
proposal in tab-scoped session storage and uses the original mapper.

## Cost-first routing

Routing tries a confirmed reusable format, deterministic recognition, and local
filename/header normalization before constructing either AI provider. Known
formats and obvious labels make **zero OpenAI/JEV requests**. OpenAI is used only
for unresolved semantic meaning, followed by JEV routing and teacher review.
Approval-time grade validation never calls either provider.

Q1-Q4, ordinal/word quarters, First Grading (Period), Quarter One, terms,
semesters, Midterm and Final normalize locally. Period families remain distinct:
Quarter 1 is not silently treated as Term 1. Common subject aliases include
Math, AP, TLE, ESP and PE. Duplicate/ambiguous destinations remain unresolved.

## Providers and privacy

- `InterpretationProvider` has an OpenAI Responses adapter using strict JSON
  Schema, `store: false`, a bounded output and a 25-second timeout. The default
  model is `gpt-6-luna` with `reasoning.effort: low`. Its compact
  proposal is converted to the existing mapping schema, never directly persisted.
- `ConfidenceProvider` has a Typesafe adapter for `jev-latest` at
  `https://api.typesafe.ai/v1/systemone`. It asks typed choice/score questions.
  Accept requires strong evidence and a score of at least 0.95. Low-confidence
  or rejected suggestions require manual attention. Deterministic rejection
  takes precedence, regardless of confidence.
- Providers receive synthetic sheet IDs, coordinates, bounds, merges, cell types,
  formula locations and exact recognized structural labels. Unknown labels,
  actual sheet names, filenames, learner names/UUIDs, LRNs, numeric cell values,
  formula contents/cached results, raw workbooks and generated cards are excluded.
  Learner identity columns and values beside name/adviser labels are excluded even
  when a person happens to have an allowlisted word as their name.
- Provider request/response contents are not logged. Credentials are server-only.
- Unavailable, refused, malformed, oversized or timed-out AI responses fall back
  to local suggestions/manual controls. JEV failure routes suggestions to review.

The conservative label vocabulary intentionally favors privacy over recognizing
every school-specific label. Subject/period inference from filenames is local.
Learner matching and grade extraction run inside TeacherCo, never in either AI.

API references checked during implementation:
[OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
and [Typesafe OpenAPI](https://api.typesafe.ai/openapi.json).

## Grade Inbox and sync

The Section Grade Inbox summarizes completeness, discovers linked-class updates
and accepts up to ten Excel files. Discovery loads each source class once and
uses the existing deterministic grade preview. Automatic source matching requires
one unique normalized subject/alias and a recognizable Term 1-3 label. Conflicting printed
and calculated grades, ambiguous classes and custom period bindings stay in the
existing manual Grade Book import flow.

Sync requires teacher approval. Every differing existing grade gets Use/Keep
controls. Before writing, the existing class preview is rebuilt and its digest
checked. Existing Grade Book RPCs enforce access, roster membership, source
revision, grade bounds and expected cell timestamps.

## Excel imports and reusable formats

Files are processed sequentially, up to 8 MiB and 500 selected data rows each.
The Batch 4A parser retains ZIP/OpenXML protections. Files stay in request/browser
memory; this flow creates no raw-file storage objects.

Matches use UUID, then unique normalized names. Fuzzy candidates, duplicate
names, duplicate destination learners, invalid grades and differing current
values require review or an explicit skip. LRNs are never matching keys.
Detected Section mismatches require destination confirmation.

Analysis performs no grade writes. Import re-reads the uploaded file and Grade
Book, recomputes its digest and uses only values extracted from that file.
Client-supplied grade arrays are rejected. Blanks never erase existing grades;
zero and original numeric precision are preserved, independently of Excel display
rounding. Percentage/date display formats require review rather than an inferred
conversion. Formula grades use cached numeric results, without evaluation.

Migration `0023_assisted_grade_imports.sql` adds one owner-scoped format table
containing a fingerprint and numeric layout coordinates, plus an external-import
wrapper around the existing transactional grade saver. The wrapper records only
source SHA provenance. Database checks exclude arbitrary raw data from formats.
Fingerprints normalize period numbers, allowing the same layout in later terms.
Teacher-confirmed formats adapt to current row counts, within the 500-row limit.

Migration `0024_multi_period_import_formats.sql` extends that same format
metadata with up to eight grade columns and numeric period hints. It adds an
atomic wrapper around the existing saver: all reviewed period columns in one
file commit together or roll back together. Each column retains its own identity,
numeric checks, conflicts and expected timestamps. Blank cells are skipped;
existing grades remain intact. Remembered layouts never silently truncate a
larger roster. Format definitions contain no learner records or text labels.

The batch Import action applies reviewed files sequentially. Transactions are per
file, not across the entire batch. Partial success is reported;
stale remaining previews must be refreshed. Existing values are never silently
overwritten to make a batch succeed.

## Upload and review controls

Desktop widths at least 1024px with a fine pointer and hover show a solid drag
zone, visible drag-over state and keyboard-accessible Choose files button.
Mobile and coarse-pointer tablets show only the native picker action. File drops
outside the zone cannot navigate the browser. Both picker and drop paths validate
XLSX type and size; batch imports allow up to ten files.

Successful grades stay summarized. Review expands only conflicts, ambiguous
learners and invalid values. Subject/period/layout exceptions have the existing
custom dropdowns and bounded manual controls. Explicit import approval is always
required; no AI response writes grades.

## Report cards

Exact unique subject/period label matches prefill compatibility controls. The
teacher still approves new bindings. A single available reviewed template loads
its profile and readiness automatically; configuration collapses once readiness
is available. Generation, grade/formula approval, missing-value handling, stale
checks, private download handling and the writer remain in the existing flow.

## Activation and limitations

On 2026-10-08, migrations 0023 and 0024 were applied to project `qsmyzajvkpkdsmwezwfa` with user authorization. All 24 local migrations now match remote history; a final dry run reports no pending migrations. No application deployment was performed.

1. Database activation is complete. The existing schema was compared against a locally migrated database before repairing missing history entries for 0001?0015; those migrations were not replayed. The final schema comparison covered columns, constraints, functions, triggers, policies, indexes, RLS and storage bucket configuration.
2. Set `OPENAI_API_KEY` and `TYPESAFE_API_KEY` in server environment configuration.
   `OPENAI_WORKFLOW_MODEL` defaults to `gpt-6-luna`; reasoning defaults to low.
   Never use `NEXT_PUBLIC_` keys for these secrets.
3. Deploy the application after the migration. Without AI configuration, local
   suggestions and all manual workflows remain available.

Provider contracts are tested with mocked HTTP responses, not paid live calls.
Unknown/custom labels, unusual multi-sheet layouts and ambiguous source mappings
can require manual configuration. One file supports up to eight reviewed period
columns, including Q1-Q4. Class synchronization still requires an explicit source
term when the Section uses a different period family. XLS/XLSM/encrypted
workbooks remain unsupported; ordinary workbook/sheet protection remains accepted
and original bytes remain unchanged.

## Validation

Final automated run: 627 passed, one skipped (`test-results/friction-tests.log`). Typecheck, lint and production
build passed. Assisted-workflow browser smoke passed at all seven requested widths; manual
mapping and report-card generation regressions passed at seven widths.

Coverage includes provider JSON validation, JEV routing/failure, privacy boundaries,
table expansion, overlaps/invalid sheets, exact/fuzzy/ambiguous learner matching,
duplicates, invalid grades, conflicts, changed previews, explicit approval, numeric
format metadata/RLS, source provenance, zero and protected-workbook regressions.
The existing Batch 1–6 suite is included in the full test run.

Production browser smoke uses temporary synthetic accounts and cleans up:
linked-class discovery/sync, explicit conflicts, two-file previews, uncertain
matches, invalid grades, automatic template analysis, table confirmation, save,
source SHA, four-period preview, desktop drop state, keyboard picker, and
responsive/touch-only controls. External-import writes and format persistence
are tested against a local migrated Postgres-compatible database; the remote
database now includes migrations through 0024; schema verification found no unexplained differences (Postgres catalog-version and line-ending differences were normalized).

Suggested commit: `feat: streamline AI-assisted grade imports and template analysis`
