// src/features/classes/stats.ts
//
// Real numbers for the class overview cards. Reads imported and checked scores.
// Class average = the average of each learner's (points earned / points possible).

import type { SupabaseClient } from "@supabase/supabase-js";

export type ClassStats = {
  /** 0-100, or null when no scores exist yet. */
  average: number | null;
  /** Learners whose own average is under the benchmark. */
  below: number;
  /** Learners that have at least one score. */
  scored: number;
  assessments: number;
  lowest: { title: string; average: number } | null;
  /** 0-100, or null when no attendance has been recorded. */
  attendance: number | null;
};

const PAGE = 1000; // Supabase returns at most 1000 rows per request.

type Row = {
  assessment_id: string;
  learner_id: string;
  score: number | string | null;
  max_score: number | string | null;
};

export async function getClassStats(
  supabase: SupabaseClient,
  classId: string,
  learnerIds: string[],
  benchmark: number,
): Promise<ClassStats> {
  const enrolled = new Set(learnerIds);

  const [{ data: assessments }, scores, attendance] = await Promise.all([
    supabase.from("assessments").select("id,title").eq("class_id", classId).limit(1000),
    readAllScores(supabase, classId),
    readAttendance(supabase, classId),
  ]);

  const titles = new Map((assessments ?? []).map((a) => [String(a.id), String(a.title)]));

  const perLearner = new Map<string, { got: number; max: number }>();
  const perAssessment = new Map<string, { sum: number; n: number }>();

  for (const r of scores) {
    const got = Number(r.score);
    const max = Number(r.max_score);
    if (r.score == null || !(max > 0) || !Number.isFinite(got) || !enrolled.has(r.learner_id)) continue;

    const l = perLearner.get(r.learner_id) ?? { got: 0, max: 0 };
    l.got += got;
    l.max += max;
    perLearner.set(r.learner_id, l);

    const a = perAssessment.get(r.assessment_id) ?? { sum: 0, n: 0 };
    a.sum += (got / max) * 100;
    a.n += 1;
    perAssessment.set(r.assessment_id, a);
  }

  const percents = [...perLearner.values()].map((l) => (l.got / l.max) * 100);
  const average = percents.length ? percents.reduce((a, b) => a + b, 0) / percents.length : null;

  let lowest: ClassStats["lowest"] = null;
  for (const [id, a] of perAssessment) {
    const avg = a.sum / a.n;
    if (!lowest || avg < lowest.average) lowest = { title: titles.get(id) ?? "Assessment", average: avg };
  }

  return {
    average,
    below: percents.filter((p) => p < benchmark).length,
    scored: percents.length,
    assessments: perAssessment.size,
    lowest,
    attendance,
  };
}

async function readAllScores(supabase: SupabaseClient, classId: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("submissions")
      .select("assessment_id,learner_id,score,max_score,assessments!inner(class_id)")
      .eq("assessments.class_id", classId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    out.push(...(data as unknown as Row[]));
    if (data.length < PAGE) break;
  }
  return out;
}

async function readAttendance(supabase: SupabaseClient, classId: string): Promise<number | null> {
  const [{ count: total }, { count: here }] = await Promise.all([
    supabase.from("attendance_entries").select("id", { count: "exact", head: true }).eq("class_id", classId),
    supabase
      .from("attendance_entries")
      .select("id", { count: "exact", head: true })
      .eq("class_id", classId)
      .in("status", ["present", "late"]),
  ]);
  return total ? ((here ?? 0) / total) * 100 : null;
}