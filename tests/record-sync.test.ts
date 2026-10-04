import { describe, expect, it } from "vitest";
import { buildSyncPlan, changeCount, syncInputSchema, type Snapshot, type SyncInput } from "@/features/records/sync-model";
import { readAttendance } from "@/features/records/read-sync-workbook";

const title = "Term 1 · Written Work 1";
const learner = { firstName: "Ana", lastName: "Cruz", recordedGrade: { initialGrade: 80, termGrade: 85, descriptor: "Proficient" } };
const inputFixture = (): SyncInput => ({ filename: "record.xlsx", learners: [{ firstName: "Ana", lastName: "Cruz" }], sheets: [{ term: 1, learners: [structuredClone(learner)], columns: [{ title, total: 10, scores: [8] }] }], attendance: [] });
const snapshotFixture = (): Snapshot => ({ revision: 7, learners: [{ id: "l1", first_name: "Ana", last_name: "Cruz", status: "active" }], assessments: [{ id: "a1", title, source: "imported", total_points: 10, activity_slot: title, exported_title: null, term: 1, component: "written_work" }], scores: [{ assessment_id: "a1", learner_id: "l1", score: 8, max_score: 10 }], grades: [{ learner_id: "l1", term: 1, initial_grade: 80, term_grade: 85, descriptor: "Proficient" }], attendance: [], config: null });

describe("class record comparison", () => {
  it("unchanged uploads do not write or create a version", () => expect(changeCount(buildSyncPlan(inputFixture(), snapshotFixture()))).toBe(0));
  it("distinguishes zero, new scores and corrected scores", () => {
    const input = inputFixture(); input.sheets[0].columns[0].scores = [0];
    expect(buildSyncPlan(input, snapshotFixture()).changes[0]).toMatchObject({ kind: "score", after: "0/10" });
    const current = snapshotFixture(); current.scores = [];
    expect(buildSyncPlan(input, current).changes[0].kind).toBe("new_score");
  });
  it("matches reordered learners by normalized name instead of position", () => {
    const input = inputFixture(); input.learners.push({ firstName: "Ben", lastName: "Reyes" });
    input.sheets[0].learners.unshift({ ...learner, firstName: "Ben", lastName: "Reyes" }); input.sheets[0].columns[0].scores = [3, 9];
    const plan = buildSyncPlan(input, snapshotFixture());
    expect(plan.learners.filter(l => !l.id)).toHaveLength(1);
    expect(plan.scores.find(s => s.score === 9)?.learner).toBe(plan.learners.find(l => l.id === "l1")?.key);
  });
  it("keeps blanks and reports missing grades and attendance", () => {
    const input = inputFixture(); input.sheets[0].columns[0].scores = [null]; input.sheets[0].learners[0].recordedGrade = { initialGrade: null, termGrade: null, descriptor: null };
    const current = snapshotFixture(); current.attendance = [{ learner_id: "l1", attendance_date: "2026-10-01", status: "present" }];
    const plan = buildSyncPlan(input, current);
    expect(plan.scores).toHaveLength(0); expect(plan.grades).toHaveLength(0); expect(plan.attendance).toHaveLength(0);
    expect(plan.changes.filter(c => c.kind === "missing")).toHaveLength(5);
  });
  it("reports missing term sheets without deleting their data", () => {
    const input = inputFixture(); input.sheets = [];
    const plan = buildSyncPlan(input, snapshotFixture());
    expect(plan.changes).toHaveLength(2); expect(changeCount(plan)).toBe(0);
  });
  it.each(["manual", "checked", "exported"])("protects %s activities", source => {
    const current = snapshotFixture();
    if (source === "exported") current.assessments[0].exported_title = title; else current.assessments[0].source = source;
    const input = inputFixture(); input.sheets[0].columns[0].scores = [2];
    const plan = buildSyncPlan(input, current); expect(plan.scores).toHaveLength(0); expect(plan.changes[0].kind).toBe("protected");
  });
  it("blocks ambiguous names and inactive enrollment", () => {
    const current = snapshotFixture(); current.learners.push({ ...current.learners[0], id: "l2" });
    expect(() => buildSyncPlan(inputFixture(), current)).toThrow(/More than one learner/);
    current.learners.pop(); current.learners[0].status = "inactive";
    expect(() => buildSyncPlan(inputFixture(), current)).toThrow(/inactive/);
  });
  it("blocks a lower maximum that invalidates a score being retained", () => {
    const input = inputFixture(); input.sheets[0].columns[0] = { title, total: 5, scores: [null] };
    expect(() => buildSyncPlan(input, snapshotFixture())).toThrow(/below a retained score/);
  });
  it("reviews maximum-score and grading-total changes", () => {
    const current = snapshotFixture(); current.config = { term_possible: { "1": { written_work: 10 } } };
    const input = inputFixture(); input.sheets[0].columns[0].total = 20;
    const plan = buildSyncPlan(input, current);
    expect(plan.scores[0].max).toBe(20); expect(plan.termPossible).toEqual({ "1": { written_work: 20 } });
    expect(plan.changes.some(c => c.label.includes("total possible") && c.after === "20")).toBe(true);
  });
  it("does not double count HPS of previously empty activities", () => {
    const current = snapshotFixture(); current.config = { term_possible: { "1": { written_work: 20 } } };
    const input = inputFixture(); input.sheets[0].columns.push({ title: "Term 1 · Written Work 2", total: 10, scores: [null] });
    expect(buildSyncPlan(input, current).termPossible).toBeNull();
  });
  it("validates three terms, duplicate names, score alignment and strips LRNs", () => {
    const input = inputFixture();
    expect(syncInputSchema.parse({ ...input, learners: [{ ...input.learners[0], lrn: "123456789012" }] }).learners[0]).not.toHaveProperty("lrn");
    input.sheets[0].term = 4; expect(syncInputSchema.safeParse(input).success).toBe(false);
    input.sheets[0].term = 1; input.sheets[0].columns[0].scores = []; expect(syncInputSchema.safeParse(input).success).toBe(false);
    input.sheets[0].columns[0].scores = [8]; input.learners.push({ ...input.learners[0] }); expect(syncInputSchema.safeParse(input).success).toBe(false);
  });
  it("compares explicit attendance corrections", () => {
    const input = inputFixture(); input.attendance.push({ ...input.learners[0], date: "2026-10-01", status: "absent" });
    const current = snapshotFixture(); current.attendance.push({ learner_id: "l1", attendance_date: "2026-10-01", status: "present" });
    expect(buildSyncPlan(input, current).changes[0]).toMatchObject({ kind: "attendance", before: "present", after: "absent" });
  });
});

describe("attendance workbook interpretation", () => {
  const sheet = { name: "Attendance", hidden: false, rows: [["Learner name", "2026-10-01", "2026-10-02"], ["Cruz, Ana", "P", ""], ["Reyes, Ben", "A", "L"]] };
  it("recognizes date columns and preserves blank cells as null", () => {
    const rows = readAttendance(sheet); expect(rows).toHaveLength(4); expect(rows.map(r => r.status)).toEqual(["present", null, "absent", "late"]);
  });
  it("rejects guessed dates and unknown marks", () => {
    expect(() => readAttendance({ ...sheet, rows: [["Name", "1", "2"], ...sheet.rows.slice(1)] })).toThrow(/full date/);
    expect(() => readAttendance({ ...sheet, rows: [sheet.rows[0], ["Cruz, Ana", "X", ""]] })).toThrow(/use P, A, L, E/);
  });
});
