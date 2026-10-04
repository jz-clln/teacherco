// Synthetic data only. Browser fixtures never connect to the production application.
const query = new URLSearchParams(location.search);
export const state = query.get("state");
const long = query.has("long");
export const classroom = { id: "class", teacher_id: "teacher", name: long ? "Grade 1 Giraffe — An exceptionally long classroom and section designation" : "Grade 1 Giraffe", subject: "Mathematics", grade_level: "Grade 1", school_year: "2026–2027", benchmark: 75, school_name: "TeacherCo School", school_id: "", adviser: "Teacher", section: "Giraffe", created_at: "2026-10-01", status: "active" };
export const classes = state === "empty" ? [] : [classroom, { ...classroom, id: "second", name: "Grade 2 — Sunshine" }];
export const learners = state === "empty" ? [] : ["Ana Cruz", long ? "Maria Alexandra De Los Santos Villanueva — An exceptionally long learner name" : "Ben Reyes", "Carlo Santos"].map((name, n) => ({ id: String(n), name, addedAt: "2026-10-01", class_id: "class", learner_id: String(n), learner: { id: String(n), display_name: name } }));
export const assessments = state === "empty" ? [] : ["Term 1 · Performance Task 2", "Term 1 · Written Work 3"].map((title,n) => ({ id: `assessment-${n}`, title, status: "open", format: "multiple_choice" as const, date: "2026-10-01", className: classroom.name, classId: "class", classTitle: classroom.name, subject: "Mathematics", gradeLevel: "Grade 1", checked: n, roster: 3, mean: n ? 85 : null }));
export const folders = classes.map(c => ({ key: c.id, name: c.name, gradeLevel: c.grade_level, total: c.id === "class" ? assessments.length : 0, pending: c.id === "class" ? 2 : 0, subjects: [{ subject: c.subject, classId: c.id, assessments: c.id === "class" ? assessments : [] }] }));
export const stats = { average: 84.2, attendance: 92, below: 4, scored: 36, assessments: 3, learnerPercents: {}, lowest: null };
export const summary = { versionId: "saved-version", timestamp: "2026-10-01T00:00:00Z", insights: state === "unchanged" ? [] : [{ id: "average", title: "Class average increased", detail: "81.6% → 84.2%", priority: 90 }, { id: "scores", title: "3 learners received new scores", priority: 65 }, { id: "attendance", title: "4 attendance records changed", priority: 60 }], evidence: "Compares records immediately before and after this sync. Later manual edits are not included." };
export const result = state === "empty" ? { status: "empty" as const } : state === "error" ? { status: "error" as const } : { status: "ready" as const, summary };
export const insights = { attention: learners.map(l => ({ learnerId: l.id, name: l.name, reasons: ["Score average below the 75% benchmark"] })), attendanceDays: 10, changes: [] };
export async function createClient() {
  return { from(table: string) {
    let single = false;
    const builder = { select() { return builder; }, eq() { return builder; }, in() { return builder; }, order() { return builder; }, limit() { return builder; }, single() { single=true; return builder; }, maybeSingle() { single=true; return builder; },
      then(resolve: (value: unknown) => unknown) {
        const data = table === "classes" ? classes : table === "class_enrollments" ? learners : table === "attendance_entries" ? learners.slice(0,1) : table === "profiles" ? [{ full_name: "Teacher Ana", grade_bands: ["elementary"], ai_enabled: true }] : table === "reports" && state !== "empty" ? [{ id: "report", report_type: "class_performance", status: "draft", created_at: "2026-10-01", class: classroom, source: "facts" }] : [];
        return Promise.resolve({ data: single ? data[0] ?? null : data, error: state === "error" ? { message: "Fixture error" } : null }).then(resolve);
      }
    }; return builder;
  } };
}
export const getCurrentUser = async () => ({ id: "teacher", email: "teacher@example.test", user_metadata: { full_name: "Ana" } });
