// src/features/classes/actions.ts

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const ClassSchema = z.object({
  requestId: z.uuid(),
  name: z.string().trim().min(2).max(120),
  subject: z.string().trim().min(2).max(120),
  schoolYear: z.string().trim().min(4).max(30),
  gradeLevel: z.string().trim().min(1).max(50),
});

export async function createClass(formData: FormData) {
  const parsed = ClassSchema.safeParse({
    requestId: formData.get("requestId"),
    name: formData.get("name"),
    subject: formData.get("subject"),
    schoolYear: formData.get("schoolYear"),
    gradeLevel: formData.get("gradeLevel"),
  });
  if (!parsed.success) return { error: "Please check the class details." };

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
    id: parsed.data.requestId,
    teacher_id: user.id,
    name: parsed.data.name,
    subject: parsed.data.subject,
    school_year: parsed.data.schoolYear,
    grade_level: parsed.data.gradeLevel,
    benchmark: profile?.default_benchmark ?? 75,
  }).select("id").single();

  if (error) {
    // The primary key serializes concurrent retries of this form submission.
    // Never update an existing class, and only return a class owned by this teacher.
    if (error.code === "23505") {
      const { data: existing } = await supabase.from("classes")
        .select("id").eq("id", parsed.data.requestId).eq("teacher_id", user.id).maybeSingle();
      if (existing) {
        revalidatePath("/classes");
        return { id: existing.id as string };
      }
    }
    return { error: "Could not create the class. Please try again." };
  }
  revalidatePath("/classes");
  return { id: data.id as string };
}
