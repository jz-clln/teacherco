// src/lib/excel/export-plan.ts
//
// Decides WHICH cells of the teacher's own workbook should receive a TeacherCo score.
// Pure logic on plain data (no ExcelJS, no network), so it is easy to test.
//
// Safety rules:
//   * A blank TeacherCo score never erases a cell in the teacher's file.
//   * A cell that already holds text (for example "ABS") is never overwritten.
//   * A column that already has a highest possible score is only filled when it matches the assessment's.
//   * A FREE slot (header such as WW3, no highest possible score, no scores) can take any activity of the
//     same component. TeacherCo then writes the activity's highest possible score into that slot too,
//     exactly as the teacher would by hand. A column with a different score is never changed.
//   * Learners are matched by NAME. TeacherCo does not store LRNs. Never by row position.
//   * A name that appears twice in the same sheet is left alone, because it cannot be told apart.

import type { GradeSheet } from "@/lib/excel/grades";
import { nameKey, type SheetGrid } from "@/lib/excel/roster";
import type { Component } from "@/lib/grading/deped";

export type ExportData = {
  /** Learners in the class. `assessments[].scores` lines up with this list. */
  learners: { firstName: string; lastName: string }[];
  assessments: {
    id: string;
    title: string;
    activitySlot?: string | null;
    total: number;
    scores: (number | null)[];
    /** Term and component, when known. They decide which free slots are offered. */
    term?: number | null;
    component?: Component | null;
  }[];
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
  /** "hps" is the highest possible score written into a free slot. */
  kind: "new" | "changed" | "hps";
  /** Key of the "hps" write this score depends on. If that cell cannot be written, neither can this one. */
  needs?: string;
  /**
   * For "hps": learners of the sheet who will have no score in this column. Once the highest possible
   * score is set, each of them counts 0 for it in the term total, as in any DepEd class record.
   */
  missing?: number;
  /** For "hps": learners in the sheet. */
  of?: number;
};

export type Candidate = ColumnRef & {
  label: string;
  /** Highest possible score the column will have. For a free slot, the activity's own total. */
  total: number;
  /** True when TeacherCo will set the highest possible score. */
  free: boolean;
  component: Component | null;
  term: number | null;
};

