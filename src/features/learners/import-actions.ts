// src/features/learners/import-actions.ts

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { nameKey } from "@/lib/excel/roster";

const InputSchema = z.object({
  classId: z.string().uuid(),
  rows: z
    .array(
      z.object({
        firstName: z.string().trim().min(1).max(120),
        lastName: z.string().trim().min(1).max(120),
        lrn: z.string().trim().max(30).default(""),
      }),
    )
    .min(1)
    .max(500),
});

export type ImportLearnersResult =
  | { ok: true; added: number; skipped: number }
  | { ok: false; error: string };

/**
 * Saves the learners the teacher confirmed on the import screen and enrolls
 * them in the class. Students already in the class (same LRN, or same name)
 * are skipped, so importing the same file twice never creates duplicates.
 */
export async function importLearners(input: z.input<typeof InputSchema>): Promise<ImportLearnersResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Some names are missing or too long. Please check the list." };
  }
  const { classId, rows } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are signed out. Please sign in again." };

  // RLS only returns classes this teacher owns.
  const { data: classroom } = await supabase.from("classes").select("id").eq("id", classId).maybeSingle();
  if (!classroom) return { ok: false, error: "Class not found." };

  const { data: existing, error: existingError } = await supabase
    .from("class_enrollments")
    .select("learner:learners(first_name,last_name,external_ref)")
    .eq("class_id", classId)
    .limit(2000);
  if (existingError) return { ok: false, error: "Could not check the current class list. Please try again." };

  const seenNames = new Set<string>();
  const seenLrns = new Set<string>();
  for (const e of existing ?? []) {
    const l = Array.isArray(e.learner) ? e.learner[0] : e.learner;
    if (!l) continue;
    if (l.first_name && l.last_name) seenNames.add(nameKey(l.first_name as string, l.last_name as string));
    if (l.external_ref) seenLrns.add(String(l.external_ref));
  }

  const fresh: typeof rows = [];
  for (const row of rows) {
    const key = nameKey(row.firstName, row.lastName);
    if ((row.lrn && seenLrns.has(row.lrn)) || seenNames.has(key)) continue;
    seenNames.add(key);
    if (row.lrn) seenLrns.add(row.lrn);
    fresh.push(row);
  }
  const skipped = rows.length - fresh.length;
  if (fresh.length === 0) return { ok: true, added: 0, skipped };

  const { data: created, error: learnerError } = await supabase
    .from("learners")
    .insert(
      fresh.map((r) => ({
        teacher_id: user.id,
        first_name: r.firstName,
        last_name: r.lastName,
        display_name: `${r.firstName} ${r.lastName}`,
        external_ref: r.lrn || null,
      })),
    )
    .select("id");
  if (learnerError || !created) return { ok: false, error: "Could not save the students. Please try again." };

  const ids = created.map((l) => l.id as string);
  const { error: enrollError } = await supabase
    .from("class_enrollments")
    .insert(ids.map((id) => ({ class_id: classId, learner_id: id, status: "active" })));

  if (enrollError) {
    // All or nothing: don't leave learners behind that are not in the class.
    await supabase.from("learners").delete().in("id", ids);
    return { ok: false, error: "Could not add the students to this class. Nothing was saved." };
  }

  revalidatePath(`/classes/${classId}`);
  revalidatePath("/classes");
  return { ok: true, added: ids.length, skipped };
}