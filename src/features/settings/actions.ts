// src/features/settings/actions.ts

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type SettingsState = {
  error?: string;
  success?: string;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

const ALL_BUCKETS = ["teacher-records", "assessment-images", "generated-reports"];
const UPLOAD_BUCKETS = ["teacher-records", "assessment-images"];

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

async function saveProfile(values: Record<string, unknown>, success: string): Promise<SettingsState> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("profiles").update(values).eq("id", user.id);
  if (error) return { error: "TeacherCo could not save your settings. Please try again." };
  revalidatePath("/", "layout");
  return { success };
}

// Storage paths are {teacher_id}/{class_id}/..., so removing a prefix removes a class or a teacher.
async function listFiles(supabase: Supabase, bucket: string, prefix: string) {
  const files: string[] = [];
  const folders = [prefix];

  while (folders.length > 0) {
    const folder = folders.pop()!;
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 100, offset });
      if (error) throw error;
      for (const entry of data) {
        const path = `${folder}/${entry.name}`;
        if (entry.id) files.push(path);
        else folders.push(path);
      }
      if (data.length < 100) break;
    }
  }

  return files;
}

async function removeFiles(supabase: Supabase, buckets: string[], prefix: string) {
  try {
    for (const bucket of buckets) {
      const files = await listFiles(supabase, bucket, prefix);
      for (let i = 0; i < files.length; i += 100) {
        const { error } = await supabase.storage.from(bucket).remove(files.slice(i, i + 100));
        if (error) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

const ProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  preferredName: z.string().trim().min(1).max(80),
  schoolType: z.enum(["public", "private"]),
  schoolName: z.string().trim().max(160),
  gradeBands: z.array(z.enum(["elementary", "jhs", "shs"])).min(1),
});

export async function updateProfile(_previousState: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = ProfileSchema.safeParse({
    fullName: formData.get("fullName"),
    preferredName: formData.get("preferredName"),
    schoolType: formData.get("schoolType"),
    schoolName: formData.get("schoolName") ?? "",
    gradeBands: formData.getAll("gradeBands"),
  });
  if (!parsed.success) {
    return { error: "Please enter your name, choose a school type, and pick at least one teaching level." };
  }

  return saveProfile(
    {
      full_name: parsed.data.fullName,
      preferred_name: parsed.data.preferredName,
      school_type: parsed.data.schoolType,
      school_name: parsed.data.schoolName || null,
      grade_bands: parsed.data.gradeBands,
    },
    "Profile saved.",
  );
}

const LanguageSchema = z.object({
  preferredLanguage: z.enum(["en", "fil"]),
  aiReplyLanguage: z.enum(["auto", "en", "fil"]),
});

export async function updateLanguage(_previousState: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = LanguageSchema.safeParse({
    preferredLanguage: formData.get("preferredLanguage"),
    aiReplyLanguage: formData.get("aiReplyLanguage"),
  });
  if (!parsed.success) return { error: "Please choose a valid language." };

  return saveProfile(
    { preferred_language: parsed.data.preferredLanguage, ai_reply_language: parsed.data.aiReplyLanguage },
    "Language saved.",
  );
}

const AttentionSchema = z.object({
  benchmark: z.coerce.number().min(1).max(100),
  absenceThreshold: z.coerce.number().int().min(1).max(100),
  missingWorkThreshold: z.coerce.number().int().min(1).max(100),
  dropThreshold: z.coerce.number().min(1).max(100),
});

export async function updateAttentionDefaults(
  _previousState: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = AttentionSchema.safeParse({
    benchmark: formData.get("benchmark"),
    absenceThreshold: formData.get("absenceThreshold"),
    missingWorkThreshold: formData.get("missingWorkThreshold"),
    dropThreshold: formData.get("dropThreshold"),
  });
  if (!parsed.success) return { error: "Please enter numbers between 1 and 100 for every rule." };

  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("profiles")
    .update({
      default_benchmark: parsed.data.benchmark,
      absence_threshold: parsed.data.absenceThreshold,
      missing_work_threshold: parsed.data.missingWorkThreshold,
      performance_drop_threshold: parsed.data.dropThreshold,
    })
    .eq("id", user.id);
  if (error) return { error: "TeacherCo could not save your attention rules. Please try again." };

  const applyToClasses = formData.get("applyToClasses") === "on";
  if (applyToClasses) {
    const { error: classError } = await supabase
      .from("classes")
      .update({ benchmark: parsed.data.benchmark })
      .eq("teacher_id", user.id);
    if (classError) return { error: "Your defaults were saved, but your existing classes could not be updated." };
  }

  revalidatePath("/", "layout");
  return { success: applyToClasses ? "Saved and applied the benchmark to your classes." : "Attention rules saved." };
}

export async function updateAiPrivacy(_previousState: SettingsState, formData: FormData): Promise<SettingsState> {
  return saveProfile(
    {
      ai_enabled: formData.get("aiEnabled") === "on",
      ai_include_notes: formData.get("aiIncludeNotes") === "on",
    },
    "AI and privacy settings saved.",
  );
}

const RetentionSchema = z.enum(["keep", "delete_after_processing"]);

export async function updateRetention(_previousState: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = RetentionSchema.safeParse(formData.get("retentionMode"));
  if (!parsed.success) return { error: "Please choose what happens to your original files." };
  return saveProfile({ default_retention_mode: parsed.data }, "File retention saved.");
}

const PasswordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters.").max(72, "Use 72 characters or fewer."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "The two passwords do not match.",
    path: ["confirmPassword"],
  });

