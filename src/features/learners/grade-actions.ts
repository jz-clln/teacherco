// src/features/learners/grade-actions.ts

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { nameKey } from "@/lib/excel/roster";
import { logImportEvent, type ChangedScore } from "@/features/learners/import-history";

const SheetSchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    learners: z
      .array(
        z.object({
          firstName: z.string().trim().min(1).max(120),
          lastName: z.string().trim().min(1).max(120),
        }),
      )
      .min(1)
      .max(500),
    columns: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(160),
          total: z.number().positive().max(10000),
          scores: z.array(z.number().min(0).max(10000).nullable()).max(500),
        }),
      )
      .min(1)
      .max(60),
  })
  .superRefine((sheet, ctx) => {
    if (sheet.columns.some((c) => c.scores.length !== sheet.learners.length)) {
      ctx.addIssue({ code: "custom", message: "Scores do not line up with the learners." });
    }
  });

const InputSchema = z.object({
  classId: z.string().uuid(),
  sheets: z.array(SheetSchema).min(1).max(8),
});

export type ImportGradesResult =
  | {
      ok: true;
      /** Scores written (new or updated). */
      scores: number;
      /** Assessments created. Existing imported ones with the same title are reused. */
      created: number;
      skippedSheets: string[];
      /**
       * Score columns left alone because TeacherCo already has those scores: the class has a
       * checked or typed-in activity with the same title, or one that was exported into
       * that column earlier. An import never overwrites or duplicates them.
       */
      protectedTitles?: string[];
    }
  | { ok: false; error: string };

type Prepared = { title: string; total: number; rows: Map<string, number> };
type Score = { score: number; max: number };
type Db = Awaited<ReturnType<typeof createClient>>;

const CHUNK = 500;
const PAGE = 1000; // Supabase returns at most 1000 rows per request.
const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Every saved score in the class, keyed "assessmentId|learnerId". Null if it could not be read completely. */
async function readClassScores(supabase: Db, classId: string): Promise<Map<string, Score> | null> {
  const out = new Map<string, Score>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("submissions")
      .select("assessment_id,learner_id,score,max_score,assessments!inner(class_id)")
      .eq("assessments.class_id", classId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error || !data) return null;
    for (const r of data) {
      const score = Number(r.score);
      const max = Number(r.max_score);
      if (r.score == null || !Number.isFinite(score) || !(max > 0)) continue;
      out.set(`${r.assessment_id}|${r.learner_id}`, { score, max });
    }
    if (data.length < PAGE) break;
  }
  return out;
}

/** Each learner's own average (0-100) and the class average, same way the class page works them out. */
function averagesOf(scores: Map<string, Score>, enrolled: Set<string>) {
  const per = new Map<string, { got: number; max: number }>();
  for (const [key, s] of scores) {
    const learnerId = key.split("|")[1];
    if (!learnerId || !enrolled.has(learnerId)) continue;
    const t = per.get(learnerId) ?? { got: 0, max: 0 };
    t.got += s.score;
    t.max += s.max;
    per.set(learnerId, t);
  }
  const byLearner: Record<string, number> = {};
  for (const [id, t] of per) byLearner[id] = (t.got / t.max) * 100;
  const values = Object.values(byLearner);
  return { byLearner, classAverage: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null };
}

/**
 * Saves grades read from a class record. Every score column becomes one assessment
 * ("Term 2 · Written Work 1", source "imported") and every score becomes a confirmed submission.
 * Learners are matched by name against the learners already in the class. LRNs are never sent or stored.
 * Running it twice updates the same assessments and scores instead of duplicating them.
 * Blank cells are never saved as zero.
 * A column is skipped when TeacherCo already owns its scores:
 *   - the class has a checked or typed-in activity with the same title, or
 *   - a checked or typed-in activity was exported into that column earlier (assessments.exported_title).
 * So an import can never overwrite them or count the same scores twice.
 * Scores are written by the database function import_grade_scores, the only path the
 * submissions guard accepts for imported activities.
 * Each import that changes something is written to the import history, so the class page can show
 * what is new, what changed, and how the averages moved.
 */
