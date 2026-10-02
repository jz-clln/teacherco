// src/features/learners/import-actions.ts

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { nameKey } from "@/lib/excel/roster";
import { logImportEvent } from "@/features/learners/import-history";

// Only names ever reach the server. LRNs stay in the teacher's browser.
const NameSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
});

const ImportSchema = z.object({
  classId: z.string().uuid(),
  rows: z
    .array(
      NameSchema.extend({
        /** Enroll this existing learner instead of creating a new one ("Same learner? Link"). */
        link: z.string().uuid().nullable().optional(),
      }),
    )
    .min(1)
    .max(500),
});

const LookupSchema = z.object({
  classId: z.string().uuid(),
  rows: z.array(NameSchema).min(1).max(500),
});

export type LearnerMatch = { learnerId: string; name: string; classes: string[] };

export type FindMatchesResult =
  | {
      ok: true;
      /** Row index (as a string) -> learners with the same name in the teacher's other classes. */
      matches: Record<string, LearnerMatch[]>;
    }
  | { ok: false; error: string };

export type ImportLearnersResult =
  | { ok: true; added: number; linked: number; skipped: number }
  | { ok: false; error: string };

type ClassEmbed = { name: string } | { name: string }[] | null;

type ClassContext =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; user: { id: string } }
  | { ok: false; error: string };

async function requireClass(classId: string): Promise<ClassContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are signed out. Please sign in again." };

  // RLS only returns classes this teacher owns.
  const { data: classroom } = await supabase.from("classes").select("id").eq("id", classId).maybeSingle();
  if (!classroom) return { ok: false, error: "Class not found." };
  return { ok: true, supabase, user };
}

/**
 * "Same learner?" step. Looks for learners the teacher already has in OTHER classes
 * with the same name, so the teacher can choose Link or Keep separate. Names only.
 * Nothing is changed here.
 */
export async function findSimilarLearners(input: z.input<typeof LookupSchema>): Promise<FindMatchesResult> {
  const parsed = LookupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some names are missing or too long. Please check the list." };
  const { classId, rows } = parsed.data;

  const ctx = await requireClass(classId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const { data, error } = await ctx.supabase
    .from("learners")
    .select("id,first_name,last_name,display_name,class_enrollments(class_id,classes(name))")
    .limit(5000);
  if (error) return { ok: false, error: "Could not check your other classes. Please try again." };

  const rowsByKey = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const key = nameKey(r.firstName, r.lastName);
    rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), i]);
  });

  const matches: Record<string, LearnerMatch[]> = {};
  for (const l of data ?? []) {
    if (!l.first_name || !l.last_name) continue;
    const indexes = rowsByKey.get(nameKey(l.first_name as string, l.last_name as string));
    if (!indexes) continue;

    const enrollments = (l.class_enrollments ?? []) as { class_id: string; classes: ClassEmbed }[];
    if (enrollments.some((e) => e.class_id === classId)) continue; // already in this class
    const classes = enrollments
      .map((e) => (Array.isArray(e.classes) ? e.classes[0]?.name : e.classes?.name))
      .filter((n): n is string => Boolean(n));

    for (const i of indexes) {
      (matches[String(i)] ??= []).push({ learnerId: l.id as string, name: l.display_name as string, classes });
    }
  }
  return { ok: true, matches };
}

/**
 * Saves the learners the teacher confirmed on the import screen and enrolls them in the class.
 * A row with `link` enrolls an existing learner (the teacher chose "Same learner? Link"),
 * every other row creates a new learner. Names already in the class are skipped, so importing
 * the same file twice never creates duplicates.
 * Each import that adds someone is written to the import history for the class page.
 */
export async function importLearners(input: z.input<typeof ImportSchema>): Promise<ImportLearnersResult> {
  const parsed = ImportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Some names are missing or too long. Please check the list." };
  }
  const { classId, rows } = parsed.data;

  const ctx = await requireClass(classId);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, user } = ctx;

  const { data: existing, error: existingError } = await supabase
    .from("class_enrollments")
    .select("learner_id,learner:learners(first_name,last_name)")
    .eq("class_id", classId)
    .limit(2000);
  if (existingError) return { ok: false, error: "Could not check the current class list. Please try again." };

  const seenNames = new Set<string>();
  const enrolledIds = new Set<string>();
  for (const e of existing ?? []) {
    enrolledIds.add(String(e.learner_id));
    const l = Array.isArray(e.learner) ? e.learner[0] : e.learner;
    if (l?.first_name && l?.last_name) seenNames.add(nameKey(l.first_name as string, l.last_name as string));
  }

  // Linked learners must belong to this teacher (RLS) and must still exist.
  const wanted = [...new Set(rows.flatMap((r) => (r.link ? [r.link] : [])))];
  const owned = new Set<string>();
  if (wanted.length > 0) {
    const { data: found, error: foundError } = await supabase.from("learners").select("id").in("id", wanted);
    if (foundError) return { ok: false, error: "Could not check the learners you linked. Please try again." };
    for (const l of found ?? []) owned.add(String(l.id));
    if (wanted.some((id) => !owned.has(id))) {
      return { ok: false, error: "A learner you chose to link was not found. Please read the file again." };
    }
  }

  const fresh: { firstName: string; lastName: string }[] = [];
  const linkIds: string[] = [];
  for (const row of rows) {
    const key = nameKey(row.firstName, row.lastName);
    if (seenNames.has(key)) continue;
    if (row.link && enrolledIds.has(row.link)) continue;
    seenNames.add(key);
    if (row.link) {
      enrolledIds.add(row.link);
      linkIds.push(row.link);
    } else {
      fresh.push(row);
    }
  }
  const skipped = rows.length - fresh.length - linkIds.length;
  if (fresh.length === 0 && linkIds.length === 0) return { ok: true, added: 0, linked: 0, skipped };

  let createdIds: string[] = [];
  if (fresh.length > 0) {
    const { data: created, error: learnerError } = await supabase
      .from("learners")
      .insert(
        fresh.map((r) => ({
          teacher_id: user.id,
          first_name: r.firstName,
          last_name: r.lastName,
          display_name: `${r.firstName} ${r.lastName}`,
        })),
      )
      .select("id");
    if (learnerError || !created) return { ok: false, error: "Could not save the students. Please try again." };
    createdIds = created.map((l) => l.id as string);
  }

  const { error: enrollError } = await supabase
    .from("class_enrollments")
    .insert([...createdIds, ...linkIds].map((id) => ({ class_id: classId, learner_id: id, status: "active" })));

  if (enrollError) {
    // All or nothing: remove only the learners created in this run. Linked learners are untouched.
    if (createdIds.length > 0) await supabase.from("learners").delete().in("id", createdIds);
    return { ok: false, error: "Could not add the students to this class. Nothing was saved." };
  }

  await logImportEvent(supabase, classId, "learners", {
    added: createdIds.length + linkIds.length,
    linked: linkIds.length,
    skipped,
    names: fresh.slice(0, 8).map((r) => `${r.firstName} ${r.lastName}`),
  });

  revalidatePath(`/classes/${classId}`);
  revalidatePath("/classes");
  return { ok: true, added: createdIds.length + linkIds.length, linked: linkIds.length, skipped };
}