# TeacherCo public landing page — Batch 1

The root route `/` now shows the public landing page for logged-out and signed-in visitors. All twelve requested sections are included, with the existing Poppins font, brand colors, rounded controls, and uploaded artwork.

## Files

Created:

- `src/components/landing/landing-page.tsx` — sections, image placement, CTA groups, native FAQ accordion, footer.
- `src/components/landing/landing-header.tsx` — desktop navigation and accessible mobile disclosure menu.
- `src/components/landing/landing.css` — landing-specific responsive styles.
- `tests/landing-access.test.tsx` — public rendering, authenticated destinations, account-service failure fallback.
- `tests/landing-header.test.tsx` — account links and mobile menu interactions.
- `tests/landing-browser.mjs` — production browser smoke checks and screenshots.
- `docs/LANDING_PAGE_HANDOFF.md` — this handoff.

Modified:

- `src/app/page.tsx` — replaces the unconditional redirect, sets metadata, and obtains the existing access context.
- `src/lib/auth/access-policy.ts` — root is public for every account state; existing application destinations are retained.
- `src/lib/supabase/proxy.ts` — exempts only the exact root route alongside the existing public routes.

The preceding class-creation fix remains in the working tree and is separate from this landing-page change.

## Supplied images

All originals stay in `public/brand`, unchanged. Include these currently untracked files when committing:

| File | Placement |
| --- | --- |
| `today-visual.png` | Hero and social sharing metadata |
| `upload-visual.png` | Existing class-record import |
| `class-visual.png` | Classroom organization |
| `ask-visual.png` | Ask TeacherCo |
| `check-visual.png` | Assessment checking |
| `cta.png` | Final call to action |

The existing `teacherco-mascot.png` is reused in the header. Images use Next Image with responsive sizes, intrinsic dimensions, and default optimization. Only the hero illustration has priority; below-the-fold artwork is lazy loaded. No cropping or recoloring is applied.

## Design and routing

- Warm ivory backgrounds, restrained sage/sand sections, white report cards, and forest-green buttons.
- Alternating image/text layouts on desktop; text precedes images on phones. How-it-works steps stack vertically on phones.
- Mobile menu supports Escape and focus return; FAQ uses native keyboard-accessible `details`/`summary`. Visible focus states and reduced-motion support are included.
- Signed-in account CTAs use the existing `accessDestination` helper: `/invite`, `/onboarding`, `/today`, `/suspended`, or `/verify-email` when needed.
- `/request-access` retains the existing login requirement. The landing page explains account creation and verification before requesting access.
- Footer links to the existing Privacy Notice. Terms is omitted because the existing legal publication is marked as a draft.
- Import copy specifies Excel/XLSX and pasted learner lists. Assessment copy describes supported objective answers and teacher review.

## Validation

- Production build and TypeScript check pass.
- Changed-file ESLint passes. Full-project lint still fails on the existing `src/features/exams/components/use-dictation.ts:37` state-in-effect error; existing unused-argument warnings remain in `tests/reports-evidence.test.ts`.
- 36 focused tests pass across landing access/header, invite access/actions, and class creation.
- Production Chromium checks pass at 1440, 1024, 768, 390, 360, and 320 pixels: no horizontal overflow, all images decode, menu and FAQ work, and no browser page errors.
- Login and access-request links navigate through the existing flow. Logged-out protected routes redirect to login; login, signup, and Privacy Notice return 200.
- Signed-in destinations were tested with mocked access contexts, not live teacher accounts. Real authenticated classroom data operations were not exercised.

To repeat browser checks, start `npm run start -- --port 3100` after a build, then run `node tests/landing-browser.mjs`. Screenshots are written to the ignored `test-results/landing/` directory. `LANDING_TEST_URL` can override the local server address.

## Deployment

No database migration, dependency installation, or new environment variable is needed. Deploy through the existing Vercel workflow. Social metadata uses Vercel's production hostname (or deployment hostname); local builds use localhost. If deployment system variables are disabled, enable them or set the metadata base to the real production origin before publishing.

Suggested commit: `feat: add TeacherCo public landing page`
