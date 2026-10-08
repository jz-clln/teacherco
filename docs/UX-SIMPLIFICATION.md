# TeacherCo UX simplification

The report-card mapper now uses a viewport-height workspace. Desktop keeps the
workbook, selected location and Save visible while mapped fields scroll inside
the side panel. On mobile, selecting a cell opens a modal bottom sheet; View
mappings opens the compact field list separately.

Assignment is direct: select a cell, choose its meaning, Assign, then Save mapping.
Save runs the existing validation before saving. Review, draft save, reopening
and reset remain under More. Assignments stay local until explicitly saved.

Learner fields use rows, only one subject expands at a time, and period editing
is collapsed initially. Manual addresses, merged cells, ranges, hidden sheets,
formula inspection and stale-revision protection remain available. Dropdowns
use the existing application Select component.

Sections, roster, Grade Book, report-card generation and template screens have
shorter copy and quieter secondary actions. Application action links retain
focus indicators and no longer underline on hover. Document links and workbook
formatting retain their appropriate styles.

This pass does not change database schema, mapping definitions, Grade Book
calculations, generation or original workbook bytes. Earlier Batch 6 and
school-year fixes already present in the working tree are separate changes.

## Validation

- Automated suite: 571 passed, 1 skipped.
- Typecheck, lint and production build passed.
- Mapping browser coverage: 320, 360, 390, 430, 768, 1024 and 1440 px widths;
  page overflow, visible Save/assignment, internal scrolling, mobile assignment
  and Escape dismissal, scalar/subject/period/range/hidden-sheet mapping,
  review/draft/save/reopen/reset, stale edits, source SHA-256 and access isolation.
- Generation browser regression: single XLSX and bulk ZIP, explicit bindings,
  readiness, formula confirmation, missing/zero/Unicode values, protected and
  hidden sheets, unchanged source/academic data and seven responsive widths.
- Template browser regression: upload, inspection, rename, archive/reactivate,
  download, duplicate detection, deletion, source SHA-256, access isolation and
  four surfaces at seven responsive widths.
- Temporary browser accounts and synthetic workbooks are removed by each harness.

Browser screenshots are under ignored `test-results/report-card-mappings/`.
No application deployment is included.
