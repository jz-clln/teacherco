// src/features/reports/format.ts

import type { FallbackReason } from "@/lib/ai/report-narrative";
import type { LearnerFlag } from "@/lib/evidence/reports";

export const reportTypeLabels = {
  class_performance: "Class Performance Summary",
  learner_progress: "Learner Progress Summary",
} as const;

export type ReportType = keyof typeof reportTypeLabels;

export const flagLabels: Record<LearnerFlag, string> = {
  below_benchmark: "Below benchmark",
  absences: "Absence rule",
  drop: "Dropped",
};

export const fallbackMessages: Record<FallbackReason, string> = {
  ai_off: "AI assistance is turned off in Settings, so this summary was written directly from your records.",
  not_configured: "The AI service is not connected yet, so this summary was written directly from your records.",
  failed: "The AI service did not respond, so this summary was written directly from your records.",
  unverified_numbers:
    "The AI draft contained a number that did not match your records, so TeacherCo discarded it and wrote this summary directly from your records.",
};

export function fmtPct(value: number | null | undefined) {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

export function fmtChange(value: number | null | undefined) {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(1)} pts`;
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}