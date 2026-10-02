// Class and item statistics from confirmed submissions. Plain math, no AI.
// src/lib/exams/analytics.ts - carlo

export interface AnalyticsItem {
  id: string;
  itemNumber: number;
  expected: string;
  points: number;
  competencies: string[];
}

export interface AnalyticsSubmission {
  learnerId: string;
  score: number;
  maxScore: number;
  /** keyed by assessment item id */
  answers: Record<string, { given: string; isCorrect: boolean }>;
}

export interface ClassStats {
  checked: number;
  roster: number;
  mean: number | null;
  median: number | null;
  highest: number | null;
  lowest: number | null;
  belowBenchmark: number;
}

export interface ItemStat {
  itemId: string;
  itemNumber: number;
  expected: string;
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  percentCorrect: number;
  /** how many learners picked each answer; "" key = blank */
  distribution: Record<string, number>;
  topWrong: { answer: string; count: number } | null;
  competencies: string[];
  isGap: boolean;
}

export interface CompetencyStat {
  name: string;
  itemNumbers: number[];
  percentCorrect: number;
  learnersMeasured: number;
  learnersBelow: number;
}

/** A question is a possible gap when most checked learners missed it. */
export const GAP_PERCENT_CORRECT = 50;
export const GAP_MIN_SUBMISSIONS = 5;

const r1 = (n: number) => Math.round(n * 10) / 10;

function median(sorted: number[]): number | null {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  const a = sorted[mid];
  const b = sorted[mid - 1];
  if (a === undefined) return null;
  return sorted.length % 2 ? a : r1(((b ?? a) + a) / 2);
}

export function analyze(
  items: AnalyticsItem[],
  submissions: AnalyticsSubmission[],
  opts: { benchmark: number; rosterSize: number },
) {
  const percents = submissions
    .map((s) => (s.maxScore > 0 ? (s.score / s.maxScore) * 100 : 0))
    .sort((x, y) => x - y);

  const classStats: ClassStats = {
    checked: submissions.length,
    roster: opts.rosterSize,
    mean: percents.length ? r1(percents.reduce((a, b) => a + b, 0) / percents.length) : null,
    median: (() => { const m = median(percents); return m === null ? null : r1(m); })(),
    highest: percents.length ? r1(percents[percents.length - 1] ?? 0) : null,
    lowest: percents.length ? r1(percents[0] ?? 0) : null,
    belowBenchmark: percents.filter((p) => p < opts.benchmark).length,
  };

  const itemStats: ItemStat[] = items.map((item) => {
    const distribution: Record<string, number> = {};
    let correct = 0;
    let total = 0;
    for (const s of submissions) {
      const a = s.answers[item.id];
      if (!a) continue;
      total += 1;
      if (a.isCorrect) correct += 1;
      distribution[a.given] = (distribution[a.given] ?? 0) + 1;
    }
    const wrongPicks = Object.entries(distribution)
      .filter(([answer]) => answer !== "" && answer !== item.expected)
      .sort((x, y) => y[1] - x[1]);
    const top = wrongPicks[0];
    const percentCorrect = total ? r1((correct / total) * 100) : 0;
    return {
      itemId: item.id,
      itemNumber: item.itemNumber,
      expected: item.expected,
      total,
      correct,
      wrong: total - correct,
      blank: distribution[""] ?? 0,
      percentCorrect,
      distribution,
      topWrong: top ? { answer: top[0], count: top[1] } : null,
      competencies: item.competencies,
      isGap: total >= GAP_MIN_SUBMISSIONS && percentCorrect < GAP_PERCENT_CORRECT,
    };
  });

  const names = [...new Set(items.flatMap((i) => i.competencies))];
  const competencyStats: CompetencyStat[] = names.map((name) => {
    const inComp = items.filter((i) => i.competencies.includes(name));
    let correct = 0;
    let total = 0;
    let measured = 0;
    let below = 0;
    for (const s of submissions) {
      let c = 0;
      let t = 0;
      for (const item of inComp) {
        const a = s.answers[item.id];
        if (!a) continue;
        t += 1;
        if (a.isCorrect) c += 1;
      }
      if (t === 0) continue;
      correct += c;
      total += t;
      measured += 1;
      if ((c / t) * 100 < opts.benchmark) below += 1;
    }
    return {
      name,
      itemNumbers: inComp.map((i) => i.itemNumber),
      percentCorrect: total ? r1((correct / total) * 100) : 0,
      learnersMeasured: measured,
      learnersBelow: below,
    };
  });

  return {
    classStats,
    itemStats,
    gaps: itemStats.filter((i) => i.isGap).sort((x, y) => x.percentCorrect - y.percentCorrect),
    competencyStats: competencyStats.sort((x, y) => x.percentCorrect - y.percentCorrect),
  };
}

/** [1,2,3,7,9,10] -> "1–3, 7, 9–10" */
export function formatItemRange(numbers: number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && (sorted[j + 1] ?? 0) === (sorted[j] ?? 0) + 1) j += 1;
    parts.push(j > i ? `${sorted[i]}–${sorted[j]}` : `${sorted[i]}`);
    i = j + 1;
  }
  return parts.join(", ");
}