export type ExportPlan = {
  writes: PlannedWrite[];
  /** Highest possible scores to write into free slots. One per slot that receives scores. */
  hpsWrites: PlannedWrite[];
  /** Same score already in the file. */
  unchanged: number;
  /** Cells holding text such as "ABS". Left alone. */
  keptText: number;
  /** Learners in the file that TeacherCo does not have in this class. */
  unknownLearners: string[];
  /** Names listed twice in one sheet. Left alone, since the right row cannot be told. */
  ambiguousLearners: string[];
  /** Assessments written into a column. */
  matched: { title: string; sheet: string; column: string; free: boolean }[];
  /**
   * TeacherCo assessments with no column of the same title in the file.
   * `selected` is the column chosen for it. `suggested` is the free slot TeacherCo picks by itself:
   * the first one of the same component and term that nothing else uses, and ONLY when every learner of
   * that sheet has a score. Otherwise `heldBack` says why nothing was picked.
   */
  unmapped: {
    id: string;
    title: string;
    activitySlot?: string | null;
    total: number;
    component: Component | null;
    candidates: Candidate[];
    selected: ColumnRef | null;
    suggested: ColumnRef | null;
    heldBack: { sheet: string; column: string; missing: number; of: number } | null;
  }[];
  /** A column already has a highest possible score, and it differs. Not exported. */
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

const termNumber = (term: string): number | null => {
  const m = /(\d)/.exec(term);
  return m ? Number(m[1]) : null;
};
const posKey = (sheet: string, col: number) => `${sheet}|${col}`;

/**
 * @param sheets  Grade sheets detected WITH empty columns kept and free slots included
 *                (detectGradeSheet(..., { keepEmpty: true, includeFree: true })).
 * @param grids   The same sheets as text grids, to see what is really in a cell.
 * @param manual  Columns the teacher picked for assessments that have no matching title.
 */
export function planExport(
  sheets: GradeSheet[],
  grids: Map<string, SheetGrid>,
  data: ExportData,
  manual: Record<string, ColumnRef | null> = {},
): ExportPlan {
  const byName = new Map<string, number>();
  data.learners.forEach((l, i) => {
    byName.set(nameKey(l.firstName, l.lastName), i);
  });

  // Every score column of the file, addressable by title and by position.
  type Located = { sheet: GradeSheet; colIdx: number };
  const byTitle = new Map<string, Located>();
  const byPos = new Map<string, Located>();
  for (const sheet of sheets) {
    sheet.columns.forEach((c, colIdx) => {
      // A free slot has no scores or highest possible score yet, so it is never "the column of that title".
      if (!c.free && !byTitle.has(c.title)) byTitle.set(c.title, { sheet, colIdx });
      byPos.set(posKey(sheet.sheet, c.col), { sheet, colIdx });
    });
  }

  const writes: PlannedWrite[] = [];
  const hpsWrites: PlannedWrite[] = [];
  const unknown = new Set<string>();
  const ambiguous = new Set<string>();
  const matched: ExportPlan["matched"] = [];
  const mismatched: ExportPlan["mismatched"] = [];
  const needColumn: ExportData["assessments"] = [];
  const usedBy = new Map<string, string>(); // column -> assessment id
  let unchanged = 0;
  let keptText = 0;

  /** Learners of a sheet that will have no score for this activity. */
  function missingCount(a: ExportData["assessments"][number], sheet: GradeSheet) {
    let missing = 0;
    for (const l of sheet.learners) {
      const j = byName.get(nameKey(l.firstName, l.lastName));
      if (j === undefined || a.scores[j] == null) missing++;
    }
    return { missing, of: sheet.learners.length };
  }

  type Job = { a: ExportData["assessments"][number]; at: Located };
  const jobs: Job[] = [];

  for (const a of data.assessments) {
    const pick = manual[a.id];
    const titleHit = a.activitySlot
      ? [...byPos.values()].find((at) => at.sheet.columns[at.colIdx].title === a.activitySlot)
      : byTitle.get(a.title);
    if (!titleHit) needColumn.push(a);

    const at = pick ? byPos.get(posKey(pick.sheet, pick.col)) : titleHit;
    if (!at) continue;

    const column = at.sheet.columns[at.colIdx];
    if (!column.free && Math.abs(column.total - a.total) > EPS) {
      mismatched.push({ title: a.title, fileTotal: column.total, appTotal: a.total });
      continue;
    }
    const k = posKey(at.sheet.sheet, column.col);
    if (usedBy.has(k)) continue; // one activity per column
    usedBy.set(k, a.id);
    jobs.push({ a, at });
  }

  for (const { a, at } of jobs) {
    const { sheet, colIdx } = at;
    const column = sheet.columns[colIdx];
    const grid = grids.get(sheet.sheet);

    let needs: string | undefined;
    if (column.free) {
      if (sheet.hpsRow == null) continue;
      const address = `${colName(column.col)}${sheet.hpsRow}`;
      needs = `${sheet.sheet}!${address}`;
      hpsWrites.push({
        key: needs,
        sheet: sheet.sheet,
        row: sheet.hpsRow,
        col: column.col,
        address,
        learner: "Highest possible score",
        title: a.title,
        old: null,
        value: a.total,
        kind: "hps",
        ...missingCount(a, sheet),
      });
    }
    matched.push({ title: a.title, sheet: sheet.sheet, column: colName(column.col), free: !!column.free });

    const timesInSheet = new Map<string, number>();
    for (const l of sheet.learners) {
      const k = nameKey(l.firstName, l.lastName);
      timesInSheet.set(k, (timesInSheet.get(k) ?? 0) + 1);
    }

    sheet.learners.forEach((l, i) => {
      const key = nameKey(l.firstName, l.lastName);
      if ((timesInSheet.get(key) ?? 0) > 1) {
        ambiguous.add(`${l.lastName}, ${l.firstName}`);
        return;
      }
      const j = byName.get(key);
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
        ...(needs ? { needs } : {}),
      });
    });
  }

  // A free slot that ended up with no score to write gets no highest possible score either.
  const needed = new Set(writes.flatMap((w) => (w.needs ? [w.needs] : [])));
  const hps = hpsWrites.filter((h) => needed.has(h.key));

  // ------------------------------------------------------------ columns the teacher can choose from
  const slots: Candidate[] = sheets.flatMap((s) =>
    s.columns
      // Only EMPTY columns: a manual choice must never replace another assessment's scores.
      .filter((c) => c.free || c.scores.every((v) => v == null))
      .map((c) => ({
        sheet: s.sheet,
        col: c.col,
        label: `${s.sheet} · ${c.title.split(" · ").pop()} (${colName(c.col)})${c.free ? " · empty, TeacherCo sets the score" : ""}`,
        total: c.total,
        free: !!c.free,
        component: c.component,
        term: termNumber(s.term),
      })),
  );

  const taken = new Set(usedBy.keys());
  const unmapped: ExportPlan["unmapped"] = needColumn.map((a) => {
    const pick = manual[a.id] ?? null;
    const own = pick ? posKey(pick.sheet, pick.col) : null;

    const candidates = slots
      .filter((c) => {
        if (a.activitySlot) {
          const at = byPos.get(posKey(c.sheet, c.col));
          if (at?.sheet.columns[at.colIdx].title !== a.activitySlot) return false;
        }
        const k = posKey(c.sheet, c.col);
        const owner = usedBy.get(k);
        if (owner && owner !== a.id) return false;
        if (c.free) {
          if (a.component && c.component && c.component !== a.component) return false;
          if (a.term != null && c.term != null && c.term !== a.term) return false;
          return true;
        }
        // A column the teacher prepared: only when its highest possible score is the activity's.
        return Math.abs(c.total - a.total) < EPS || k === own;
      })
      .sort((x, y) => Number(x.free) - Number(y.free)) // prepared columns first, order kept
      .map((c) => ({ ...c, total: c.free ? a.total : c.total }));

    return {
      id: a.id,
      title: a.title,
      total: a.total,
      component: a.component ?? null,
      candidates,
      selected: pick,
      suggested: null as ColumnRef | null,
      heldBack: null as ExportPlan["unmapped"][number]["heldBack"],
    };
  });

  // Suggest a slot only when TeacherCo knows the component AND every learner has a score. A new highest
  // possible score counts 0 for each learner without one, so a half-checked activity would lower their grades.
  // Nothing is exported until the teacher downloads.
  const sheetByName = new Map(sheets.map((s) => [s.sheet, s]));
  for (const u of unmapped) {
    if (u.selected || !u.component) continue;
    const hit = u.candidates.find((c) => c.component === u.component && !taken.has(posKey(c.sheet, c.col)));
    const sheet = hit ? sheetByName.get(hit.sheet) : undefined;
    const activity = needColumn.find((a) => a.id === u.id);
    if (!hit || !sheet || !activity) continue;
    const { missing, of } = missingCount(activity, sheet);
    if (hit.free && missing > 0) {
      u.heldBack = { sheet: hit.sheet, column: colName(hit.col), missing, of };
      continue;
    }
    u.suggested = { sheet: hit.sheet, col: hit.col };
    taken.add(posKey(hit.sheet, hit.col));
  }

  return {
    writes,
    hpsWrites: hps,
    unchanged,
    keptText,
    unknownLearners: [...unknown],
    ambiguousLearners: [...ambiguous],
    matched,
    unmapped,
    mismatched,
  };
}