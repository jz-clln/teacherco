"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAccess } from "@/lib/auth/access-guard";

export type OnboardingState = {
  error?: string;
};

const OnboardingSchema = z.object({
  preferredName: z.string().trim().min(1).max(80),
  schoolType: z.enum(["public", "private"]),
  schoolName: z.string().trim().max(160),
  preferredLanguage: z.enum(["en", "fil"]),
  gradeBands: z.array(z.enum(["elementary", "jhs", "shs"])).min(1),
  createFirstClass: z.boolean(),
  className: z.string().trim().max(120),
  subject: z.string().trim().max(120),
  gradeLevel: z.string().trim().max(50),
  schoolYear: z.string().trim().max(30),
});

export async function completeOnboarding(
  _previousState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = OnboardingSchema.safeParse({
    preferredName: formData.get("preferredName"),
    schoolType: formData.get("schoolType"),
    schoolName: formData.get("schoolName") ?? "",
    preferredLanguage: formData.get("preferredLanguage"),
    gradeBands: formData.getAll("gradeBands"),
    createFirstClass: formData.get("createFirstClass") === "true",
    className: formData.get("className") ?? "",
    subject: formData.get("subject") ?? "",
    gradeLevel: formData.get("gradeLevel") ?? "",
    schoolYear: formData.get("schoolYear") ?? "",
  });

  if (!parsed.success) {
    return { error: "Please check the highlighted onboarding details and try again." };
  }

  if (
    parsed.data.createFirstClass &&
    (!parsed.data.className || !parsed.data.subject || !parsed.data.gradeLevel || !parsed.data.schoolYear)
  ) {
    return { error: "Please complete your first class details, or choose to create the class later." };
  }

  const { supabase, user } = await requireAccess();

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      preferred_name: parsed.data.preferredName,
      school_type: parsed.data.schoolType,
      school_name: parsed.data.schoolName || null,
      preferred_language: parsed.data.preferredLanguage,
      grade_bands: parsed.data.gradeBands,
    })
    .eq("id", user.id);

  if (profileError) {
    return { error: "TeacherCo could not save your teaching profile. Please try again." };
  }

  let classId: string | null = null;

  if (parsed.data.createFirstClass) {
    const { data: createdClass, error: classError } = await supabase
      .from("classes")
      .insert({
        teacher_id: user.id,
        name: parsed.data.className,
        subject: parsed.data.subject,
        grade_level: parsed.data.gradeLevel,
        school_year: parsed.data.schoolYear,
      })
      .select("id")
      .single();

    if (classError) {
      return { error: "Your teaching profile was saved, but we could not create the first class yet." };
    }

    classId = createdClass.id;
  }

  const { error: completedError } = await supabase
    .from("profiles")
    .update({
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (completedError) {
    return { error: "We could not finish onboarding. Please try again." };
  }

  if (classId) {
    redirect(`/classes/${classId}/records?welcome=1`);
  }

  redirect("/today");
}
