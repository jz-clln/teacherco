// Deterministic scoring. No AI. Same code runs in the browser (live preview)
// and on the server (the value that gets saved).

export interface ScorableItem {
  id: string;
  itemNumber: number;
  expected: string;
  points: number;
}

export interface ItemResult {
  itemId: string;
  itemNumber: number;
  given: string;
  expected: string;
  isCorrect: boolean;
  pointsAwarded: number;
}

export interface ScoreResult {
  score: number;
  maxScore: number;
  percent: number;
  correctCount: number;
  results: ItemResult[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Returns the uppercase answer if allowed, "" for blank, null if invalid. */
export function normalizeAnswer(raw: unknown, allowed: string[]): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toUpperCase();
  if (v === "") return "";
  return allowed.includes(v) ? v : null;
}

/**
 * `finals` maps item number to the teacher-confirmed answer.
 * Missing or "" counts as blank (no points).
 */
export function scoreAnswers(
  items: ScorableItem[],
  finals: Record<number, string | null | undefined>,
): ScoreResult {
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;

  const results = items.map<ItemResult>((item) => {
    const given = (finals[item.itemNumber] ?? "").toUpperCase();
    const expected = item.expected.toUpperCase();
    const isCorrect = given !== "" && given === expected;
    const pointsAwarded = isCorrect ? item.points : 0;
    maxScore += item.points;
    score += pointsAwarded;
    if (isCorrect) correctCount += 1;
    return { itemId: item.id, itemNumber: item.itemNumber, given, expected, isCorrect, pointsAwarded };
  });

  return {
    score: round2(score),
    maxScore: round2(maxScore),
    percent: maxScore > 0 ? round2((score / maxScore) * 100) : 0,
    correctCount,
    results,
  };
}
