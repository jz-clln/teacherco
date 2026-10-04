import { z } from "zod";
import { nameKey } from "@/lib/excel/roster";
import { inferTermAndComponent } from "@/lib/grading/deped";

const name = z.object({ firstName: z.string().trim().min(1).max(120), lastName: z.string().trim().min(1).max(120) });
const gradeNumber = z.number().min(0).max(100).transform(n => Math.round((n + Number.EPSILON) * 100) / 100).nullable();
const grade = z.object({ initialGrade: gradeNumber, termGrade: gradeNumber, descriptor: z.string().max(80).nullable() });
export const syncInputSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  learners: z.array(name).min(1).max(500),
  sheets: z.array(z.object({
    term: z.number().int().min(1).max(3),
    learners: z.array(name.extend({ recordedGrade: grade })).min(1).max(500),
    columns: z.array(z.object({ title: z.string().trim().min(1).max(160), total: z.number().min(0).max(10000), scores: z.array(z.number().min(0).max(10000).nullable()).max(500) })).max(60),
  })).max(3),
  attendance: z.array(name.extend({ date: z.iso.date(), status: z.enum(["present", "absent", "late", "excused"]).nullable() })).max(20000),
}).superRefine((input, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (new Set(input.sheets.map(s => s.term)).size !== input.sheets.length) fail("More than one sheet uses the same term. Keep one sheet per term.");
  for (const rows of [input.learners, ...input.sheets.map(s => s.learners)]) {
    const keys = rows.map(l => nameKey(l.firstName, l.lastName));
    if (new Set(keys).size !== keys.length) fail("Duplicate learner names need to be resolved in the workbook before syncing.");
  }
  const roster = new Set(input.learners.map(l => nameKey(l.firstName, l.lastName)));
  for (const sheet of input.sheets) {
    if (new Set(sheet.columns.map(c => c.title)).size !== sheet.columns.length) fail("Duplicate activity columns need to be resolved.");
    for (const learner of sheet.learners) if (!roster.has(nameKey(learner.firstName, learner.lastName))) fail("A term sheet contains a learner missing from the main roster. Update the roster first.");
    for (const col of sheet.columns) {
      const slot = inferTermAndComponent(col.title);
      if (slot.term !== sheet.term || !slot.component) fail("An activity could not be matched to one of the three terms.");
      if (col.scores.length !== sheet.learners.length || col.scores.some(s => s !== null && (col.total <= 0 || s > col.total))) fail("Check score columns and their highest possible scores.");
    }
  }
  const attendanceKeys = input.attendance.map(a => `${nameKey(a.firstName, a.lastName)}|${a.date}`);
  if (new Set(attendanceKeys).size !== attendanceKeys.length) fail("Attendance contains duplicate learner/date entries.");
  for (const a of input.attendance) if (!roster.has(nameKey(a.firstName, a.lastName))) fail("An attendance learner is missing from the main roster.");
});
export type SyncInput = z.infer<typeof syncInputSchema>;
export type Snapshot = {
  revision: number;
  learners: { id: string; first_name: string; last_name: string; status: string }[];
  assessments: { id: string; title: string; activity_slot: string | null; exported_title: string | null; source: string; total_points: number; term: number | null; component: string | null }[];
  scores: { assessment_id: string; learner_id: string; score: number | null; max_score: number | null }[];
  grades: { learner_id: string; term: number; initial_grade: number | null; term_grade: number | null; descriptor: string | null }[];
  attendance: { learner_id: string; attendance_date: string; status: string }[];
  config: { term_possible: Record<string, Record<string, number>>; [key: string]: unknown } | null;
};
export type Change = { kind: "learner" | "new_score" | "score" | "grade" | "attendance" | "activity" | "missing" | "protected"; label: string; before: string; after: string };
export type SyncPlan = {
  changes: Change[];
  learners: { key: string; id: string | null; first_name: string; last_name: string }[];
  activities: { key: string; id: string | null; title: string; total: number; term: number; component: string }[];
  scores: { learner: string; activity: string; score: number; max: number }[];
  grades: { learner: string; term: number; initial_grade: number | null; term_grade: number | null; descriptor: string | null }[];
  attendance: { learner: string; date: string; status: string }[];
  termPossible: Record<string, Record<string, number>> | null;
};
const show = (v: unknown) => v === null || v === undefined || v === "" ? "Blank" : String(v);
const rounded = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Pure comparison: blanks are notices, never delete instructions. Matching is by name and activity, never row order. */
export function buildSyncPlan(input: SyncInput, current: Snapshot): SyncPlan {
  const plan: SyncPlan = { changes: [], learners: [], activities: [], scores: [], grades: [], attendance: [], termPossible: null };
  const add = (kind: Change["kind"], label: string, before: unknown, after: unknown) => plan.changes.push({ kind, label, before: show(before), after: show(after) });
  const matches = new Map<string, Snapshot["learners"]>();
  for (const l of current.learners) { const key = nameKey(l.first_name ?? "", l.last_name ?? ""); matches.set(key, [...(matches.get(key) ?? []), l]); }
  for (const l of input.learners) {
    const key = nameKey(l.firstName, l.lastName), found = matches.get(key) ?? [];
    if (found.length > 1) throw new Error(`More than one learner matches ${l.firstName} ${l.lastName}. Resolve the duplicate names before syncing.`);
    if (found[0]?.status === "inactive") throw new Error(`${l.firstName} ${l.lastName} is inactive in this class. Review their enrollment before syncing.`);
    plan.learners.push({ key, id: found[0]?.id ?? null, first_name: l.firstName, last_name: l.lastName });
    if (!found.length) add("learner", `${l.lastName}, ${l.firstName}`, "Not enrolled", "Add learner");
  }
  const learners = new Map(plan.learners.map(l => [l.key, l]));
  const names = new Map(current.learners.map(l => [l.id, `${l.last_name}, ${l.first_name}`]));
  for (const l of current.learners) if (l.status === "active" && !learners.has(nameKey(l.first_name ?? "", l.last_name ?? ""))) add("missing", `${names.get(l.id)} · learner`, "Enrolled", "Not in roster — keep enrolled");
  const scores = new Map(current.scores.map(s => [`${s.assessment_id}|${s.learner_id}`, s]));
  const grades = new Map(current.grades.map(g => [`${g.term}|${g.learner_id}`, g]));
  const seenActivities = new Set<string>();
  for (const sheet of input.sheets) {
    for (const col of sheet.columns) {
      const found = current.assessments.filter(a => a.activity_slot === col.title || a.title === col.title || a.exported_title === col.title);
      if (found.length > 1) throw new Error(`More than one activity matches ${col.title}. Resolve its destination before syncing.`);
      const a = found[0];
      if (a) seenActivities.add(a.id);
      if (a && (a.source !== "imported" || a.exported_title)) { add("protected", col.title, "Typed, checked or exported in TeacherCo", "Kept unchanged"); continue; }
      if (col.total <= 0) { if (a) add("missing", col.title, a.total_points, "Highest possible score missing — keep saved activity"); continue; }
      const total = rounded(col.total);
      if (total <= 0) throw new Error(`${col.title}: the highest possible score must be at least 0.01.`);
      // A lower HPS must not invalidate a retained score belonging to a missing learner/cell.
      if (a && current.scores.some(s => s.assessment_id === a.id && s.score !== null && s.score > total && !sheet.learners.some((l, i) => learners.get(nameKey(l.firstName, l.lastName))?.id === s.learner_id && col.scores[i] !== null))) throw new Error(`${col.title}: the new highest possible score is below a retained score. Correct the workbook first.`);
      if (a && current.scores.some(s => s.assessment_id === a.id && s.score !== null && s.max_score !== total && !sheet.learners.some((l, i) => learners.get(nameKey(l.firstName, l.lastName))?.id === s.learner_id && col.scores[i] !== null))) throw new Error(`${col.title}: the highest possible score changed, but some saved scores are missing from the upload. Include those scores before changing the maximum.`);
      plan.activities.push({ key: col.title, id: a?.id ?? null, title: col.title, total, term: sheet.term, component: inferTermAndComponent(col.title).component! });
      if (!a || Number(a.total_points) !== total) add("activity", col.title, a?.total_points ?? "New activity", total);
      sheet.learners.forEach((l, i) => {
        const key = nameKey(l.firstName, l.lastName), learner = learners.get(key)!;
        const old = a && learner.id ? scores.get(`${a.id}|${learner.id}`) : undefined;
        const value = col.scores[i];
        const label = `${l.lastName}, ${l.firstName} · ${col.title}`;
        if (value === null) { if (old?.score != null) add("missing", label, `${old.score}/${old.max_score}`, "Blank — keep saved score"); return; }
        const score = rounded(value);
        if (!old || old.score !== score || old.max_score !== total) {
          add(old?.score == null ? "new_score" : "score", label, old?.score == null ? "No score" : `${old.score}/${old.max_score}`, `${score}/${total}`);
          plan.scores.push({ learner: key, activity: col.title, score, max: total });
        }
      });
      if (a) {
        const included = new Set(sheet.learners.map(l => learners.get(nameKey(l.firstName, l.lastName))?.id));
        for (const s of current.scores.filter(s => s.assessment_id === a.id && !included.has(s.learner_id) && s.score !== null)) add("missing", `${names.get(s.learner_id)} · ${col.title}`, `${s.score}/${s.max_score}`, "Learner missing from term sheet — keep score");
      }
    }
    for (const l of sheet.learners) {
      const key = nameKey(l.firstName, l.lastName), learner = learners.get(key)!;
      const old = learner.id ? grades.get(`${sheet.term}|${learner.id}`) : undefined;
      const incoming = { initial_grade: l.recordedGrade.initialGrade, term_grade: l.recordedGrade.termGrade, descriptor: l.recordedGrade.descriptor };
      const next = { initial_grade: incoming.initial_grade ?? old?.initial_grade ?? null, term_grade: incoming.term_grade ?? old?.term_grade ?? null, descriptor: incoming.descriptor ?? old?.descriptor ?? null };
      let changed = false;
      for (const field of ["initial_grade", "term_grade", "descriptor"] as const) {
        if (incoming[field] === null && old?.[field] != null) add("missing", `${l.lastName}, ${l.firstName} · Term ${sheet.term} ${field.replaceAll("_", " ")}`, old[field], "Blank — keep saved value");
        else if (next[field] !== (old?.[field] ?? null)) { changed = true; add("grade", `${l.lastName}, ${l.firstName} · Term ${sheet.term} ${field.replaceAll("_", " ")}`, old?.[field], next[field]); }
      }
      if (changed) plan.grades.push({ learner: key, term: sheet.term, ...next });
    }
  }
  for (const a of current.assessments) if (a.source === "imported" && !seenActivities.has(a.id)) add("missing", a.title, "Saved activity", "Activity or term sheet not in upload — keep saved data");
  for (const g of current.grades) {
    const sheet = input.sheets.find(s => s.term === g.term);
    if (!sheet?.learners.some(l => learners.get(nameKey(l.firstName, l.lastName))?.id === g.learner_id)) add("missing", `${names.get(g.learner_id)} · Term ${g.term} grades`, g.term_grade ?? g.initial_grade, "Learner or term sheet missing — keep saved grades");
  }
  if (current.config) {
    const possible = structuredClone(current.config.term_possible);
    const changedComponents = new Set(plan.activities.map(a => `${a.term}|${a.component}`));
    for (const entry of changedComponents) {
      const [term, component] = entry.split("|");
      // The union includes blank but recognized workbook activities and retained saved activities.
      // Do not add a new empty activity twice when its HPS was already in the original import config.
      const incoming = plan.activities.filter(a => String(a.term) === term && a.component === component);
      const saved = current.assessments.filter(a => String(a.term) === term && a.component === component);
      const previous = possible[term]?.[component] ?? saved.reduce((sum, a) => sum + a.total_points, 0);
      const next = rounded(incoming.reduce((sum, a) => sum + a.total, 0) + saved.filter(a => !incoming.some(i => i.id === a.id)).reduce((sum, a) => sum + a.total_points, 0));
      if (next !== previous) {
        possible[term] = { ...possible[term], [component]: next };
        add("activity", `Term ${term} · ${component.replaceAll("_", " ")} total possible`, previous, next);
      }
    }
    if (JSON.stringify(possible) !== JSON.stringify(current.config.term_possible)) plan.termPossible = possible;
  }
  const attendance = new Map(current.attendance.map(a => [`${a.learner_id}|${a.attendance_date}`, a]));
  const seenAttendance = new Set<string>();
  const uploadedDates = new Set(input.attendance.map(a => a.date));
  for (const row of input.attendance) {
    const key = nameKey(row.firstName, row.lastName), l = learners.get(key)!;
    const oldKey = `${l.id}|${row.date}`, old = attendance.get(oldKey);
    seenAttendance.add(oldKey);
    const label = `${row.lastName}, ${row.firstName} · ${row.date}`;
    if (row.status === null) { if (old) add("missing", label, old.status, "Blank — keep attendance"); }
    else if (old?.status !== row.status) { add("attendance", label, old?.status, row.status); plan.attendance.push({ learner: key, date: row.date, status: row.status }); }
  }
  let outsideDates = 0;
  for (const a of current.attendance) {
    if (!uploadedDates.has(a.attendance_date)) outsideDates++;
    else if (!seenAttendance.has(`${a.learner_id}|${a.attendance_date}`)) add("missing", `${names.get(a.learner_id)} · ${a.attendance_date}`, a.status, "Not in upload — keep attendance");
  }
  if (outsideDates) add("missing", "Attendance outside uploaded dates", `${outsideDates} saved entries`, "Dates not in upload — keep all attendance");
  return plan;
}
export const changeCount = (plan: SyncPlan) => plan.changes.filter(c => c.kind !== "missing" && c.kind !== "protected").length;
