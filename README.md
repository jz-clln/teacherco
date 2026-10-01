# TeacherCo Foundation

TeacherCo is a teacher-first classroom workspace built with Next.js, Supabase, TypeScript, Tailwind CSS, IndexedDB/Dexie, and a provider-agnostic AI layer.

This repository is intentionally a **foundation**, not the full product. It establishes the pieces that should be stable before exam scanning, voice, and AI features become complex:

- authenticated teacher accounts
- teacher-owned classes
- Supabase RLS from the first migration
- learner/class relational model
- assessments and answer-level data model
- private storage buckets
- PWA/service-worker scaffold
- offline IndexedDB scaffold
- Excel parsing foundation
- AI boundary and privacy helpers
- TeacherCo brand tokens and application shell

## 1. Create a Supabase project

Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

The service-role key is server-only. Never expose it in a Client Component or any `NEXT_PUBLIC_*` variable.

## 2. Apply the database migrations

Using the Supabase CLI:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Or copy the SQL from `supabase/migrations/` into the Supabase SQL editor in order.

## 3. Install and run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## 4. Verify before feature work

```bash
npm run typecheck
npm run lint
npm test
```

## Foundation architecture

```text
Supabase/Postgres ─── online source of truth
       │
       ├── Record Engine      (imports / normalization)
       ├── Evidence Engine    (deterministic calculations)
       ├── Assessment Engine  (answer checking)
       │
       └── AI Layer           (explanation / writing only)

IndexedDB/Dexie ───── offline cache + future sync queue
```

### Rule of thumb

**Software calculates. AI interprets and writes. Teachers decide.**

## Recommended build order

1. Auth + RLS
2. Class CRUD
3. Excel import + confirmation
4. Learner/enrollment creation
5. Deterministic class dashboard
6. Competency mapping
7. Assessment creation + manual answer keys
8. Objective exam checking
9. Offline cache/sync
10. AI summaries/interventions
11. Voice answer-key entry
12. Image/OMR pipeline

## Important privacy note

The included AI privacy helper is deliberately conservative. Before sending learner context to an external AI provider, build prompts from minimal, pseudonymized evidence whenever full identity is unnecessary.

## Branding

Primary: `#1A4D2E`  
Secondary: `#4F6F52`  
Warm Sand: `#E8DFCA`  
Warm Ivory: `#F5EFE6`  
Surface: `#FFFFFF`
