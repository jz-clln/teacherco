// src/features/classes/details-actions.ts

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { validateLinkedSection } from "@/features/sections/context";

const InputSchema = z.object({
  classId: z.string().uuid(),
  name: z.string().trim().min(2, "Class name is too short.").max(120),
  schoolName: z.string().trim().max(160),
  schoolId: z.string().trim().max(30),
  adviser: z.string().trim().max(120),
  gradeLevel: z.string().trim().min(1, "Choose a grade level.").max(50),
  section: z.string().trim().max(80),
  subject: z.string().trim().min(2, "Subject is too short.").max(120),
  schoolYear: z.string().trim().min(4, "School year is too short.").max(30),
  benchmark: z.number().min(1).max(100),
});

export type UpdateClassDetailsResult = { ok: true } | { ok: false; error: string };

/** Saves the class details. RLS only lets a teacher update classes they own. */
export async function updateClassDetails(input: z.input<typeof InputSchema>): Promise<UpdateClassDetailsResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the class details." };
  const d = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are signed out. Please sign in again." };

  const conflict = await validateLinkedSection(supabase, user.id, d.classId, d);
  if (conflict) return { ok: false, error: conflict };

  const { data, error } = await supabase
    .from("classes")
    .update({
      name: d.name,
      school_name: d.schoolName || null,
      school_id: d.schoolId || null,
      adviser: d.adviser || null,
      grade_level: d.gradeLevel,
      section: d.section || null,
      subject: d.subject,
      school_year: d.schoolYear,
      benchmark: d.benchmark,
    })
    .eq("id", d.classId)
    .select("id");

  if (error) return { ok: false, error: error.code === "23514"
    ? "These details conflict with the linked Section. Check the grade, school year and school ID, then try again."
    : "Could not save the class details. Refresh and try again." };
  if (!data?.length) return { ok: false, error: "Class not found." };

  revalidatePath(`/classes/${d.classId}`);
  revalidatePath("/classes");
  return { ok: true };
}
