import type { SupabaseClient } from "@supabase/supabase-js";
import { buildClassReportEvidence, buildLearnerReportEvidence } from "@/lib/evidence/reports";
import type { ReportThresholds } from "@/lib/evidence/reports";
import { loadReportInput } from "@/features/reports/queries";
import { createClient } from "@/lib/supabase/server";
import { findMissingActivityNames, type AskClass } from "./engine";

export async function getAskClassOptions() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("classes")
    .select("id,name,subject")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  return {
    error: Boolean(error),
    classes: (data ?? []).map((item) => ({ id: String(item.id), name: String(item.name), subject: String(item.subject) })),
  };
}

export async function loadAskClass(
  supabase: SupabaseClient,
  classId: string,
  thresholds: ReportThresholds,
): Promise<AskClass | null> {
  const input = await loadReportInput(supabase as Awaited<ReturnType<typeof createClient>>, classId, thresholds);
  if (!input) return null;

  const missingByLearner = findMissingActivityNames(input.learners, input.scores);

  const evidence = buildClassReportEvidence(input);
  const evidenceByLearner = new Map(evidence.learners.map((learner) => [learner.id, learner]));
  const attendanceByLearner = new Map<string, { here: number; counted: number }>();
  for (const entry of input.attendance) {
    if (entry.status === "excused") continue;
    const counts = attendanceByLearner.get(entry.learnerId) ?? { here: 0, counted: 0 };
    counts.counted++;
    if (entry.status === "present" || entry.status === "late") counts.here++;
    attendanceByLearner.set(entry.learnerId, counts);
  }

  const learnerRows = input.learners.map((learner) => {
    const ownEvidence = buildLearnerReportEvidence(input, learner.id);
    const attendance = attendanceByLearner.get(learner.id);
    const classEvidence = evidenceByLearner.get(learner.id);
    return {
      id: learner.id,
      name: learner.name,
      average: classEvidence?.average ?? null,
      absences: classEvidence?.absences ?? null,
      attendanceRate: attendance && attendance.counted > 0 ? (attendance.here / attendance.counted) * 100 : null,
      change: ownEvidence?.change ?? null,
      assessments: ownEvidence?.assessments.map((item) => ({ title: item.title, percentage: item.percentage })) ?? [],
      missingActivities: missingByLearner.get(learner.id) ?? [],
      competencies: ownEvidence?.competencies.map((item) => ({ name: item.name, average: item.average, classAverage: item.classAverage })) ?? [],
    };
  });

  const perAssessment = new Map<string, { title: string; percentages: number[]; learners: Set<string> }>();
  for (const score of input.scores) {
    if (!(score.possible > 0)) continue;
    const row = perAssessment.get(score.assessmentId) ?? { title: score.assessmentTitle, percentages: [], learners: new Set<string>() };
    row.percentages.push((score.earned / score.possible) * 100);
    row.learners.add(score.learnerId);
    perAssessment.set(score.assessmentId, row);
  }
  const assessments = [...perAssessment.values()].map((item) => ({
    title: item.title,
    average: item.percentages.reduce((sum, value) => sum + value, 0) / item.percentages.length,
    learnerCount: item.learners.size,
  }));

  return {
    id: classId,
    name: input.classInfo.name,
    subject: input.classInfo.subject,
    benchmark: input.benchmark,
    classAverage: evidence.classAverage,
    learners: learnerRows,
    assessmentCount: evidence.assessmentCount,
    assessments,
    competencies: evidence.competencies.map((item) => ({ name: item.name, average: item.average, assessmentCount: item.assessmentCount })),
  };
}