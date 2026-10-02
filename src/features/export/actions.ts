// src/features/export/actions.ts

"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ExportData } from "@/lib/excel/export-plan";

export type ExportDataResult = { ok: true; data: ExportData } | { ok: false; error: string };

const PAGE = 1000; // Supabase returns at most 1000 rows per request.

type ScoreRow = { assessment_id: string; learner_id: string; score: number | string | null; max_score: number | string | null };

/**
 * Reads the confirmed scores of one class, so they can be written into the teacher's own
 * workbook. Only the teacher's class is readable (RLS). Unconfirmed scores are not exported.
 */
export async function getExportData(classId: string): Promise<ExportDataResult> {
  if (!z.string().uuid().safeParse(classId).success) return { ok: false, error: "Class not found." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are signed out. Please sign in again." };

  const { data: classroom } = await supabase.from("classes").select("id").eq("id", classId).maybeSingle();
  if (!classroom) return { ok: false, error: "Class not found." };

  const [{ data: enrolled, error: enrolledError }, { data: assessments, error: assessmentsError }] = await Promise.all([
    supabase
      .from("class_enrollments")
      .select("learner:learners(id,first_name,last_name,external_ref)")
      .eq("class_id", classId)
      .eq("status", "active")
      .limit(2000),
    supabase
      .from("assessments")
      .select("id,title,total_points,created_at")
      .eq("class_id", classId)
      .order("created_at")
      .limit(1000),
  ]);
  if (enrolledError || assessmentsError) return { ok: false, error: "Could not read the class. Please try again." };

  const learners: ExportData["learners"] = [];
  const indexById = new Map<string, number>();
  for (const e of enrolled ?? []) {
    const l = Array.isArray(e.learner) ? e.learner[0] : e.learner;
    if (!l?.id || !l.first_name || !l.last_name) continue;
    indexById.set(String(l.id), learners.length);
    learners.push({ firstName: String(l.first_name), lastName: String(l.last_name), lrn: l.external_ref ? String(l.external_ref) : "" });
  }

  const rows: ScoreRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("submissions")
      .select("assessment_id,learner_id,score,max_score,assessments!inner(class_id)")
      .eq("assessments.class_id", classId)
      .eq("review_status", "confirmed")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return { ok: false, error: "Could not read the scores. Please try again." };
    rows.push(...((data ?? []) as unknown as ScoreRow[]));
    if (!data || data.length < PAGE) break;
  }

  const byAssessment = new Map<string, { scores: (number | null)[]; max: number | null }>();
  for (const r of rows) {
    const idx = indexById.get(r.learner_id);
    const score = r.score == null ? null : Number(r.score);
    if (idx === undefined || score == null || !Number.isFinite(score)) continue;
    const entry = byAssessment.get(r.assessment_id) ?? { scores: learners.map(() => null), max: null };
    entry.scores[idx] = score;
    if (entry.max == null && r.max_score != null) entry.max = Number(r.max_score);
    byAssessment.set(r.assessment_id, entry);
  }

  const out: ExportData["assessments"] = [];
  for (const a of assessments ?? []) {
    const entry = byAssessment.get(String(a.id));
    if (!entry) continue;
    const total = a.total_points != null ? Number(a.total_points) : entry.max;
    if (total == null || !(total > 0)) continue;
    out.push({ id: String(a.id), title: String(a.title), total, scores: entry.scores });
  }

  return { ok: true, data: { learners, assessments: out } };
}