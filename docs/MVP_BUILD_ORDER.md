# MVP Build Order

1. **Supabase foundation** — apply migrations, verify RLS with two test teachers.
2. **Authentication** — signup, login, logout, protected dashboard.
3. **Class CRUD** — create/list/open/delete or archive a class.
4. **Excel preview** — current scaffold already reads `.xlsx` locally.
5. **Import mapping** — detect learner/name/assessment columns and require teacher confirmation.
6. **Normalized import** — create/reuse learners and class enrollments; create assessments and scores.
7. **Evidence engine** — class average, below benchmark, missing data coverage, attendance rules.
8. **Learner profiles** — evidence-backed individual view.
9. **Assessment creator** — manual/typed answer key first.
10. **Objective checker** — answer extraction interface + teacher review + deterministic scoring.
11. **Class performance report** — one report generated from verified evidence.
12. **AI assistant** — explanatory questions only after structured queries are stable.
13. **Offline cache** — cache classes/learners and define conflict strategy before offline edits.
14. **Voice** — dictate answer keys and review commands.
15. **Image/OMR** — controlled answer sheet before arbitrary paper layouts.

Do not build parent/student/admin accounts in the MVP.
