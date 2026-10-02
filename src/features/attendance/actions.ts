// src/features/attendance/actions.ts

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isDateKey, todayInManila } from "./dates";
import { ATTENDANCE_STATUSES } from "./types";

const InputSchema = z.object({
  classId: z.string().uuid(),
  date: z.string().refine(isDateKey, "Choose a valid date."),
  marks: z
    .array(z.object({ learnerId: z.string().uuid(), status: z.enum(ATTENDANCE_STATUSES) }))
    .min(1)
    .max(500),
});

export type SaveAttendanceResult =
  | { ok: true; saved: number; absent: number; late: number; updatedAt: string }
  | { ok: false; error: string };

const CHUNK = 500;

/**
 * Saves one day of attendance for a class. Every learner gets a row, so "present" and
 * "not taken yet" can be told apart. Saving the same day again updates it, never duplicates.
 * Any day in the past can be saved or corrected, no matter how long ago. Only future days are refused.
 * Every save stamps the time, so the page can show when attendance was last updated.
 */
export async function saveAttendance(input: z.input<typeof InputSchema>): Promise<SaveAttendanceResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The attendance could not be read. Please try again." };
  const { classId, date, marks } = parsed.data;

  if (date > todayInManila()) return { ok: false, error: "You can't take attendance for a day that hasn't happened yet." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are signed out. Please sign in again." };

  // RLS only returns classes this teacher owns.
  const { data: classroom } = await supabase.from("classes").select("id").eq("id", classId).maybeSingle();
  if (!classroom) return { ok: false, error: "Class not found." };

  const { data: enrolled, error: enrolledError } = await supabase
    .from("class_enrollments")
    .select("learner_id")
    .eq("class_id", classId)
    .eq("status", "active")
    .limit(2000);
  if (enrolledError) return { ok: false, error: "Could not read the class list. Please try again." };

  const members = new Set((enrolled ?? []).map((e) => String(e.learner_id)));
  const byLearner = new Map<string, (typeof marks)[number]["status"]>();
  for (const m of marks) {
    if (!members.has(m.learnerId)) return { ok: false, error: "A learner is not in this class. Please reload the page." };
    byLearner.set(m.learnerId, m.status);
  }

  // One timestamp for the whole save, so every row of the day shows the same "last updated".
  const updatedAt = new Date().toISOString();

  const rows = [...byLearner].map(([learnerId, status]) => ({
    class_id: classId,
    learner_id: learnerId,
    attendance_date: date,
    status,
    updated_at: updatedAt,
  }));

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from("attendance_entries")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "class_id,learner_id,attendance_date" });
    if (error) return { ok: false, error: "Attendance was not saved. Please try again." };
  }

  revalidatePath(`/classes/${classId}`);
  revalidatePath(`/classes/${classId}/attendance`);
  revalidatePath("/today");
  revalidatePath("/reports");
  return {
    ok: true,
    saved: rows.length,
    absent: rows.filter((r) => r.status === "absent").length,
    late: rows.filter((r) => r.status === "late").length,
    updatedAt,
  };
}