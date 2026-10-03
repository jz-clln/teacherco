import { describe, expect, it } from "vitest";
import { detectGradeSheet } from "@/lib/excel/grades";
import type { SheetGrid } from "@/lib/excel/roster";

const pad = (cells: Record<number, string | number>, width = 14) =>
  Array.from({ length: width }, (_, i) => String(cells[i] ?? ""));

// Layout like a DepEd term sheet. Merged group titles live only in their first column.
function termSheet(name = "TERM2"): SheetGrid {
  return {
    name,
    hidden: false,
    rows: [
      pad({ 0: "Class Record" }),
      pad({ 0: "TERM 2" }),
      pad({ 1: "LEARNERS' NAMES", 5: "WRITTEN / ORAL WORKS (20%)", 13: "PRODUCT / PERFORMANCE TASKS (50%)", 19: "SUMMATIVE TESTS AND TERM EXAMINATIONS (30%)", 25: "Initial Grade" }, 30),
      pad({ 5: 1, 6: 2, 7: 3, 8: 4, 9: 5, 10: "Total", 11: "PS", 12: "WS", 13: 1, 14: 2, 15: 3, 16: "Total", 17: "PS", 18: "WS", 19: "ST1", 20: "ST2", 21: "TE", 22: "Total", 23: "PS", 24: "WS", 25: "Initial Grade", 26: "Term Grade", 27: "Descriptor" }, 30),
      pad({ 1: "HIGHEST POSSIBLE SCORE", 5: 10, 6: 10, 7: 10, 8: 10, 9: 10, 10: 50, 11: 100, 12: 0.2, 13: 100, 14: 100, 15: 100, 16: 300, 17: 100, 18: 0.5, 19: 25, 20: 25, 21: 50, 22: 100, 23: 100, 24: 0.3 }, 30),
      pad({ 1: "MALE" }),
      pad({ 0: 1, 1: "DELA CRUZ, JUAN", 5: 8, 6: 9, 7: 7, 8: 6, 9: 9, 13: 90, 14: 95, 15: 100, 19: 13, 20: 20, 21: 50 }, 30),
      pad({ 0: 2, 1: "REYES, PEDRO", 5: 10, 6: "ABS", 8: 10, 13: 85, 14: 95, 15: 100, 19: 25, 20: 25, 21: 50 }, 30),
      pad({ 0: 3, 1: "SANTOS, JOSE", 5: 11, 6: 7, 13: 85, 14: 95, 15: 100, 19: 20, 20: 25, 21: 50 }, 30),
      pad({ 0: 4, 1: "LIM, ANA" }, 30),
    ],
  };
}

describe("detectGradeSheet", () => {
  const found = detectGradeSheet(termSheet())!;

  it("keeps raw score columns with their highest possible score and skips totals", () => {
    expect(found.term).toBe("Term 2");
    expect(found.columns.map((c) => [c.title, c.total])).toEqual([
      ["Term 2 · Written Work 1", 10],
      ["Term 2 · Written Work 2", 10],
      ["Term 2 · Written Work 3", 10],
      ["Term 2 · Written Work 4", 10],
      ["Term 2 · Written Work 5", 10],
      ["Term 2 · Performance Task 1", 100],
      ["Term 2 · Performance Task 2", 100],
      ["Term 2 · Performance Task 3", 100],
      ["Term 2 · Summative Test 1", 25],
      ["Term 2 · Summative Test 2", 25],
      ["Term 2 · Term Exam", 50],
    ]);
    expect(found.possibleByComponent).toEqual({ written_work: 50, performance_task: 300, assessment: 100 });
    expect(found.weights).toEqual({ written_work: 0.2, performance_task: 0.5, assessment: 0.3 });
  });

  it("matches rows to learners, leaves blanks empty, and drops bad cells", () => {
    expect(found.learners.map((l) => l.lastName)).toEqual(["Dela Cruz", "Reyes", "Santos", "Lim"]);
    const ww1 = found.columns[0].scores;
    // 11 is above the highest possible score of 10, so it is left out.
    expect(ww1).toEqual([8, 10, null, null]);
    // "ABS" is not a number, so it is left out and counted.
    expect(found.columns[1].scores).toEqual([9, null, 7, null]);
    expect(found.ignored).toBe(2);
  });

  it("returns null for a sheet without a highest-possible-score row", () => {
    const summary: SheetGrid = {
      name: "SUMMARY OF GRADES",
      hidden: false,
      rows: [pad({ 1: "LEARNERS' NAMES", 5: "TERM 1" }), pad({ 0: 1, 1: "DELA CRUZ, JUAN", 5: 72 })],
    };
    expect(detectGradeSheet(summary)).toBeNull();
  });
});