// src/lib/excel/export-plan.ts
//
// Decides WHICH cells of the teacher's own workbook should receive a TeacherCo score.
// Pure logic on plain data (no ExcelJS, no network), so it is easy to test.
//
// Safety rules:
//   * A blank TeacherCo score never erases a cell in the teacher's file.
//   * A cell that already holds text (for example "ABS") is never overwritten.
//   * A column is only filled when its highest possible score matches the assessment's.
//   * Learners are matched by LRN, then by name. Never by row position.

import type { GradeSheet } from "@/lib/excel/grades";
import { nameKey, type SheetGrid } from "@/lib/excel/roster";

export type ExportData = {
  /** Learners in the class. `assessments[].scores` lines up with this list. */
  learners: { firstName: string; lastName: string; lrn: string }[];
  assessments: { id: string; title: string; total: number; scores: (number | null)[] }[];
};

export type ColumnRef = { sheet: string; col: number };

export type PlannedWrite = {
  /** Stable id used by the checkboxes. */
  key: string;
  sheet: string;
  /** 1-based row. */
  row: number;
  /** 0-based column. */
  col: number;
  /** "F12" */
  address: string;
  learner: string;
  title: string;
  old: number | null;
  value: number;
  kind: "new" | "changed";
};

export type Candidate = ColumnRef & { label: string; total: number };

export type ExportPlan = {
  writes: PlannedWrite[];
  /** Same score already in the file. */
  unchanged: number;
  /** Cells holding text such as "ABS". Left alone. */
  keptText: number;
  /** Learners in the file that TeacherCo does not have in this class. */
  unknownLearners: string[];
  /** Assessments written into a column. */
  matched: { title: string; sheet: string; column: string }[];
  /** TeacherCo assessments that have no column in the file yet. */
  unmapped: { id: string; title: string; total: number; candidates: Candidate[] }[];
  /** Same title found, but the highest possible score differs. Not exported. */
  mismatched: { title: string; fileTotal: number; appTotal: number }[];
};

const EPS = 1e-6;

export function colName(index0: number): string {
  let n = index0 + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * @param sheets  Grade sheets detected WITH empty columns kept (detectGradeSheet(..., { keepEmpty: true })).
 * @param grids   The same sheets as text grids, to see what is really in a cell.
 * @param manual  Columns the teacher picked for assessments that have no matching title.
 */
export function planExport(
  sheets: GradeSheet[],
  grids: Map<string, SheetGrid>,
  data: ExportData,
  manual: Record<string, ColumnRef | null> = {},
): ExportPlan {
  const byLrn = new Map<string, number>();
  const byName = new Map<string, number>();
  data.learners.forEach((l, i) => {
    if (l.lrn) byLrn.set(l.lrn, i);
    byName.set(nameKey(l.firstName, l.lastName), i);
  });

  // Every score column of the file, addressable by title and by position.
  type Located = { sheet: GradeSheet; colIdx: number };
  const byTitle = new Map<string, Located>();
  const byPos = new Map<string, Located>();
  for (const sheet of sheets) {
    sheet.columns.forEach((c, colIdx) => {
      if (!byTitle.has(c.title)) byTitle.set(c.title, { sheet, colIdx });
      byPos.set(`${sheet.sheet}|${c.col}`, { sheet, colIdx });
    });
  }

  const writes: PlannedWrite[] = [];
  const unknown = new Set<string>();
  const matched: ExportPlan["matched"] = [];
  const mismatched: ExportPlan["mismatched"] = [];
  const unmappedRaw: { id: string; title: string; total: number }[] = [];
  const usedColumns = new Set<string>();
  let unchanged = 0;
  let keptText = 0;

  type Job = { a: ExportData["assessments"][number]; at: Located };
  const jobs: Job[] = [];

  for (const a of data.assessments) {
    const pick = manual[a.id];
    const at = pick ? byPos.get(`${pick.sheet}|${pick.col}`) : byTitle.get(a.title);
    if (!at) {
      if (pick === undefined || pick === null) unmappedRaw.push({ id: a.id, title: a.title, total: a.total });
      continue;
    }
    const column = at.sheet.columns[at.colIdx];
    if (Math.abs(column.total - a.total) > EPS) {
      mismatched.push({ title: a.title, fileTotal: column.total, appTotal: a.total });
      continue;
    }
    usedColumns.add(`${at.sheet.sheet}|${column.col}`);
    jobs.push({ a, at });
  }

  for (const { a, at } of jobs) {
    const { sheet, colIdx } = at;
    const column = sheet.columns[colIdx];
    matched.push({ title: a.title, sheet: sheet.sheet, column: `${colName(column.col)}` });
    const grid = grids.get(sheet.sheet);

    sheet.learners.forEach((l, i) => {
      let j = l.lrn ? byLrn.get(l.lrn) : undefined;
      if (j === undefined) j = byName.get(nameKey(l.firstName, l.lastName));
      if (j === undefined) {
        unknown.add(`${l.lastName}, ${l.firstName}`);
        return;
      }
      const value = a.scores[j];
      if (value == null) return; // blank stays blank, never erase the teacher's cell

      const old = column.scores[i];
      const raw = (grid?.rows[l.sourceRow - 1]?.[column.col] ?? "").trim();
      if (old == null && raw !== "") {
        keptText++; // text such as "ABS", or an out-of-range number: leave it
        return;
      }
      if (old != null && Math.abs(old - value) < EPS) {
        unchanged++;
        return;
      }
      const address = `${colName(column.col)}${l.sourceRow}`;
      writes.push({
        key: `${sheet.sheet}!${address}`,
        sheet: sheet.sheet,
        row: l.sourceRow,
        col: column.col,
        address,
        learner: `${l.lastName}, ${l.firstName}`,
        title: a.title,
        old,
        value,
        kind: old == null ? "new" : "changed",
      });
    });
  }

  // Empty columns the teacher could pick for assessments the file does not have yet.
  const free: Candidate[] = sheets.flatMap((s) =>
    s.columns
      // Only EMPTY columns: a manual choice must never replace another assessment's scores.
      .filter((c) => !usedColumns.has(`${s.sheet}|${c.col}`) && c.scores.every((v) => v == null))
      .map((c) => ({ sheet: s.sheet, col: c.col, label: `${s.sheet} · ${c.title.split(" · ").pop()} (${colName(c.col)})`, total: c.total })),
  );
  const unmapped = unmappedRaw.map((u) => ({
    ...u,
    candidates: free.filter((c) => Math.abs(c.total - u.total) < EPS),
  }));

  return { writes, unchanged, keptText, unknownLearners: [...unknown], matched, unmapped, mismatched };
}