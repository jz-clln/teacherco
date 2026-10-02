// Shared types and small helpers for assessment checking.
// Safe to import from both server and client code.

export type AssessmentFormat = "multiple_choice" | "true_false";

const MC_LABELS = ["A", "B", "C", "D", "E"];

/** Allowed answer values. True/False uses "T" and "F". */
export function choicesFor(format: AssessmentFormat, choiceCount = 4): string[] {
  if (format === "true_false") return ["T", "F"];
  const n = Math.min(Math.max(Math.round(choiceCount), 2), MC_LABELS.length);
  return MC_LABELS.slice(0, n);
}

export function choiceLabel(value: string, format: AssessmentFormat): string {
  if (format === "true_false") return value === "T" ? "True" : value === "F" ? "False" : value;
  return value;
}

export function formatOf(kind: string): AssessmentFormat {
  return kind === "true_false" ? "true_false" : "multiple_choice";
}

/** Reads the choice count stored in assessments.answer_key. */
export function choiceCountOf(answerKey: unknown): number {
  if (answerKey && typeof answerKey === "object" && "choiceCount" in answerKey) {
    const n = Number((answerKey as { choiceCount: unknown }).choiceCount);
    if (Number.isFinite(n)) return n;
  }
  return 4;
}

/** Answers are stored as jsonb `{ "answer": "B" }`. "" means left blank. */
export function answerOf(value: unknown): string {
  if (value && typeof value === "object" && "answer" in value) {
    const a = (value as { answer?: unknown }).answer;
    return typeof a === "string" ? a : "";
  }
  return "";
}

/** Below this the teacher must review the item. */
export const CONFIDENCE_THRESHOLD = 0.85;

export type ReadIssue =
  | "none"
  | "blank"
  | "multiple_marks"
  | "erased_or_unclear"
  | "illegible"
  | "not_returned";

export interface Detection {
  itemNumber: number;
  /** What the model saw. null = nothing usable. */
  answer: string | null;
  confidence: number;
  issue: ReadIssue;
  needsReview: boolean;
  reason: string | null;
}
