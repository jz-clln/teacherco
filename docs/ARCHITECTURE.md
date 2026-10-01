# TeacherCo Architecture Decisions

## Source of truth
Supabase/Postgres is the online source of truth. IndexedDB is an offline cache and future mutation queue, not a second authority.

## AI boundary
TeacherCo should never delegate deterministic grade, attendance, threshold, or objective-answer calculations to an LLM. Build verified evidence first, then let AI explain or transform that evidence into prose.

## Import boundary
Start with `.xlsx`. Parse locally, show a teacher confirmation step, then persist normalized records. PDF and DOCX can follow after the Excel model is stable.

## Assessment boundary
Multiple-choice and True/False scoring should be deterministic. Image recognition may propose an extracted answer, but low-confidence results must enter teacher review before final scoring.

## Privacy boundary
Private buckets, RLS, server-only privileged credentials, explicit retention controls, and minimal/pseudonymized external AI context are foundational—not cleanup work.

## Offline boundary
Non-AI classroom viewing/calculation features should progressively work offline. Live cloud sync, AI generation, and first-time Google Sheets retrieval require connectivity.
