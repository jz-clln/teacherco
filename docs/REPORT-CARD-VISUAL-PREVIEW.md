# Filled report-card preview

The popup fills the viewport. The workbook occupies the left side; the right sidebar contains its title, close/mapping actions, worksheet selection, zoom, navigation and notes. Mapping uses the same arrangement. The former footer arrows, row/column summary and Cell details toggle are removed. Larger sheets remain accessible through Go to rows and Go to cell in the sidebar.

After saving matches and preparing the learner review, Preview report card opens a read-only workbook popup for the selected learner. It uses the same writer as XLSX generation, with existing cell layout, borders, merged ranges, worksheet navigation and zoom. Temporary LRN values are included only for the selected learner and remain unsaved.

The server verifies ownership, active access, the reviewed mapping and snapshot digest before creating the in-memory workbook, then checks access and freshness again before returning bounded worksheet data. No workbook, grade or profile is written. Mapped formula replacement is simulated for preview only; the download confirmation remains required.

Map missing fields opens the template mapping editor. Separate links lead to Grade Book values and Section details, since mapping cannot supply missing grades or metadata. After editing a mapping, mark it reviewed and reload/save matches before generating again.

Viewer limits remain visible: Poppins fonts, no rendered embedded images/charts, and no Excel formula recalculation. This is a workbook layout preview, not a pixel-perfect Excel print/PDF rendering.

Validation: 25 focused tests, typecheck, lint and production build passed. The production-mode browser regression verifies populated cells, zoom, mapping navigation target, popup closure, XLSX/ZIP downloads, original workbook preservation and existing access/stale-data checks. Temporary fixtures were removed.

Restored preview integration: Preview report card and Map missing fields are grouped with the learner selector at the top of Step 3, before temporary LRN inputs. The restored integration passed 23 focused tests, typecheck, lint and a fresh production build.
