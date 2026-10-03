// src/features/exams/actions.ts - carlo

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { scoreAnswers, type ScorableItem } from "@/lib/exams/scoring";
import { answerOf, choiceCountOf, choicesFor, formatOf } from "@/lib/exams/types";

import { resolveActivitySlot } from "./activity-slots";

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

type Supabase = Awaited<ReturnType<typeof createClient>>;

// ---------- shared validation ----------

const keyItemSchema = z.object({
  itemNumber: z.number().int().min(1).max(100),
  answer: z.string().trim().toUpperCase().min(1, "Every item needs an answer."),
  competency: z.string().trim().max(80).nullable().optional(),
  points: z.number().min(0.25, "Points per item must be at least 0.25.").max(100).optional(),
});
type KeyItemInput = z.infer<typeof keyItemSchema>;

function keyProblem(items: KeyItemInput[], allowed: string[]): string | null {
  const numbers = items.map((i) => i.itemNumber).sort((a, b) => a - b);
  if (numbers.some((n, idx) => n !== idx + 1)) return "Items must be numbered 1 to " + items.length + " with no gaps.";
  const bad = items.find((i) => !allowed.includes(i.answer));
  if (bad) return `Item ${bad.itemNumber}: "${bad.answer}" is not one of ${allowed.join(", ")}.`;
  return null;
}

async function currentUser(supabase: Supabase) {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

/** Create/reuse class competencies by name (case-insensitive) and link them to items. */
async function linkCompetencies(
  supabase: Supabase,
  classId: string,
  itemRows: { id: string; item_number: number }[],
  items: KeyItemInput[],
): Promise<string | null> {
  const wanted = items.map((i) => i.competency?.trim()).filter((n): n is string => !!n);
  if (!wanted.length) return null;

  const { data: existing, error: existingError } = await supabase
    .from("competencies")
    .select("id,name")
    .eq("class_id", classId);
  if (existingError) return existingError.message;

  const canonical = new Map<string, string>(
    (existing ?? []).map((c: { name: string }) => [c.name.toLowerCase(), c.name]),
  );
  const nameFor = (raw: string) => canonical.get(raw.toLowerCase()) ?? raw;
  const names = [...new Set(wanted.map(nameFor))];

  const { data: comps, error } = await supabase
    .from("competencies")
    .upsert(
      names.map((name) => ({ class_id: classId, name, teacher_confirmed: true })),
      { onConflict: "class_id,name" },
    )
    .select("id,name");
  if (error) return error.message;

  const idByName = new Map<string, string>((comps ?? []).map((c: { id: string; name: string }) => [c.name, c.id]));
  const idByNumber = new Map<number, string>(itemRows.map((r) => [r.item_number, r.id]));

  const links = items.flatMap((i) => {
    const raw = i.competency?.trim();
    const itemId = idByNumber.get(i.itemNumber);
    const compId = raw ? idByName.get(nameFor(raw)) : undefined;
    return itemId && compId ? [{ assessment_item_id: itemId, competency_id: compId }] : [];
  });
  if (!links.length) return null;
  const { error: linkError } = await supabase.from("assessment_competencies").insert(links);
  return linkError ? linkError.message : null;
}

// ---------- create ----------

const createSchema = z.object({
  activitySlot: z.string().min(1).max(160),
  classId: z.string().uuid(),
  title: z.string().trim().min(1, "Add a title.").max(120),
  format: z.enum(["multiple_choice", "true_false"]),
  choiceCount: z.number().int().min(2).max(5),
  assessmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  pointsPerItem: z.number().min(0.25, "Points per item must be at least 0.25.").max(100),
  items: z.array(keyItemSchema).min(1, "Add at least one item.").max(100),
});

export async function createAssessmentAction(input: unknown): Promise<{ ok: true; id: string } | Fail> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const v = parsed.data;

  const supabase = await createClient();
  if (!(await currentUser(supabase))) return fail("Please sign in again.");

  const allowed = choicesFor(v.format, v.choiceCount);
  const problem = keyProblem(v.items, allowed);
  if (problem) return fail(problem);

  const pointsFor = (item: KeyItemInput) => item.points ?? v.pointsPerItem;
  const totalPoints = Math.round(v.items.reduce((sum, item) => sum + pointsFor(item), 0) * 100) / 100;

  const { data: cls } = await supabase.from("classes").select("id").eq("id", v.classId).maybeSingle();
  if (!cls) return fail("Class not found.");

  const destination = await resolveActivitySlot(v.classId, v.activitySlot, supabase);
  if (destination.error) return fail(destination.error);

  const { data: assessment, error } = await supabase
    .from("assessments")
    .insert({
      class_id: v.classId,
      title: v.title,
      activity_slot: destination.slot.title,
      term: destination.slot.term,
      component: destination.slot.component,
      kind: v.format,
      status: "active",
      assessment_date: v.assessmentDate ?? null,
      total_points: totalPoints,
      answer_key: { choiceCount: v.choiceCount, pointsPerItem: v.pointsPerItem },
    })
    .select("id")
    .single();
  if (error || !assessment) return fail(error?.code === "23505" ? "That activity was just assigned. Choose another activity." : "Could not create the assessment.");

  const { data: itemRows, error: itemError } = await supabase
    .from("assessment_items")
    .insert(
      v.items.map((i) => ({
        assessment_id: assessment.id,
        item_number: i.itemNumber,
        item_type: v.format,
        expected_answer: { answer: i.answer },
        max_points: pointsFor(i),
      })),
    )
    .select("id,item_number");
  if (itemError || !itemRows) {
    await supabase.from("assessments").delete().eq("id", assessment.id);
    return fail("Could not save the answer key.");
  }

  const linkError = await linkCompetencies(supabase, v.classId, itemRows, v.items);
  if (linkError) {
    await supabase.from("assessments").delete().eq("id", assessment.id);
    return fail("Could not link competencies.");
  }

  revalidatePath("/check");
  return { ok: true, id: assessment.id };
}

