// src/features/classes/actions.ts

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const ClassSchema = z.object({
  name: z.string().trim().min(2).max(120),
  subject: z.string().trim().min(2).max(120),
  schoolYear: z.string().trim().min(4).max(30),
  gradeLevel: z.string().trim().min(1).max(50),
});

export async function createClass(formData: FormData) {
  const parsed = ClassSchema.safeParse({
    name: formData.get("name"),
    subject: formData.get("subject"),
    schoolYear: formData.get("schoolYear"),
    gradeLevel: formData.get("gradeLevel"),
  });
  if (!parsed.success) redirect("/classes/new?error=Please+check+the+class+details");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // New classes start with the benchmark the teacher chose in Settings.
  const { data: profile } = await supabase
    .from("profiles")
    .select("default_benchmark")
    .eq("id", user.id)
    .maybeSingle();

  const { data, error } = await supabase.from("classes").insert({
    teacher_id: user.id,
    name: parsed.data.name,
    subject: parsed.data.subject,
    school_year: parsed.data.schoolYear,
    grade_level: parsed.data.gradeLevel,
    benchmark: profile?.default_benchmark ?? 75,
  }).select("id").single();

  if (error) redirect(`/classes/new?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/classes");
  redirect(`/classes/${data.id}`);
}