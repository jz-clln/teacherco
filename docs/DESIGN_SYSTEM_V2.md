# TeacherCo Design System v2

This is a presentation and navigation refactor on top of the existing Class Overview / What Changed work. It is implemented locally; it has not been deployed or committed.

## Design and behavior

1. **Design system:** calmer hierarchy, TeacherCo green and ivory, solid grouped surfaces, rows for individual records. Existing mascot and wordmark remain.
2. **Typography:** Poppins for identity, page/section headings and metric values; system UI for dashboard body text. Page titles 28px mobile / 30px desktop; section titles 20 / 22px; item headlines 17px; body 16px; supporting text 15px; metadata 13px; captions no smaller than 12px. Login/signup retain Poppins.
3. **Spacing:** tokens for 4, 8, 12, 16, 20, 24, 32 and 40px. Mobile content gutters 20px, desktop 32px, content maximum 1200px. Tables retain their own scrolling behavior.
4. **Radius:** controls 12px, grouped surfaces 16px, dialogs 24px. Real status/filter chips can remain pills.
5. **Surfaces:** ivory background, white content and floating controls, solid sage/warm secondary fills. Overlay scrims remain transparent intentionally.
6. **Borders/shadows:** light separators; content cards have no shadow. Floating disclosures and dialogs use the shared mild floating shadow.
7. **Buttons:** green primary at least 48px; secondary white/bordered; quiet links/actions; destructive styling reserved for existing destructive controls. Standard controls are at least 44px. Shared Button and Check button constants use the same styles.
8. **Motion:** press 120ms, hover 160ms, menus/page entry 200ms, disclosure 220ms, dialogs 260ms, success token 300ms. Small opacity/position changes; reduced motion disables animation, transitions, press transforms and smooth scrolling.
9. **Navigation:** desktop sidebar retained. Class text tabs scroll internally, with a green underline for the active route. Existing Scores and Term grades remain explicit destinations. Competency information remains in the existing Check results and Ask/report workflows; no invented competency backend or empty destination.
10. **Class Overview:** unboxed class identity, quiet Edit, primary attendance, visible record utilities, tabs, grouped metrics, grouped insight/attention sections and recent assessments.
11. **Visible actions:** Take attendance, Sync, Import, Export and Edit. Utilities are three equal columns on mobile.
12. **Contextual actions:** Add learner stays in Learners. The class Assessments page exposes New assessment with the existing classId preselection, Record scores and Term grades. The page reuses the existing guarded class read and Check assessment overview/row destinations.
13. **More:** only the existing class-specific Grading settings shortcut. No archive/delete/duplicate-class capability was invented.
14. **Metrics:** one surface, 2×2 mobile / four columns on wide screens, separators, neutral prominent values. Existing calculations and unavailable-value em dashes retained.
15. **What Changed:** heading and See all, one surface of up to four rows, direction words, evidence disclosure and exact version links. Existing ready/empty/unchanged/error/loading behavior and business logic preserved.
16. **Needs Attention:** up to three learner rows with reasons, See all / View all, distinct empty and error states; existing rules preserved.
17. **Recent assessments:** grouped rows with See all pointing to class Assessments; existing source-specific overview links retained.
18. **Learners:** contextual Add learner, grouped roster rows, long-name wrapping and 44px remove controls. Existing forms/actions preserved.
19. **Mobile navigation:** exactly Today, Classes, Check, Reports and Ask; solid background, safe-area spacing, no floating glass bar.
20. **Settings/profile:** Account disclosure in the header provides Profile, Settings and the existing Sign out action. Settings also remains in the desktop sidebar.
21. **Created components:** ActionDisclosure, AccountMenu, GroupedSection and ClassTabs; AssessmentRow is the existing Check card refactored into a reusable row.
22. **Consolidation:** shared Button / Check button styles; one reusable account/class disclosure; grouped section headings; shared assessment rows; older overview browser entry delegates to the broader browser suite.

## File inventory

23. **Created in this batch:**

- `src/components/ui/action-disclosure.tsx`
- `src/components/ui/grouped-section.tsx`
- `src/components/layout/account-menu.tsx`
- `src/features/classes/class-tabs.tsx`
- `src/app/(dashboard)/classes/[classId]/assessments/page.tsx`
- `tests/design-system.test.tsx`
- `tests/design-system-browser.mjs`
- `tests/browser-fixtures/design-system.tsx`
- `tests/browser-fixtures/design-system-data.ts`
- `docs/DESIGN_SYSTEM_V2.md`

24. **Presentation files modified in this batch:**