// ---------- confirm one answer sheet ----------

const confirmSchema = z.object({
  assessmentId: z.string().uuid(),
  learnerId: z.string().uuid(),
  imagePath: z.string().max(400).nullable(),
  mode: z.enum(["scan", "manual"]),
  entries: z
    .array(
      z.object({
        itemNumber: z.number().int().min(1).max(100),
        extracted: z.string().max(5).nullable(),
        confidence: z.number().min(0).max(1).nullable(),
        issue: z.string().max(40).nullable(),
        flagged: z.boolean(),
        resolved: z.boolean(),
        final: z.string().max(5),
      }),
    )
    .min(1)
    .max(100),
});

type ItemRow = { id: string; item_number: number; expected_answer: unknown; max_points: number | string };

function toScorable(rows: ItemRow[]): ScorableItem[] {
  return rows
    .map((r) => ({
      id: r.id,
      itemNumber: r.item_number,
      expected: answerOf(r.expected_answer),
      points: Number(r.max_points),
    }))
    .sort((a, b) => a.itemNumber - b.itemNumber);
}

export async function confirmSubmissionAction(
  input: unknown,
): Promise<{ ok: true; score: number; maxScore: number; percent: number } | Fail> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return fail("Something is missing from this sheet.");
  const v = parsed.data;

  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return fail("Please sign in again.");

  const { data: assessment } = await supabase
    .from("assessments")
    .select("id,class_id,kind,answer_key")
    .eq("id", v.assessmentId)
    .maybeSingle();
  if (!assessment) return fail("Assessment not found.");

  if (v.imagePath && !v.imagePath.startsWith(`${user.id}/${assessment.class_id}/${assessment.id}/`)) {
    return fail("That photo does not belong to this assessment.");
  }

  const { data: itemRows } = await supabase
    .from("assessment_items")
    .select("id,item_number,expected_answer,max_points")
    .eq("assessment_id", assessment.id);
  const items = toScorable((itemRows ?? []) as ItemRow[]);
  if (!items.length) return fail("This assessment has no answer key.");

  const allowed = choicesFor(formatOf(assessment.kind), choiceCountOf(assessment.answer_key));
  const byNumber = new Map(v.entries.map((e) => [e.itemNumber, e]));
  if (byNumber.size !== items.length || items.some((i) => !byNumber.has(i.itemNumber))) {
    return fail("The sheet does not match this answer key.");
  }

  const finals: Record<number, string> = {};
  for (const e of v.entries) {
    if (e.flagged && !e.resolved) return fail(`Item ${e.itemNumber} still needs your review.`);
    const final = e.final.trim().toUpperCase();
    if (final !== "" && !allowed.includes(final)) return fail(`Item ${e.itemNumber}: "${e.final}" is not a valid answer.`);
    finals[e.itemNumber] = final;
  }

  const result = scoreAnswers(items, finals);
  const manual = v.mode === "manual";

  const answers = result.results.map((r) => {
    const e = byNumber.get(r.itemNumber);
    return {
      assessment_item_id: r.itemId,
      extracted_answer: manual ? null : { answer: e?.extracted ?? null, issue: e?.issue ?? "none" },
      extraction_confidence: manual ? null : e?.confidence ?? null,
      teacher_final_answer: { answer: r.given },
      is_correct: r.isCorrect,
      points_awarded: r.pointsAwarded,
      needs_review: e?.flagged ?? false,
    };
  });

  const { error } = await supabase.rpc("save_checked_submission", {
    p_assessment_id: assessment.id,
    p_learner_id: v.learnerId,
    p_source_image_path: v.imagePath,
    p_score: result.score,
    p_max_score: result.maxScore,
    p_answers: answers,
  });
  if (error) {
    console.error("save_checked_submission", error.message);
    return fail(error.code === "42501" ? "That learner is not in this class." : "Could not save the score. Try again.");
  }

  revalidatePath("/check");
  revalidatePath(`/check/${assessment.id}`);
  return { ok: true, score: result.score, maxScore: result.maxScore, percent: result.percent };
}

