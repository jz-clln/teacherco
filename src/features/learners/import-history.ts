// src/features/learners/import-history.ts
//
// A small history of imports, so "Recent changes" can show what an import actually changed.
// Server-side only. Saving history never blocks an import: if it fails, the import still succeeds.

import type { SupabaseClient } from "@supabase/supabase-js";

export type LearnerImportSummary = {
  /** New learners plus linked learners enrolled in this class. */
  added: number;
  linked: number;
  /** Names that were already in the class. */
  skipped: number;
  /** A few of the new names, for display. */
  names: string[];
};

export type ChangedScore = { name: string; title: string; from: number; to: number };

export type GradeImportSummary = {
  scoresNew: number;
  scoresChanged: number;
  scoresSame: number;
  /** Titles of score columns created by this import (first few). */
  assessmentsCreated: string[];
  assessmentsCreatedCount: number;
  /** The biggest score changes (first few). */
  changed: ChangedScore[];
  classAverage: { before: number | null; after: number | null };
  /** Only learners whose own average moved (or who got their first scores). 0-100. */
  learnerAverages: Record<string, { before: number | null; after: number }>;
};

export type ImportEvent =
  | { id: string; kind: "learners"; createdAt: string; summary: LearnerImportSummary }
  | { id: string; kind: "grades"; createdAt: string; summary: GradeImportSummary };

type Db = SupabaseClient;

export async function logImportEvent(
  supabase: Db,
  classId: string,
  kind: "learners",
  summary: LearnerImportSummary,
): Promise<void>;
export async function logImportEvent(
  supabase: Db,
  classId: string,
  kind: "grades",
  summary: GradeImportSummary,
): Promise<void>;
export async function logImportEvent(
  supabase: Db,
  classId: string,
  kind: "learners" | "grades",
  summary: LearnerImportSummary | GradeImportSummary,
): Promise<void> {
  try {
    await supabase.from("import_events").insert({ class_id: classId, kind, summary });
  } catch {
    // History is a bonus. Never fail an import because of it.
  }
}

/** Newest imports first. Returns an empty list if the history table is not set up yet. */
export async function readImportEvents(supabase: Db, classId: string, limit = 8): Promise<ImportEvent[]> {
  const { data, error } = await supabase
    .from("import_events")
    .select("id,kind,summary,created_at")
    .eq("class_id", classId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  const out: ImportEvent[] = [];
  for (const r of data) {
    const base = { id: String(r.id), createdAt: String(r.created_at) };
    if (r.kind === "learners") out.push({ ...base, kind: "learners", summary: r.summary as LearnerImportSummary });
    else if (r.kind === "grades") out.push({ ...base, kind: "grades", summary: r.summary as GradeImportSummary });
  }
  return out;
}