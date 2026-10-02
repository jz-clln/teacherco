// src/lib/excel/grades.ts
//
// Finds the RAW score columns in a DepEd-style term sheet (TERM1, TERM2, ...).
// Works on plain text grids, like roster.ts, so it is easy to test.
//
// What it keeps:  Written Works 1-5, Performance Tasks 1-3, ST1, ST2, TE and so on,
//                 each with the "highest possible score" from the sheet.
// What it skips:  Total, PS, WS, Initial Grade, Term Grade, Descriptor (formulas the
//                 app can recompute), and sheets with no highest-possible-score row,
//                 such as SUMMARY OF GRADES.
//
// Scores are matched to learners by NAME, never by row position, because a term
// sheet can hold a different class list than the rest of the workbook.

import { extractRoster, suggestMapping, type Grid, type SheetGrid } from "@/lib/excel/roster";

/** Which DepEd component a column sits under. Oral recitation belongs under written / oral works. */
export type ColumnComponent = "written_work" | "performance_task" | "assessment";

export type GradeColumn = {
  /** 0-based column in the sheet. */
  col: number;
  /** The component this column sits under, read from the group title above it. */
  component: ColumnComponent | null;
  /**
   * A free slot: the column has its header (3, 4, 5 ...) but no highest possible score and no
   * scores yet. `total` is 0 until TeacherCo sets it. Only returned with `includeFree`.
   */
  free?: boolean;
  /** Unique title used for the assessment, e.g. "Term 2 · Written Work 1". */
  title: string;
  /** Highest possible score for this column. */
  total: number;
  /** One entry per learner in `GradeSheet.learners`. null = blank or unusable. */
  scores: (number | null)[];
};

export type GradeLearner = { firstName: string; lastName: string; lrn: string; sourceRow: number };

export type GradeSheet = {
  sheet: string;
  term: string;
  learners: GradeLearner[];
  columns: GradeColumn[];
  /** Cells that were not numbers, were negative, or were above the highest possible score. */
  ignored: number;
  /** 1-based row of "HIGHEST POSSIBLE SCORE". Needed to fill a free slot. */
  hpsRow?: number;
};

export type DetectGradeOptions = {
  /**
   * Also return score columns that have a highest possible score but no scores yet.
   * Used by the export, so a new assessment can be written into an empty column.
   * Imports leave this off.
   */
  keepEmpty?: boolean;
  /**
   * Also return free slots: score columns that have a header but no highest possible score and no
   * scores. The export fills them and sets the highest possible score itself, so the teacher
   * does not have to prepare a column by hand. Imports leave this off.
   */
  includeFree?: boolean;
};

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const cell = (rows: Grid, r: number, c: number) => rows[r]?.[c] ?? "";

const HPS_LABEL = /^(highest\s+possible\s+score|hps)\b/i;
const SKIP_HEADER = /^(total|ps|ws|percentage(\s+score)?|weighted(\s+score)?)$/i;
const SCORE_HEADER = /^(\d{1,2}|st\s*\d{1,2}|te|qa|qe)$/i;

const COMPONENT_KEY: Record<string, ColumnComponent> = {
  "Written Work": "written_work",
  "Performance Task": "performance_task",
  "Summative Test": "assessment",
};

function componentOf(label: string): string | null {
  const s = squash(label);
  if (!s) return null;
  if (/written|oral|\bww\b/i.test(s)) return "Written Work";
  if (/perform|product|\bpt\b/i.test(s)) return "Performance Task";
  if (/summative|term\s*e|exam|quarterly|\bqa\b/i.test(s)) return "Summative Test";
  return null;
}

/** "12" -> 12, "" -> blank, "ABS" -> bad. */
function parseScore(raw: string): { value: number | null; bad: boolean } {
  const s = squash(raw);
  if (!s) return { value: null, bad: false };
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? { value: n, bad: false } : { value: null, bad: true };
}