// ---------- edit key (re-scores confirmed sheets) ----------

const updateKeySchema = z.object({
  assessmentId: z.string().uuid(),
  items: z.array(keyItemSchema).min(1).max(100),
});

async function rescoreAssessment(supabase: Supabase, assessmentId: string): Promise<number> {
  const { data: itemRows } = await supabase
    .from("assessment_items")
    .select("id,item_number,expected_answer,max_points")
    .eq("assessment_id", assessmentId);
  const items = toScorable((itemRows ?? []) as ItemRow[]);
  const numberById = new Map(items.map((i) => [i.id, i.itemNumber]));

  const { data: subs } = await supabase
    .from("submissions")
    .select(
      "learner_id,submission_answers(assessment_item_id,extracted_answer,extraction_confidence,teacher_final_answer,needs_review)",
    )
    .eq("assessment_id", assessmentId);

  type Sub = {
    learner_id: string;
    submission_answers: {
      assessment_item_id: string;
      extracted_answer: unknown;
      extraction_confidence: number | null;
      teacher_final_answer: unknown;
      needs_review: boolean;
    }[];
  };

  let done = 0;
  for (const sub of (subs ?? []) as Sub[]) {
    const finals: Record<number, string> = {};
    for (const a of sub.submission_answers) {
      const n = numberById.get(a.assessment_item_id);
      if (n !== undefined) finals[n] = answerOf(a.teacher_final_answer);
    }
    const result = scoreAnswers(items, finals);
    const byItem = new Map(sub.submission_answers.map((a) => [a.assessment_item_id, a]));
    const answers = result.results.map((r) => {
      const old = byItem.get(r.itemId);
      return {
        assessment_item_id: r.itemId,
        extracted_answer: old?.extracted_answer ?? null,
        extraction_confidence: old?.extraction_confidence ?? null,
        teacher_final_answer: { answer: r.given },
        is_correct: r.isCorrect,
        points_awarded: r.pointsAwarded,
        needs_review: old?.needs_review ?? false,
      };
    });
    const { error } = await supabase.rpc("save_checked_submission", {
      p_assessment_id: assessmentId,
      p_learner_id: sub.learner_id,
      p_source_image_path: null,
      p_score: result.score,
      p_max_score: result.maxScore,
      p_answers: answers,
    });
    if (!error) done += 1;
  }
  return done;
}