export async function importGrades(input: z.input<typeof InputSchema>): Promise<ImportGradesResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The grade data looks wrong. Please read the file again." };
  const { classId, sheets } = parsed.data;

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
    .select("learner:learners(id,first_name,last_name)")
    .eq("class_id", classId)
    .eq("status", "active")
    .limit(2000);
  if (enrolledError) return { ok: false, error: "Could not read the class list. Please try again." };

  const byName = new Map<string, string>();
  const enrolledIds = new Set<string>();
  const nameById = new Map<string, string>();
  for (const e of enrolled ?? []) {
    const l = Array.isArray(e.learner) ? e.learner[0] : e.learner;
    if (!l?.id) continue;
    enrolledIds.add(l.id as string);
    if (l.first_name && l.last_name) {
      byName.set(nameKey(l.first_name as string, l.last_name as string), l.id as string);
      nameById.set(l.id as string, `${l.first_name} ${l.last_name}`);
    }
  }

  // Match learners, then build one entry per score column.
  const prepared = new Map<string, Prepared>();
  const skippedSheets: string[] = [];

  for (const sheet of sheets) {
    const ids = sheet.learners.map((l) => byName.get(nameKey(l.firstName, l.lastName)) ?? null);
    if (!ids.some(Boolean)) {
      skippedSheets.push(sheet.label);
      continue;
    }
    for (const col of sheet.columns) {
      const entry = prepared.get(col.title) ?? { title: col.title, total: col.total, rows: new Map<string, number>() };
      col.scores.forEach((score, i) => {
        const id = ids[i];
        if (id && score != null) entry.rows.set(id, round2(score));
      });
      if (entry.rows.size > 0) prepared.set(col.title, entry);
    }
  }

  const wanted = [...prepared.values()];
  if (wanted.length === 0) return { ok: true, scores: 0, created: 0, skippedSheets, protectedTitles: [] };

  // Reuse imported assessments with the same title. Never reuse a checked or typed-in one,
  // and never import a column that a checked or typed-in activity was exported into.
  const titles = wanted.map((p) => p.title);
  const [{ data: existing, error: existingError }, { data: exportedTo, error: exportedError }] = await Promise.all([
    supabase.from("assessments").select("id,title,source").eq("class_id", classId).in("title", titles),
    supabase.from("assessments").select("exported_title").eq("class_id", classId).in("exported_title", titles),
  ]);
  if (existingError || exportedError) {
    return { ok: false, error: "Could not check existing assessments. Please try again." };
  }

  const idByTitle = new Map<string, string>();
  const protectedSet = new Set<string>();
  for (const a of existing ?? []) {
    if (a.source === "imported") idByTitle.set(String(a.title), String(a.id));
    else protectedSet.add(String(a.title));
  }
  for (const a of exportedTo ?? []) {
    if (a.exported_title) protectedSet.add(String(a.exported_title));
  }
  const protectedTitles = [...protectedSet];

  const list = wanted.filter((p) => !protectedSet.has(p.title));
  if (list.length === 0) return { ok: true, scores: 0, created: 0, skippedSheets, protectedTitles };

  const missing = list.filter((p) => !idByTitle.has(p.title));

  if (missing.length > 0) {
    // Spread created_at by one second so the sheet order is the order reports see.
    const start = Date.now() - missing.length * 1000;
    const { data: made, error: madeError } = await supabase
      .from("assessments")
      .insert(
        missing.map((p, i) => ({
          class_id: classId,
          title: p.title,
          kind: "mixed",
          status: "closed",
          source: "imported",
          total_points: p.total,
          created_at: new Date(start + i * 1000).toISOString(),
        })),
      )
      .select("id,title");
    if (madeError || !made) return { ok: false, error: "Could not create the assessments. Nothing was saved." };
    for (const a of made) idByTitle.set(String(a.title), String(a.id));
  }

  const rows = list.flatMap((p) =>
    [...p.rows].map(([learnerId, score]) => ({
      assessment_id: idByTitle.get(p.title)!,
      learner_id: learnerId,
      score,
      max_score: p.total,
    })),
  );

  // Compare with what is saved now, before it is overwritten.
  const before = await readClassScores(supabase, classId);
  const after = before ? new Map(before) : null;
  const titleById = new Map([...idByTitle].map(([title, id]) => [id, title]));
  let scoresNew = 0;
  let scoresChanged = 0;
  let scoresSame = 0;
  const changedAll: ChangedScore[] = [];
  if (before && after) {
    for (const r of rows) {
      const key = `${r.assessment_id}|${r.learner_id}`;
      const old = before.get(key);
      if (!old) {
        scoresNew++;
      } else if (Math.abs(old.score - r.score) < 0.005) {
        scoresSame++;
      } else {
        scoresChanged++;
        changedAll.push({
          name: nameById.get(r.learner_id) ?? "A learner",
          title: titleById.get(r.assessment_id) ?? "Score",
          from: old.score,
          to: r.score,
        });
      }
      after.set(key, { score: r.score, max: r.max_score });
    }
  }

  // Each chunk is saved by one database call, so a chunk is saved completely or not at all.
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.rpc("import_grade_scores", { p_rows: rows.slice(i, i + CHUNK) });
    if (error) {
      return { ok: false, error: "Some scores were not saved. Import again. It updates instead of duplicating." };
    }
  }

  // Only log imports that changed something, so repeating the same import adds no noise.
  if (before && after && (scoresNew + scoresChanged > 0 || missing.length > 0)) {
    const was = averagesOf(before, enrolledIds);
    const now_ = averagesOf(after, enrolledIds);
    const learnerAverages: Record<string, { before: number | null; after: number }> = {};
    for (const [id, afterPct] of Object.entries(now_.byLearner)) {
      const beforePct = was.byLearner[id] ?? null;
      if (beforePct === null || Math.abs(afterPct - beforePct) >= 0.05) {
        learnerAverages[id] = { before: beforePct === null ? null : round1(beforePct), after: round1(afterPct) };
      }
    }
    changedAll.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
    await logImportEvent(supabase, classId, "grades", {
      scoresNew,
      scoresChanged,
      scoresSame,
      assessmentsCreated: missing.map((p) => p.title).slice(0, 12),
      assessmentsCreatedCount: missing.length,
      changed: changedAll.slice(0, 15),
      classAverage: {
        before: was.classAverage === null ? null : round1(was.classAverage),
        after: now_.classAverage === null ? null : round1(now_.classAverage),
      },
      learnerAverages,
    });
  }

  revalidatePath(`/classes/${classId}`);
  revalidatePath("/classes");
  revalidatePath("/reports");
  return { ok: true, scores: rows.length, created: missing.length, skippedSheets, protectedTitles };
}