// src/lib/grading/deped.ts
//
// DepEd-style term grade, calculated by plain code (never by AI).
// No imports, so it runs on the server, in the browser and offline.
//
// The method is the one your own class record uses (TERM sheets):
//   1. Per component: Percentage Score (PS) = total score / highest possible score x 100, rounded to 2 decimals.
//   2. Weighted Score (WS) = PS x component weight (e.g. 20% / 50% / 30%), rounded to 2 decimals.
//   3. Initial Grade = sum of the three WS, rounded to 2 decimals.
//   4. Term Grade = Initial Grade looked up in the transmutation table (largest "from" that is <= the grade).
//   5. Descriptor = Term Grade looked up in the descriptor table (Emerging ... Advancing).
// The weights, the table and the descriptors come from the teacher's workbook, not from this file.

export const COMPONENTS = ["written_work", "performance_task", "assessment"] as const;
export type Component = (typeof COMPONENTS)[number];

export const COMPONENT_LABEL: Record<Component, string> = {
  written_work: "Written / Oral Works",
  performance_task: "Product / Performance Tasks",
  assessment: "Summative Tests & Term Exam",
};

export type TransmutationRow = { min: number; max: number | null; grade: number };
export type DescriptorRow = { min: number; label: string };

export type GradingConfig = {
  weights: Record<Component, number>;
  transmutation: TransmutationRow[];
  descriptors: DescriptorRow[];
};

// ---------------------------------------------------------------------------
// Reading titles such as "Term 2 · Written Work 1" (written by the grade import).

export function inferTermAndComponent(title: string): {
  term: number | null;
  component: Component | null;
  isTermExam: boolean;
} {
  const t = /^(?:term|quarter|qtr)\s*[-_.]?\s*([1-4])(?:\s|$|[·.\-:])/i.exec(title.trim());
  let component: Component | null = null;
  if (/written|oral|\bww\b/i.test(title)) component = "written_work";
  else if (/perform|product|\bpt\b/i.test(title)) component = "performance_task";
  else if (/summative|term\s*exam|quarterly|\bqa\b|\bte\b/i.test(title)) component = "assessment";
  return {
    term: t ? Number(t[1]) : null,
    component,
    isTermExam: /term\s*exam|quarterly\s*assessment|\bte\b/i.test(title),
  };
}

// ---------------------------------------------------------------------------
// Rounding that behaves like Excel's ROUND (half away from zero, decimal-safe).

export function roundHalfUp(n: number, digits = 2): number {
  if (!Number.isFinite(n)) return n;
  const s = String(Math.abs(n));
  if (s.includes("e")) return Math.sign(n) * (Math.round(Math.abs(n) * 10 ** digits) / 10 ** digits);
  return Math.sign(n) * Number(Math.round(Number(`${s}e${digits}`)) + `e-${digits}`);
}
const round2 = (n: number) => roundHalfUp(n, 2);

// ---------------------------------------------------------------------------
// Lookups (same behaviour as VLOOKUP(..., TRUE)).

function lookupByMin<T extends { min: number }>(rows: T[], value: number): T | null {
  let hit: T | null = null;
  for (const row of [...rows].sort((a, b) => a.min - b.min)) {
    if (row.min <= value) hit = row;
    else break;
  }
  return hit;
}

export function transmuteRow(initial: number, table: TransmutationRow[]): TransmutationRow | null {
  return lookupByMin(table, initial);
}
export const transmute = (initial: number, table: TransmutationRow[]) => transmuteRow(initial, table)?.grade ?? null;

export function describeGrade(termGrade: number, table: DescriptorRow[]): string | null {
  return lookupByMin(table, termGrade)?.label.trim() ?? null;
}

// ---------------------------------------------------------------------------
// The term grade.

export type ScoreItem = {
  title: string;
  component: Component;
  /** Highest possible score of this assessment. */
  possible: number;
  /** The learner's score. null = no score recorded. */
  earned: number | null;
  isTermExam: boolean;
};

export type ComponentResult = {
  component: Component;
  items: { title: string; earned: number | null; possible: number }[];
  earned: number;
  possible: number;
  /** Assessments that have a score / that do not. */
  scored: number;
  blank: number;
  /** Percentage Score. null when nothing is scored. */
  ps: number | null;
  weight: number;
  /** Weighted Score. */
  ws: number | null;
};

