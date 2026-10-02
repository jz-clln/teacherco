// src/features/export/actions.ts

"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ExportData } from "@/lib/excel/export-plan";
import type { Component } from "@/lib/grading/deped";

export type ExportDataResult =
  | {
      ok: true;
      data: ExportData;
      /** Assessment id -> title of the workbook column it was exported into before. */
      exportedTitles: Record<string, string>;
    }
  | { ok: false; error: string };

export type RememberResult = { ok: true } | { ok: false; error: string };

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

  type AssessmentRow = {
    id: string;
    title: string;
    total_points: number | string | null;
    exported_title: string | null;
    term?: number | null;
    component?: string | null;
  };
  const listAssessments = async (columns: string) =>
    supabase.from("assessments").select(columns).eq("class_id", classId).order("created_at").limit(1000);

  const [{ data: enrolled, error: enrolledError }, withTerm] = await Promise.all([
    supabase
      .from("class_enrollments")
      .select("learner:learners(id,first_name,last_name)")
      .eq("class_id", classId)
      .eq("status", "active")
      .limit(2000),
    listAssessments("id,title,total_points,created_at,exported_title,term,component"),
  ]);
  // term and component come from the grading migration. Without them the export still works, it just
  // cannot tell which free slot an activity belongs under.
  const plain = withTerm.error ? await listAssessments("id,title,total_points,created_at,exported_title") : null;
  const assessments = ((plain ? plain.data : withTerm.data) ?? []) as unknown as AssessmentRow[];
  if (enrolledError || (plain ? plain.error : withTerm.error)) return { ok: false, error: "Could not read the class. Please try again." };

  const learners: ExportData["learners"] = [];
  const indexById = new Map<string, number>();
  for (const e of enrolled ?? []) {
    const l = Array.isArray(e.learner) ? e.learner[0] : e.learner;
    if (!l?.id || !l.first_name || !l.last_name) continue;
    indexById.set(String(l.id), learners.length);
    learners.push({ firstName: String(l.first_name), lastName: String(l.last_name) });
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
  const exportedTitles: Record<string, string> = {};
  const COMPONENTS: Component[] = ["written_work", "performance_task", "assessment"];
  for (const a of assessments) {
    const entry = byAssessment.get(String(a.id));
    if (!entry) continue;
    const total = a.total_points != null ? Number(a.total_points) : entry.max;
    if (total == null || !(total > 0)) continue;
    out.push({
      id: String(a.id),
      title: String(a.title),
      total,
      scores: entry.scores,
      term: a.term == null ? null : Number(a.term),
      component: COMPONENTS.find((c) => c === a.component) ?? null,
    });
    if (a.exported_title) exportedTitles[String(a.id)] = String(a.exported_title);
  }

  return { ok: true, data: { learners, assessments: out }, exportedTitles };
}

const RememberSchema = z.object({
  classId: z.string().uuid(),
  items: z
    .array(
      z.object({
        assessmentId: z.string().uuid(),
        columnTitle: z.string().trim().min(1).max(160),
      }),
    )
    .min(1)
    .max(100),
});

/**
 * Saves which workbook column each checked or typed-in activity was exported into.
 * The next import then skips that column, so the same scores are not counted twice,
 * and the next export puts the activity back into the same column.
 * Imported activities are never recorded: they already are the column.
 */
export async function rememberExportedColumns(input: z.input<typeof RememberSchema>): Promise<RememberResult> {
  const failed =
    "Your file was built, but TeacherCo could not remember which columns it filled. Importing that file again could count those scores twice.";

  const parsed = RememberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: failed };
  const { classId, items } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are signed out. Please sign in again." };

  // RLS only returns activities of classes this teacher owns.
  const { data: owned, error: ownedError } = await supabase
    .from("assessments")
    .select("id, source")
    .eq("class_id", classId)
    .in("id", items.map((item) => item.assessmentId));
  if (ownedError) return { ok: false, error: failed };

  const allowed = new Set((owned ?? []).filter((a) => a.source !== "imported").map((a) => String(a.id)));
  const toSave = items.filter((item) => allowed.has(item.assessmentId));
  if (toSave.length === 0) return { ok: true };

  const results = await Promise.all(
    toSave.map((item) =>
      supabase.from("assessments").update({ exported_title: item.columnTitle }).eq("id", item.assessmentId),
    ),
  );
  if (results.some((result) => result.error)) return { ok: false, error: failed };

  return { ok: true };
}