- `src/app/globals.css`, `src/app/layout.tsx`
- `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`
- `src/components/layout/app-shell.tsx`
- `src/components/ui/button.tsx`, `src/components/ui/select.tsx`
- `src/app/(dashboard)/today/page.tsx`, `classes/page.tsx`, `reports/page.tsx`, `settings/page.tsx`
- `src/app/(dashboard)/classes/[classId]/page.tsx`, `learners/page.tsx`, `records/page.tsx`
- `src/app/(dashboard)/check/[assessmentId]/page.tsx`
- `src/features/classes/overview-view.tsx`, `class-more-menu.tsx`, `edit-class-details.tsx`
- `src/features/exams/ui.ts`, `components/check-folders.tsx`, `components/new-assessment-form.tsx`
- `src/features/ask/ask-workspace.tsx`
- `src/features/attendance/attendance-sheet.tsx`
- `src/features/export/export-record.tsx`
- `src/features/learners/delete-student-button.tsx`
- `src/features/reports/generate-report-form.tsx`
- `src/features/settings/settings-ui.tsx`, `profile-form.tsx`, `offline-controls.tsx`
- `tests/class-overview.test.tsx`, `tests/class-learners.test.tsx`, `tests/class-overview-browser.mjs`
- `docs/CLASS_OVERVIEW_REFRESH.md` now links to this superseding presentation brief.

The former `tests/browser-fixtures/class-overview.tsx` is replaced by the design-system fixture. Other uncommitted Class Overview / record-sync files already existed before this batch and were preserved. In particular, existing server data helpers and actions have not been rewritten as part of the UI work.

## Validation

25. **No morphism:** source search for `backdrop-filter`, `backdrop-blur`, `blur(`, `glass` and `neumorph` leaves only two existing DOM `.blur()` calls in score-sheet keyboard handling. Those move keyboard focus and are not CSS blur. No glass, neumorphism, translucent navigation or new UI gradients.
26. **Database/backend:** no table, migration or schema changes. SHA-256 comparison against this batch's starting snapshot confirms all existing protected TypeScript/SQL data, action, auth, grading, sync, service-worker and migration files remain identical. The only changed existing `.ts` application helper is the expressly excluded presentation-only `features/exams/ui.ts`. PWA/Android/security behavior is preserved.
27. **Responsive:** real page/component UI with synthetic local data checked at 320, 360, 390, 430, 768, 1024 and 1440px across Today, Classes, Overview, Learners, Assessments, Records, Check, Reports, Ask and Settings. Long names, overview states, empty screens, larger text and internal scrolling included. No page-level horizontal overflow in tested layouts. Browser fixtures disable server actions and never connect to teacher records. Screenshots: `test-results/design-system/` (ignored artifacts).
28. **Accessibility:** tested utility target dimensions, five mobile destinations, Account/More keyboard opening and Tab order, Escape/focus return, Edit dialog and fixture save, visible focus styles, native report radios, label hit areas, 125% text size at 320px and reduced motion. No claim of a comprehensive assistive-technology audit.
29. **Checks:** typecheck, changed-file lint, production build and 108 focused tests across 16 files pass. Coverage includes sync database/workbook/UI, latest-update summaries, access/invites, Ask, grading, attendance and searchable selection. Browser checks are local visual/interaction checks, not authenticated Vercel end-to-end tests.
30. **Previously recorded unrelated failures:** global lint's `use-dictation.ts` effect-state rule; full Vitest discovery of Playwright specs; report-provider mocks and score-sheet focus tests. They were not rewritten in this UI batch. Only the focused suite is claimed passing here. Vitest also emits its existing module-type configuration warning.
31. **Suggested commit:** `refactor(ui): introduce TeacherCo design system v2`

### Reproduce

```sh
npm run typecheck
npm run build
node tests/design-system-browser.mjs
npm test -- --configLoader native --pool=threads tests/class-overview.test.tsx tests/design-system.test.tsx tests/class-overview-data.test.ts tests/class-learners.test.tsx tests/record-sync-ui.test.tsx tests/record-sync.test.ts tests/record-sync-workbook.test.ts tests/record-sync-database.test.ts tests/invite-access.test.ts tests/invite-actions.test.ts tests/invite-form.test.tsx tests/searchable-select.test.tsx tests/ask.test.ts tests/attendance-dates.test.ts tests/deped-grading.test.ts tests/grading-workbook-parser.test.ts
```

The browser harness reads locally built Poppins font assets; finish the production build before running it. Do not rebuild `.next` while it is running. Chromium needs process permission in restricted environments.
