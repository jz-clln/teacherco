import { describe, expect, it } from "vitest";
import { detectGradeSheet } from "@/lib/excel/grades";
import { planExport, type ExportData } from "@/lib/excel/export-plan";
import type { SheetGrid } from "@/lib/excel/roster";

const pad = (cells: Record<number, string | number>, width = 14) =>
  Array.from({ length: width }, (_, i) => String(cells[i] ?? ""));

// Like a DepEd term sheet: WW3 (column H) and nothing else is still free, PT is fully set up.
function termSheet(name = "TERM2", extra: Record<number, string | number> = {}): SheetGrid {
  return {
    name,
    hidden: false,
    rows: [
      pad({ 0: "Class Record" }),
      pad({ 0: "TERM 2" }),
      pad({ 1: "LEARNERS' NAMES", 5: "WRITTEN / ORAL WORKS (20%)", 9: "PRODUCT / PERFORMANCE TASK", 12: "Initial Grade" }),
      pad({ 5: 1, 6: 2, 7: 3, 8: "Total", 9: 1, 10: 2, 11: "PS" }),
      pad({ 1: "HIGHEST POSSIBLE SCORE", 5: 10, 6: 10, 7: "", 8: 20, 9: 5, 10: 5, 11: 100, 12: 0.2 }),
      pad({ 1: "MALE" }),
      pad({ 0: 1, 1: "DELA CRUZ, JUAN", 5: 8, 6: 9, 9: 4, 10: 5, ...extra }),
      pad({ 0: 2, 1: "REYES, PEDRO", 5: 10, 6: 7, 9: 3, 10: 2 }),
      pad({ 0: 3, 1: "SANTOS, JOSE", 5: 6, 6: 6, 9: 5, 10: 5 }),
    ],
  };
}

const options = { keepEmpty: true, includeFree: true };

function setup(sheet = termSheet()) {
  const found = detectGradeSheet(sheet, options)!;
  const grids = new Map([[sheet.name, sheet]]);
  const learners = found.learners.map((l) => ({ firstName: l.firstName, lastName: l.lastName }));
  return { found, grids, learners };
}

describe("free slots", () => {
  it("are only returned when asked for", () => {
    const plain = detectGradeSheet(termSheet(), { keepEmpty: true })!;
    expect(plain.columns.some((c) => c.free)).toBe(false);

    const { found } = setup();
    const free = found.columns.filter((c) => c.free);
    expect(free.map((c) => [c.title, c.col, c.total, c.component])).toEqual([["Term 2 · Written Work 3", 7, 0, "written_work"]]);
    expect(found.hpsRow).toBe(5);
  });

  it("do not include a column where a learner has anything, even text", () => {
    const { found } = setup(termSheet("TERM2", { 7: "ABS" }));
    expect(found.columns.some((c) => c.free)).toBe(false);
  });
});