export async function changePassword(_previousState: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = PasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check your new password." };

  const { supabase } = await requireUser();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };
  return { success: "Password updated." };
}

// Destructive actions are called directly from the client (not through useActionState)
// so the client can clear the offline cache after a successful delete.

export async function deleteClass(formData: FormData): Promise<SettingsState> {
  const classId = z.string().uuid().safeParse(formData.get("classId"));
  if (!classId.success) return { error: "That class could not be found." };

  const { supabase, user } = await requireUser();

  const { data: teacherClass } = await supabase
    .from("classes")
    .select("id, name")
    .eq("id", classId.data)
    .eq("teacher_id", user.id)
    .maybeSingle();
  if (!teacherClass) return { error: "That class could not be found." };

  if (String(formData.get("confirmation") ?? "").trim() !== teacherClass.name) {
    return { error: "Type the class name exactly to confirm." };
  }

  const { data: enrollments } = await supabase
    .from("class_enrollments")
    .select("learner_id")
    .eq("class_id", teacherClass.id);
  const learnerIds = [...new Set((enrollments ?? []).map((row) => row.learner_id as string))];

  if (!(await removeFiles(supabase, ALL_BUCKETS, `${user.id}/${teacherClass.id}`))) {
    return { error: "TeacherCo could not remove this class's stored files, so nothing was deleted. Please try again." };
  }

  const { error } = await supabase.from("classes").delete().eq("id", teacherClass.id);
  if (error) return { error: "TeacherCo could not delete this class. Please try again." };

  // Learners belong to the teacher, not the class. Remove the ones that are no longer in any class.
  if (learnerIds.length > 0) {
    const { data: stillEnrolled } = await supabase
      .from("class_enrollments")
      .select("learner_id")
      .in("learner_id", learnerIds);
    const keep = new Set((stillEnrolled ?? []).map((row) => row.learner_id as string));
    const orphaned = learnerIds.filter((id) => !keep.has(id));
    if (orphaned.length > 0) {
      await supabase.from("learners").delete().in("id", orphaned).eq("teacher_id", user.id);
    }
  }

  revalidatePath("/", "layout");
  return { success: `${teacherClass.name} and all of its records were permanently deleted.` };
}

export async function removeStoredFiles(): Promise<SettingsState> {
  const { supabase, user } = await requireUser();

  if (!(await removeFiles(supabase, UPLOAD_BUCKETS, user.id))) {
    return { error: "TeacherCo could not remove all of your stored files. Please try again." };
  }

  // RLS limits both updates to this teacher's rows.
  await supabase.from("record_imports").update({ storage_path: null }).eq("teacher_id", user.id).not("storage_path", "is", null);
  await supabase.from("submissions").update({ source_image_path: null }).not("source_image_path", "is", null);

  revalidatePath("/settings");
  return { success: "Your original uploads and answer sheet photos were removed. Imported records are unchanged." };
}

export async function deleteAllData(formData: FormData): Promise<SettingsState> {
  if (String(formData.get("confirmation") ?? "").trim() !== "DELETE") {
    return { error: "Type DELETE to confirm." };
  }

  const { supabase, user } = await requireUser();

  if (!(await removeFiles(supabase, ALL_BUCKETS, user.id))) {
    return { error: "TeacherCo could not remove your stored files, so nothing was deleted. Please try again." };
  }

  // Classes cascade to enrollments, assessments, submissions, attendance, imports, rules and reports.
  const classes = await supabase.from("classes").delete().eq("teacher_id", user.id);
  const learners = await supabase.from("learners").delete().eq("teacher_id", user.id);
  const notes = await supabase.from("teacher_notes").delete().eq("teacher_id", user.id);
  if (classes.error || learners.error || notes.error) {
    return { error: "Some of your data could not be deleted. Please try again." };
  }

  revalidatePath("/", "layout");
  return { success: "All of your classroom data was permanently deleted. Your account and preferences were kept." };
}