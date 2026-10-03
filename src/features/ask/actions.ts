"use server";

import { z } from "zod";
import { answerQuestion, type AskAnswer, type AskContext } from "./engine";
import { loadAskClass } from "./queries";
import { createClient } from "@/lib/supabase/server";

const askSchema = z.object({
  classId: z.union([z.literal("all"), z.string().uuid()]),
  question: z.string().trim().min(1).max(500),
  context: z.object({
    learnerIds: z.array(z.string().uuid()).max(500).optional(),
    competencyName: z.string().max(100).optional(),
  }).optional(),
});

export type AskActionResult =
  | { ok: true; answer: AskAnswer }
  | { ok: false; error: string };

export async function askTeacherAction(rawInput: unknown): Promise<AskActionResult> {
  const parsed = askSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: "Enter a classroom question (up to 500 characters)." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };

  const [{ data: profile }, { data: classRows, error: classesError }] = await Promise.all([
    supabase.from("profiles").select("absence_threshold,performance_drop_threshold").eq("id", user.id).maybeSingle(),
    (() => {
      let query = supabase.from("classes").select("id,name,subject").eq("status", "active").order("created_at", { ascending: false });
      if (parsed.data.classId !== "all") query = query.eq("id", parsed.data.classId);
      return query;
    })(),
  ]);
  if (classesError) return { ok: false, error: "TeacherCo couldn’t load your classrooms. Please try again." };
  if (parsed.data.classId !== "all" && !classRows?.length) return { ok: false, error: "That classroom isn’t available." };

  const thresholds = {
    absences: Number(profile?.absence_threshold ?? 5),
    dropPoints: Number(profile?.performance_drop_threshold ?? 10),
  };

  try {
    const classes = await Promise.all((classRows ?? []).map((classroom) => loadAskClass(supabase, String(classroom.id), thresholds)));
    const usable = classes.filter((item): item is NonNullable<typeof item> => item !== null);
    const answer = answerQuestion(parsed.data.question, usable, {
      absenceThreshold: thresholds.absences,
      context: parsed.data.context as AskContext | undefined,
    });
    return { ok: true, answer };
  } catch {
    return { ok: false, error: "TeacherCo couldn’t read the classroom evidence. Please try again." };
  }
}