export type TermGradeResult = {
  /** graded: full grade. incomplete: scores exist but the Term Exam is missing. no_scores: nothing recorded. */
  status: "graded" | "incomplete" | "no_scores";
  components: ComponentResult[];
  initialGrade: number | null;
  termGrade: number | null;
  descriptor: string | null;
  /** The transmutation row that produced the term grade. */
  tableRow: TransmutationRow | null;
  warnings: string[];
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function computeTermGrade(
  items: ScoreItem[],
  config: GradingConfig,
  /** Highest possible score per component printed in the teacher's sheet. Used only to explain gaps. */
  sheetPossible?: Partial<Record<Component, number>>,
): TermGradeResult {
  const warnings: string[] = [];

  const components: ComponentResult[] = COMPONENTS.map((component) => {
    const its = items.filter((i) => i.component === component);
    const scored = its.filter((i) => i.earned != null);
    const possible = sum(its.map((i) => i.possible));
    const earned = sum(scored.map((i) => i.earned as number));
    const ps = scored.length > 0 && possible > 0 ? round2((earned / possible) * 100) : null;
    const weight = config.weights[component];
    return {
      component,
      items: its.map((i) => ({ title: i.title, earned: i.earned, possible: i.possible })),
      earned,
      possible,
      scored: scored.length,
      blank: its.length - scored.length,
      ps,
      weight,
      ws: ps == null ? null : round2(ps * weight),
    };
  });

  if (Math.abs(sum(Object.values(config.weights)) - 1) > 0.001) {
    warnings.push("The weights in your class record do not add up to 100%.");
  }

  const base = { components, warnings, tableRow: null as TransmutationRow | null };
  if (components.every((c) => c.ps == null)) {
    return { ...base, status: "no_scores", initialGrade: null, termGrade: null, descriptor: null };
  }

  // A sheet only issues a grade once the Term Exam has a score.
  const exams = items.filter((i) => i.component === "assessment");
  const gate = exams.some((i) => i.isTermExam) ? exams.filter((i) => i.isTermExam) : exams;
  const examRecorded = gate.some((i) => i.earned != null);

  for (const c of components) {
    if (c.weight <= 0) continue;
    const label = COMPONENT_LABEL[c.component];
    if (c.items.length === 0 || c.ps == null) {
      warnings.push(`No ${label} scores are recorded. They count as 0, as in your Excel sheet.`);
    } else if (c.blank > 0) {
      warnings.push(`${c.blank} of ${c.items.length} ${label} have no score. They count as 0, as in your Excel sheet.`);
    }
    const expected = sheetPossible?.[c.component];
    if (expected != null && Math.abs(expected - c.possible) > 0.001) {
      warnings.push(
        `Your Excel sheet counts ${expected} possible points for ${label}, but TeacherCo has ${c.possible}. An assessment column may be missing here.`,
      );
    }
  }

  if (!examRecorded) {
    return { ...base, status: "incomplete", initialGrade: null, termGrade: null, descriptor: null };
  }

  const initialGrade = round2(sum(components.map((c) => c.ws ?? 0)));
  const tableRow = transmuteRow(initialGrade, config.transmutation);
  const termGrade = tableRow?.grade ?? null;
  return {
    ...base,
    tableRow,
    status: "graded",
    initialGrade,
    termGrade,
    descriptor: termGrade == null ? null : describeGrade(termGrade, config.descriptors),
  };
}

// ---------------------------------------------------------------------------
// The trust check: TeacherCo's grade against the grade printed in the teacher's Excel.

export type RecordedGrade = { initialGrade: number | null; termGrade: number | null; descriptor: string | null };

export type Comparison = {
  /**
   * match       same term grade as the Excel record
   * differs     both have a grade and they are not the same
   * app_only    TeacherCo has a grade, the Excel record has none
   * record_only Excel has a grade, TeacherCo cannot calculate one from its scores
   * pending     neither has a grade yet
   */
  status: "match" | "differs" | "app_only" | "record_only" | "pending";
  /** TeacherCo minus Excel. */
  termGap: number | null;
  initialGap: number | null;
};

const norm = (s: string | null) => (s ?? "").trim().toLowerCase();

export function compareToRecord(result: TermGradeResult, record: RecordedGrade | null): Comparison {
  const ours = result.termGrade;
  const theirs = record?.termGrade ?? null;
  const initialGap =
    result.initialGrade != null && record?.initialGrade != null ? round2(result.initialGrade - record.initialGrade) : null;

  if (ours == null && theirs == null) return { status: "pending", termGap: null, initialGap };
  if (ours == null) return { status: "record_only", termGap: null, initialGap };
  if (theirs == null) return { status: "app_only", termGap: null, initialGap };

  const sameDescriptor = !record?.descriptor || norm(result.descriptor) === norm(record.descriptor);
  return {
    status: ours === theirs && sameDescriptor ? "match" : "differs",
    termGap: round2(ours - theirs),
    initialGap,
  };
}