// src/features/scores/actions.ts

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

import { resolveActivitySlot } from "@/features/exams/activity-slots";

export type ScoreState = {
  error?: string;
  success?: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

const lockedMessage: Record<string, string> = {
  checked: "This activity was scored on the Check screen. Change its scores there so the per-question results stay correct.",
  imported: "This activity came from your Excel record. Fix the score in your workbook and import it again.",
};

function refresh(classId: string) {
  revalidatePath(`/classes/${classId}`);
  revalidatePath(`/classes/${classId}/scores`);
  revalidatePath(`/classes/${classId}/term-grades`);
  revalidatePath("/check");
  revalidatePath("/classes");
  revalidatePath("/reports");
  revalidatePath("/reports/[reportId]", "page");
}

const CreateSchema = z.object({
  activitySlot: z.string().min(1).max(160),
  classId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  total: z.number().positive().max(10000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Creates an activity whose scores the teacher types in (oral recitation, seatwork, and so on). */
export async function createManualAssessment(_previous: ScoreState, formData: FormData): Promise<ScoreState> {
  const parsed = CreateSchema.safeParse({
    activitySlot: formData.get("activitySlot"),
    classId: formData.get("classId"),
    title: formData.get("title"),
    total: Number(String(formData.get("total") ?? "").trim().replace(",", ".")),
    date: String(formData.get("date") ?? "") || undefined,
  });
  if (!parsed.success) return { error: "Enter an activity name and a highest possible score above 0." };
  const { classId, title, total, date } = parsed.data;

  const { supabase } = await requireUser();

  // RLS only returns classes this teacher owns.
  const { data: classroom } = await supabase.from("classes").select("id").eq("id", classId).maybeSingle();
  if (!classroom) return { error: "That class could not be found." };

  const destination = await resolveActivitySlot(classId, parsed.data.activitySlot, supabase);
  if (destination.error) return { error: destination.error };

  const { data, error } = await supabase
    .from("assessments")
    .insert({
      class_id: classId,
      title,
      activity_slot: destination.slot.title,
      term: destination.slot.term,
      component: destination.slot.component,
      kind: "mixed",
      status: "closed",
      source: "manual",
      total_points: round2(total),
      assessment_date: date ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.code === "23505" ? "That activity was just assigned. Choose another activity." : "TeacherCo could not create the activity. Please try again." };

  refresh(classId);
  redirect(`/classes/${classId}/scores?a=${data.id}`);
}

/**
 * Saves every score on one manual activity.
 * Only changed scores are sent. A blank box removes that learner's score.
 * Blank is never saved as zero.
 * New and cleared scores are stored by one database function (save_manual_scores),
 * so they are saved together or not at all.
 */
export async function saveManualScores(_previous: ScoreState, formData: FormData): Promise<ScoreState> {
  const assessmentId = z.string().uuid().safeParse(formData.get("assessmentId"));
  if (!assessmentId.success) return { error: "That activity could not be found." };

  const { supabase } = await requireUser();

  const { data: assessment } = await supabase
    .from("assessments")
    .select("id, class_id, source, total_points")
    .eq("id", assessmentId.data)
    .maybeSingle();
  if (!assessment) return { error: "That activity could not be found." };

  // Checked here for a clear message. The database function checks it again.
  if (assessment.source !== "manual") {
    return { error: lockedMessage[String(assessment.source)] ?? "The scores of this activity cannot be edited here." };
  }

  const total = Number(assessment.total_points);
  if (!(total > 0)) return { error: "This activity has no highest possible score." };
  const classId = String(assessment.class_id);

  const [{ data: enrollments, error: enrollmentError }, { data: saved, error: savedError }] = await Promise.all([
    supabase
      .from("class_enrollments")
      .select("learner:learners(id, display_name)")
      .eq("class_id", classId)
      .eq("status", "active")
      .limit(1000),
    supabase.from("submissions").select("learner_id, score").eq("assessment_id", assessment.id).limit(2000),
  ]);
  if (enrollmentError || savedError) return { error: "TeacherCo could not read the class. Please try again." };

  const learners = (enrollments ?? []).flatMap((e) => {
    const l = Array.isArray(e.learner) ? e.learner[0] : e.learner;
    return l?.id ? [{ id: String(l.id), name: String(l.display_name) }] : [];
  });

  const before = new Map<string, number>();
  for (const row of saved ?? []) {
    const score = row.score == null ? null : Number(row.score);
    if (score != null && Number.isFinite(score)) before.set(String(row.learner_id), score);
  }

  const writes: { learner_id: string; score: number }[] = [];
  const removals: string[] = [];
  const invalid: string[] = [];

  for (const learner of learners) {
    const raw = formData.get(`score_${learner.id}`);
    if (raw == null) continue;
    const text = String(raw).trim().replace(",", ".");
    const old = before.get(learner.id);

    if (text === "") {
      if (old !== undefined) removals.push(learner.id);
      continue;
    }

    const value = Number(text);
    if (!Number.isFinite(value) || value < 0 || value > total) {
      invalid.push(learner.name);
      continue;
    }

    const score = round2(value);
    if (old !== undefined && Math.abs(old - score) < 0.005) continue;
    writes.push({ learner_id: learner.id, score });
  }

  if (invalid.length > 0) {
    const shown = invalid.slice(0, 3).join(", ");
    const more = invalid.length > 3 ? ` and ${invalid.length - 3} more` : "";
    return { error: `Check the score for ${shown}${more}. Scores must be a number from 0 to ${total}.` };
  }

  if (writes.length === 0 && removals.length === 0) return { success: "No changes to save." };

  const { error } = await supabase.rpc("save_manual_scores", {
    p_assessment_id: String(assessment.id),
    p_writes: writes,
    p_removals: removals,
  });
  if (error) return { error: "TeacherCo could not save the scores. Nothing was changed. Please try again." };

  refresh(classId);

  const parts: string[] = [];
  if (writes.length > 0) parts.push(`${writes.length} ${writes.length === 1 ? "score" : "scores"} saved`);
  if (removals.length > 0) parts.push(`${removals.length} cleared`);
  return { success: `${parts.join(", ")}.` };
}

/** Deletes a manual activity and its scores. Imported and checked activities cannot be deleted here. */
export async function deleteManualAssessment(formData: FormData) {
  const assessmentId = z.string().uuid().safeParse(formData.get("assessmentId"));
  if (!assessmentId.success) redirect("/reports");

  const { supabase } = await requireUser();

  const { data: assessment } = await supabase
    .from("assessments")
    .select("id, class_id, source")
    .eq("id", assessmentId.data)
    .maybeSingle();
  if (!assessment) redirect("/reports");

  const classId = String(assessment.class_id);
  if (assessment.source === "manual") {
    await supabase.from("assessments").delete().eq("id", assessment.id);
    refresh(classId);
  }

  redirect(`/classes/${classId}/scores`);
}