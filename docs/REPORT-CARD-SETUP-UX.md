# Report card setup

The workflow uses three steps: Template, Match subjects and terms, and Preview and download. Matching still requires teacher confirmation before saving, and preview/download retain the existing grade and formula checks.

Grade Book setup shows subjects as compact rows. Add subject manually and Edit open a native modal with the existing custom subject dropdown. Optional code/category fields are collapsed. Cancel or Escape discards the modal draft. Add subject / Apply changes stages the row; Save setup persists the complete setup through the existing action and concurrency checks.

New rows have a red Remove action. Existing saved subjects retain Make inactive / Reactivate, preserving previous grades. Grading-period editing is collapsed behind its current-period summary. No schema or database changes are required.

Section navigation displays a circular pending indicator. Its route template resets the loading boundary between tabs, keeping the Section header and navigation in place. Report-card operations show a prominent animated logo status panel; buttons remain lighter and disabled while pending, without loading logos.

Validation includes popup cancellation, removal of new rows, cancelled edits, retention of saved subjects, saved/custom subject selection, and the existing report-card generation browser regression.

Validated: 10 focused tests, typecheck, lint, production build, and production-mode browser regression passed. The browser run covers a mobile subject popup, desktop setup, animated pending feedback, seven responsive widths, single XLSX / bulk ZIP downloads, unchanged source workbook and grades, stale-review rejection, and access controls. Temporary test data was removed.