describe("planExport with free slots", () => {
  const scored = (learners: ExportData["learners"], value: number, count = learners.length) =>
    learners.map((_, i) => (i < count ? value : null));

  it("puts an activity into the free slot of its component and sets the highest possible score", () => {
    const { found, grids, learners } = setup();
    const data: ExportData = {
      learners,
      assessments: [{ id: "a1", title: "Oral Recitation", total: 20, scores: scored(learners, 18), term: 2, component: "written_work" }],
    };

    const first = planExport([found], grids, data);
    expect(first.unmapped[0].suggested).toEqual({ sheet: "TERM2", col: 7 });

    const plan = planExport([found], grids, data, { a1: first.unmapped[0].suggested });
    expect(plan.hpsWrites.map((h) => [h.address, h.value, h.missing, h.of])).toEqual([["H5", 20, 0, 3]]);
    expect(plan.writes).toHaveLength(3);
    expect(plan.writes.every((w) => w.kind === "new" && w.needs === "TERM2!H5")).toBe(true);
    // The choice stays in the list, so it can be changed again.
    expect(plan.unmapped[0].selected).toEqual({ sheet: "TERM2", col: 7 });
  });

  it("does not pick a slot by itself while some learners have no score", () => {
    const { found, grids, learners } = setup();
    const data: ExportData = {
      learners,
      assessments: [{ id: "a1", title: "Oral Recitation", total: 20, scores: scored(learners, 18, 1), term: 2, component: "written_work" }],
    };
    const plan = planExport([found], grids, data);
    expect(plan.unmapped[0].suggested).toBeNull();
    expect(plan.unmapped[0].heldBack).toEqual({ sheet: "TERM2", column: "H", missing: 2, of: 3 });

    // The teacher can still choose it, and is told how many will count 0.
    const chosen = planExport([found], grids, data, { a1: { sheet: "TERM2", col: 7 } });
    expect(chosen.hpsWrites[0].missing).toBe(2);
  });

  it("offers only free slots of the same component and term", () => {
    const { found, grids, learners } = setup();
    const base = { total: 20, scores: scored(learners, 10) };
    const data: ExportData = {
      learners,
      assessments: [
        { id: "pt", title: "Poster", ...base, term: 2, component: "performance_task" },
        { id: "t1", title: "Quiz", ...base, term: 1, component: "written_work" },
        { id: "any", title: "Unlabelled", ...base, term: null, component: null },
      ],
    };
    const plan = planExport([found], grids, data);
    const byId = Object.fromEntries(plan.unmapped.map((u) => [u.id, u]));
    expect(byId.pt.candidates).toHaveLength(0); // no free performance task column
    expect(byId.t1.candidates).toHaveLength(0); // this sheet is Term 2
    expect(byId.any.candidates).toHaveLength(1); // unknown component and term: any free slot
    expect(byId.any.suggested).toBeNull(); // but nothing is chosen for it
  });

  it("never changes a column that already has a different highest possible score", () => {
    const { found, grids, learners } = setup();
    const data: ExportData = {
      learners,
      assessments: [{ id: "a1", title: "Term 2 · Written Work 1", total: 25, scores: scored(learners, 20) }],
    };
    const plan = planExport([found], grids, data);
    expect(plan.mismatched).toEqual([{ title: "Term 2 · Written Work 1", fileTotal: 10, appTotal: 25 }]);
    expect(plan.writes).toHaveLength(0);
    expect(plan.hpsWrites).toHaveLength(0);
  });

  it("gives two activities two different slots", () => {
    const sheet = termSheet();
    sheet.rows[3][8] = "4"; // turn the old "Total" header into a WW4 header
    sheet.rows[4][8] = "";
    const { found, grids, learners } = setup(sheet);
    const data: ExportData = {
      learners,
      assessments: ["One", "Two"].map((t, i) => ({ id: `a${i}`, title: t, total: 10, scores: scored(learners, 7), term: 2, component: "written_work" as const })),
    };
    const plan = planExport([found], grids, data);
    const picks = plan.unmapped.map((u) => u.suggested?.col);
    expect(new Set(picks).size).toBe(2);
  });
});

describe("assigned class record activities", () => {
  it("exports a renamed assessment to its exact slot, including an empty column", () => {
    const { found, grids, learners } = setup();
    const plan = planExport([found], grids, { learners, assessments: [{
      id: "assigned", title: "Respect at home", activitySlot: "Term 2 · Written Work 3",
      term: 2, component: "written_work", total: 20, scores: [15, 18, 20],
    }] });
    expect(plan.writes.map((w) => w.address)).toEqual(["H7", "H8", "H9"]);
    expect(plan.hpsWrites[0].value).toBe(20);
    expect(plan.unmapped).toHaveLength(0);
  });
  it("does not suggest a different slot when the assigned column is missing", () => {
    const { found, grids, learners } = setup();
    const plan = planExport([found], grids, { learners, assessments: [{
      id: "assigned", title: "Project", activitySlot: "Term 1 · Performance Task 3",
      term: 1, component: "performance_task", total: 5, scores: [4, 4, 5],
    }] });
    expect(plan.writes).toHaveLength(0);
    expect(plan.unmapped[0].candidates).toHaveLength(0);
    expect(plan.unmapped[0].suggested).toBeNull();
  });
  it("keeps the highest possible score mismatch guard for assigned activities", () => {
    const { found, grids, learners } = setup();
    const plan = planExport([found], grids, { learners, assessments: [{
      id: "assigned", title: "Project", activitySlot: "Term 2 · Performance Task 2",
      total: 100, scores: [80, 90, 100],
    }] });
    expect(plan.writes).toHaveLength(0);
    expect(plan.mismatched).toHaveLength(1);
  });
});
