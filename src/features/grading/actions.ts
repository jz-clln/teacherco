"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type GradingSettingsState = { error?: string; success?: string };

const weightsSchema = z.object({
  written_work: z.number().min(0).max(1),
  performance_task: z.number().min(0).max(1),
  assessment: z.number().min(0).max(1),
});
const transmutationSchema = z.array(z.object({ min: z.number().min(0).max(100), grade: z.number().min(0).max(100) })).min(2).max(101);
const descriptorSchema = z.array(z.object({ min: z.number().min(0).max(100), label: z.string().trim().min(1).max(80) })).min(1).max(20);

function parseJson<T>(value: FormDataEntryValue | null, schema: z.ZodType<T>): T | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = schema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function strictlyAscending(values: number[]) {
  return values.every((value, index) => index === 0 || value > values[index - 1]!);
}

export async function saveGradingConfig(_previous: GradingSettingsState, formData: FormData): Promise<GradingSettingsState> {
  const classId = z.string().uuid().safeParse(formData.get("classId"));
  const weights = parseJson(formData.get("weights"), weightsSchema);
  const transmutationInput = parseJson(formData.get("transmutation"), transmutationSchema);
  const descriptors = parseJson(formData.get("descriptors"), descriptorSchema);
  if (!classId.success || !weights || !transmutationInput || !descriptors) {
    return { error: "Check the weights, transmutation bands, and descriptors." };
  }
  if (Math.abs(Object.values(weights).reduce((sum, value) => sum + value, 0) - 1) > 0.001) {
    return { error: "Component weights must total 100%." };
  }
  if (transmutationInput[0]?.min !== 0 || !strictlyAscending(transmutationInput.map((row) => row.min))) {
    return { error: "Transmutation bands must start at 0 and have increasing minimum grades." };
  }
  if (descriptors[0]?.min !== 0 || !strictlyAscending(descriptors.map((row) => row.min))) {
    return { error: "Descriptor bands must start at 0 and have increasing minimum grades." };
  }

  const transmutation = transmutationInput.map((row, index) => ({
    ...row,
    max: transmutationInput[index + 1] ? Math.round((transmutationInput[index + 1]!.min - 0.01) * 100) / 100 : 100,
  }));

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const { data: classroom } = await supabase.from("classes").select("id").eq("id", classId.data).eq("teacher_id", user.id).maybeSingle();
  if (!classroom) return { error: "That classroom isn’t available." };

  const { data: existing } = await supabase
    .from("class_grading_config")
    .select("weights,transmutation,descriptors,term_possible,source_filename,verified")
    .eq("class_id", classId.data)
    .maybeSingle();

  const { error } = await supabase.from("class_grading_config").upsert({
    class_id: classId.data,
    weights,
    transmutation,
    descriptors,
    term_possible: existing?.term_possible ?? {},
    source_filename: null,
    verified: false,
  });
  if (error) return { error: "TeacherCo could not save these grading rules." };

  revalidatePath("/settings");
  revalidatePath(`/classes/${classId.data}`);
  revalidatePath(`/classes/${classId.data}/term-grades`);
  return { success: "Grading rules saved for this class." };
}