export async function updateAnswerKeyAction(input: unknown): Promise<{ ok: true; rescored: number } | Fail> {
  const parsed = updateKeySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the answer key.");
  const v = parsed.data;

  const supabase = await createClient();
  if (!(await currentUser(supabase))) return fail("Please sign in again.");

  const { data: assessment } = await supabase
    .from("assessments")
    .select("id,class_id,kind,answer_key")
    .eq("id", v.assessmentId)
    .maybeSingle();
  if (!assessment) return fail("Assessment not found.");

  const { data: itemRows } = await supabase
    .from("assessment_items")
    .select("id,item_number")
    .eq("assessment_id", assessment.id);
  const rows = (itemRows ?? []) as { id: string; item_number: number }[];

  const allowed = choicesFor(formatOf(assessment.kind), choiceCountOf(assessment.answer_key));
  const problem = keyProblem(v.items, allowed);
  if (problem) return fail(problem);

  // First-time key: the assessment has no items yet, so create them now.
  if (rows.length === 0) {
    const defaultPoints = Number((assessment.answer_key as { pointsPerItem?: number } | null)?.pointsPerItem ?? 1);
    const pointsFor = (item: KeyItemInput) => item.points ?? defaultPoints;
    const { data: created, error: createError } = await supabase
      .from("assessment_items")
      .insert(
        v.items.map((i) => ({
          assessment_id: assessment.id,
          item_number: i.itemNumber,
          item_type: formatOf(assessment.kind),
          expected_answer: { answer: i.answer },
          max_points: pointsFor(i),
        })),
      )
      .select("id,item_number");
    if (createError || !created) return fail("Could not save the answer key.");

    await supabase
      .from("assessments")
      .update({ total_points: Math.round(v.items.reduce((sum, item) => sum + pointsFor(item), 0) * 100) / 100 })
      .eq("id", assessment.id);

    const firstLinkError = await linkCompetencies(supabase, assessment.class_id, created, v.items);
    if (firstLinkError) return fail("Key saved, but competencies could not be linked.");

    // Nothing to re-score: no sheet was ever checked against these items.
    revalidatePath("/check");
    revalidatePath(`/check/${assessment.id}`);
    revalidatePath(`/check/${assessment.id}/score`);
    return { ok: true, rescored: 0 };
  }

  if (rows.length !== v.items.length) return fail("The number of items cannot change after creating an assessment.");

  const { error } = await supabase.from("assessment_items").upsert(
    v.items.map((i) => ({
      assessment_id: assessment.id,
      item_number: i.itemNumber,
      expected_answer: { answer: i.answer },
      max_points: i.points,
    })),
    { onConflict: "assessment_id,item_number" },
  );
  if (error) return fail("Could not save the answer key.");

  const totalPoints = Math.round(v.items.reduce((sum, item) => sum + (item.points ?? 1), 0) * 100) / 100;
  const { error: totalError } = await supabase.from("assessments").update({ total_points: totalPoints }).eq("id", assessment.id);
  if (totalError) return fail("Key saved, but total points could not be updated.");

  await supabase
    .from("assessment_competencies")
    .delete()
    .in("assessment_item_id", rows.map((r) => r.id));
  const linkError = await linkCompetencies(supabase, assessment.class_id, rows, v.items);
  if (linkError) return fail("Key saved, but competencies could not be linked.");

  const rescored = await rescoreAssessment(supabase, assessment.id);
  revalidatePath("/check");
  revalidatePath(`/check/${assessment.id}`);
  return { ok: true, rescored };
}

// ---------- remove / status / delete ----------

export async function deleteSubmissionAction(input: {
  assessmentId: string;
  learnerId: string;
}): Promise<{ ok: true } | Fail> {
  const ids = z.object({ assessmentId: z.string().uuid(), learnerId: z.string().uuid() }).safeParse(input);
  if (!ids.success) return fail("Invalid request.");

  const supabase = await createClient();
  if (!(await currentUser(supabase))) return fail("Please sign in again.");

  const { data: sub } = await supabase
    .from("submissions")
    .select("id,source_image_path")
    .eq("assessment_id", ids.data.assessmentId)
    .eq("learner_id", ids.data.learnerId)
    .maybeSingle();
  if (!sub) return { ok: true };

  const { error } = await supabase.from("submissions").delete().eq("id", sub.id);
  if (error) return fail("Could not remove the score.");
  if (sub.source_image_path) await supabase.storage.from("assessment-images").remove([sub.source_image_path]);

  revalidatePath("/check");
  revalidatePath(`/check/${ids.data.assessmentId}`);
  return { ok: true };
}

export async function setAssessmentStatusAction(input: {
  assessmentId: string;
  status: "active" | "closed";
}): Promise<{ ok: true } | Fail> {
  const v = z
    .object({ assessmentId: z.string().uuid(), status: z.enum(["active", "closed"]) })
    .safeParse(input);
  if (!v.success) return fail("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.from("assessments").update({ status: v.data.status }).eq("id", v.data.assessmentId);
  if (error) return fail("Could not change the status.");
  revalidatePath("/check");
  revalidatePath(`/check/${v.data.assessmentId}`);
  return { ok: true };
}

export async function deleteAssessmentAction(input: { assessmentId: string }): Promise<{ ok: true } | Fail> {
  const v = z.object({ assessmentId: z.string().uuid() }).safeParse(input);
  if (!v.success) return fail("Invalid request.");
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return fail("Please sign in again.");

  const { data: assessment } = await supabase
    .from("assessments")
    .select("id,class_id")
    .eq("id", v.data.assessmentId)
    .maybeSingle();
  if (!assessment) return { ok: true };

  // Remove every stored photo, including ones never confirmed.
  const folder = `${user.id}/${assessment.class_id}/${assessment.id}`;
  const { data: files } = await supabase.storage.from("assessment-images").list(folder, { limit: 1000 });
  if (files?.length) {
    await supabase.storage.from("assessment-images").remove(files.map((f) => `${folder}/${f.name}`));
  }

  const { error } = await supabase.from("assessments").delete().eq("id", assessment.id);
  if (error) return fail("Could not delete the assessment.");
  revalidatePath("/check");
  return { ok: true };
}