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
      pad({ 1: "LEARNERS' NAMES", 5: "WRITTEN / ORAL WORKS (20%)", 9: "PRODUCT / PERFORMANCE TASK", 12: "Initial Grade" }),
      pad({ 5: 1, 6: 2, 7: 3, 8: "Total", 9: 1, 10: 2, 11: "PS" }),
      pad({ 1: "HIGHEST POSSIBLE SCORE", 5: 10, 6: 10, 7: "", 8: 20, 9: 5, 10: 5, 11: 100, 12: 0.2 }),
      pad({ 1: "MALE" }),
      pad({ 0: 1, 1: "DELA CRUZ, JUAN", 5: 8, 6: 9, 7: "", 8: 17, 9: 4, 10: 5, 11: 90 }),
      pad({ 0: 2, 1: "REYES, PEDRO", 5: 10, 6: "ABS", 8: 10, 9: 3, 10: 2, 11: 50 }),
      pad({ 0: 3, 1: "SANTOS, JOSE", 5: 11, 6: 7, 9: "", 10: "" }),
      pad({ 0: 4, 1: "LIM, ANA", 5: "", 6: "", 9: "", 10: "" }),
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
      ["Term 2 · Performance Task 1", 5],
      ["Term 2 · Performance Task 2", 5],
    ]);
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