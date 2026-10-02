//src\lib\evidence\metrics.ts - Jabez

export type ScoreRow = { learnerId: string; earned: number | null; possible: number | null };

export function percentage(earned: number, possible: number) {
  if (possible <= 0) return null;
  return (earned / possible) * 100;
}

export function classAverage(rows: ScoreRow[]) {
  const values = rows.flatMap((row) => {
    if (row.earned == null || row.possible == null) return [];
    const value = percentage(row.earned, row.possible);
    return value == null ? [] : [value];
  });
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function belowBenchmark(rows: ScoreRow[], benchmark: number) {
  return rows.filter((row) => {
    if (row.earned == null || row.possible == null) return false;
    const value = percentage(row.earned, row.possible);
    return value != null && value < benchmark;
  });
}