function termLabel(sheet: SheetGrid): string {
  const pretty = (word: string, n: string) => `${/^term$/i.test(word) ? "Term" : "Quarter"} ${n}`;
  const byName = /(term|quarter|qtr)\s*[-_.]?\s*(\d)/i.exec(sheet.name);
  if (byName) return pretty(byName[1], byName[2]);
  const q = /^q\s*(\d)$/i.exec(sheet.name.trim());
  if (q) return `Quarter ${q[1]}`;

  for (let r = 0; r < Math.min(sheet.rows.length, 12); r++) {
    for (let c = 0; c < 3; c++) {
      const m = /^(term|quarter)\s*(\d)\b/i.exec(squash(cell(sheet.rows, r, c)));
      if (m) return pretty(m[1], m[2]);
    }
  }
  return sheet.name;
}

/** Returns the grade data of one sheet, or null when it has no score columns. */
export function detectGradeSheet(sheet: SheetGrid, options: DetectGradeOptions = {}): GradeSheet | null {
  const rows = sheet.rows;

  // 1. The "HIGHEST POSSIBLE SCORE" row. The column headers sit right above it.
  let hpsRow = -1;
  outer: for (let r = 0; r < Math.min(rows.length, 30); r++) {
    for (let c = 0; c < 4; c++) {
      if (HPS_LABEL.test(squash(cell(rows, r, c)))) {
        hpsRow = r;
        break outer;
      }
    }
  }
  if (hpsRow < 1) return null;
  const subRow = hpsRow - 1;

  // 2. The row with the group titles (WRITTEN WORKS, PERFORMANCE TASK, ...).
  //    Merged titles are stored only in their first column, so they carry to the right.
  let labelRow = -1;
  for (let r = subRow - 1; r >= Math.max(0, subRow - 3); r--) {
    if (rows[r]?.some((v) => componentOf(v))) {
      labelRow = r;
      break;
    }
  }

  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const term = termLabel(sheet);
  const seen = new Set<string>();
  const found: Omit<GradeColumn, "scores">[] = [];
  let current: string | null = null;

  for (let c = 0; c < width; c++) {
    const label = labelRow >= 0 ? squash(cell(rows, labelRow, c)) : "";
    if (label) current = componentOf(label);

    const sub = squash(cell(rows, subRow, c));
    if (!sub || SKIP_HEADER.test(sub) || !SCORE_HEADER.test(sub)) continue;

    const total = parseScore(cell(rows, hpsRow, c)).value;
    const free = total == null || !(total > 0);
    if (free && !options.includeFree) continue;

    let name: string;
    const st = /^st\s*(\d+)$/i.exec(sub);
    if (st) name = `Summative Test ${st[1]}`;
    else if (/^te$/i.test(sub)) name = "Term Exam";
    else if (/^(qa|qe)$/i.test(sub)) name = "Quarterly Assessment";
    else name = `${current ?? "Score"} ${Number(sub)}`;

    const title = `${term} · ${name}`;
    if (seen.has(title)) continue;
    seen.add(title);
    found.push({
      col: c,
      title,
      total: free ? 0 : (total as number),
      component: current ? (COMPONENT_KEY[current] ?? null) : null,
      ...(free ? { free: true } : {}),
    });
  }
  if (found.length === 0) return null;

  // 3. The learners in this sheet, read with the same name logic as the roster import.
  const base = suggestMapping(sheet);
  const learners: GradeLearner[] = extractRoster(rows, { ...base, firstRow: Math.max(base.firstRow, hpsRow + 1) })
    .filter((r) => r.include && r.firstName && r.lastName)
    .map((r) => ({ firstName: r.firstName, lastName: r.lastName, lrn: r.lrn, sourceRow: r.sourceRow }));
  if (learners.length === 0) return null;

  // 4. Scores. Blank stays blank. Never invent a zero.
  let ignored = 0;
  const columns: GradeColumn[] = found
    // A free slot only counts when no learner cell holds anything, not even text such as "ABS".
    .filter((col) => !col.free || learners.every((l) => cell(rows, l.sourceRow - 1, col.col).trim() === ""))
    .map((col) => ({
      ...col,
      scores: learners.map((l) => {
        const { value, bad } = parseScore(cell(rows, l.sourceRow - 1, col.col));
        if (bad || (value != null && (value < 0 || value > col.total))) {
          ignored++;
          return null;
        }
        return value;
      }),
    }))
    .filter((col) => col.free || options.keepEmpty || col.scores.some((s) => s != null));
  if (columns.length === 0) return null;

  return { sheet: sheet.name, term, learners, columns, ignored, hpsRow: hpsRow + 1 };
}