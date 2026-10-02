// src/features/learners/actions.ts

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function addLearner(formData: FormData) {
  const classId = text(formData, "classId");
  const firstName = text(formData, "firstName");
  const lastName = text(formData, "lastName");

  const back = `/classes/${classId}`;
  const fail = (message: string) => redirect(`${back}?error=${encodeURIComponent(message)}`);

  if (!classId) redirect("/classes");
  if (!firstName || !lastName) fail("Enter the student's first and last name.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("You are signed out. Please sign in again.");

  // RLS only lets teachers add learners to classes they own.
  const { data: learner, error: learnerError } = await supabase
    .from("learners")
    .insert({
      teacher_id: user!.id,
      first_name: firstName,
      last_name: lastName,
      display_name: `${firstName} ${lastName}`,
    })
    .select("id")
    .single();
  if (learnerError || !learner) fail("Could not add the student. Please try again.");

  const { error: enrollError } = await supabase
    .from("class_enrollments")
    .insert({ class_id: classId, learner_id: learner!.id, status: "active" });

  if (enrollError) {
    // Don't leave an orphan learner behind.
    await supabase.from("learners").delete().eq("id", learner!.id);
    fail("Could not add the student to this class.");
  }

  revalidatePath(back);
  redirect(`${back}?added=${encodeURIComponent(`${firstName} ${lastName}`)}`);
}

export async function deleteLearner(formData: FormData) {
  const classId = text(formData, "classId");
  const learnerId = text(formData, "learnerId");
  const name = text(formData, "name");

  const back = `/classes/${classId}`;
  const fail = (message: string) => redirect(`${back}?error=${encodeURIComponent(message)}`);

  if (!classId || !learnerId) redirect("/classes");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("You are signed out. Please sign in again.");

  // Is this student enrolled in any other class?
  const { count: otherClasses } = await supabase
    .from("class_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("learner_id", learnerId)
    .neq("class_id", classId);

  if ((otherClasses ?? 0) > 0) {
    // Keep the learner, only take them out of this class.
    await supabase.from("attendance_entries").delete().eq("class_id", classId).eq("learner_id", learnerId);
    const { error } = await supabase
      .from("class_enrollments")
      .delete()
      .eq("class_id", classId)
      .eq("learner_id", learnerId);
    if (error) fail("Could not remove the student. Please try again.");
  } else {
    // Only in this class: delete the learner. Their enrollment, scores
    // and attendance are removed automatically (on delete cascade).
    const { error } = await supabase
      .from("learners")
      .delete()
      .eq("id", learnerId)
      .eq("teacher_id", user!.id);
    if (error) fail("Could not delete the student. Please try again.");
  }

  revalidatePath(back);
  redirect(`${back}?removed=${encodeURIComponent(name || "Student")}`);
}