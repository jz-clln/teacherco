// src/features/reports/queries.ts - Jabez

import type { createClient } from "@/lib/supabase/server";
import {
  buildCompetencyScores,
  type AnswerRow,
  type ItemCompetencies,
  type ReportAttendance,
  type ReportInput,
  type ReportScore,
  type ReportThresholds,
} from "@/lib/evidence/reports";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Row = Record<string, unknown>;

const PAGE_SIZE = 1000;

// Supabase returns at most 1000 rows per request, so page through larger results.
async function fetchAll(page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>) {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error("Could not read classroom records.");
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

// Embedded rows come back as an object or a one-item array depending on the relationship.
function one(value: unknown): Row | null {
  const item = Array.isArray(value) ? value[0] : value;
  return item && typeof item === "object" ? (item as Row) : null;
}

/**
 * Reads everything a report needs for one class. Only confirmed scores count, and only
 * learners who are still active in the class. RLS limits every query to the signed-in teacher.
 */
export async function loadReportInput(
  supabase: Supabase,
  classId: string,
  thresholds: ReportThresholds,
): Promise<ReportInput | null> {
  const { data: classroom } = await supabase
    .from("classes")
    .select("id, name, subject, grade_level, school_year, benchmark")
    .eq("id", classId)
    .maybeSingle();
  if (!classroom) return null;

  const { data: enrollments, error: enrollmentError } = await supabase
    .from("class_enrollments")
    .select("learner:learners(id, display_name)")
    .eq("class_id", classId)
    .eq("status", "active")
    .limit(1000);
  if (enrollmentError) throw new Error("Could not read the class roster.");

  const learners = (enrollments ?? [])
    .flatMap((enrollment) => {
      const learner = one(enrollment.learner);
      return learner ? [{ id: String(learner.id), name: String(learner.display_name) }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const { data: assessments } = await supabase
    .from("assessments")
    .select("id, title, assessment_date, created_at")
    .eq("class_id", classId);
  const assessmentById = new Map<string, Row>((assessments ?? []).map((assessment) => [String(assessment.id), assessment]));
  const assessmentIds = [...assessmentById.keys()];

  const submissionRows =
    assessmentIds.length === 0
      ? []
      : await fetchAll((from, to) =>
          supabase
            .from("submissions")
            .select("learner_id, assessment_id, score, max_score")
            .in("assessment_id", assessmentIds)
            .eq("review_status", "confirmed")
            .not("score", "is", null)
            .not("max_score", "is", null)
            .order("id")
            .range(from, to),
        );

  const scores: ReportScore[] = submissionRows.flatMap((row) => {
    const assessment = assessmentById.get(String(row.assessment_id));
    const earned = Number(row.score);
    const possible = Number(row.max_score);
    if (!assessment || Number.isNaN(earned) || !(possible > 0)) return [];
    return [
      {
        learnerId: String(row.learner_id),
        assessmentId: String(row.assessment_id),
        assessmentTitle: String(assessment.title),
        sortKey: String(assessment.assessment_date ?? assessment.created_at),
        earned,
        possible,
      },
    ];
  });

  const attendanceRows = await fetchAll((from, to) =>
    supabase.from("attendance_entries").select("learner_id, status").eq("class_id", classId).order("id").range(from, to),
  );
  const attendance: ReportAttendance[] = attendanceRows.map((row) => ({
    learnerId: String(row.learner_id),
    status: String(row.status) as ReportAttendance["status"],
  }));

  // Only competencies the teacher confirmed are used.
  const { data: competencyRows } = await supabase
    .from("competencies")
    .select("id, name")
    .eq("class_id", classId)
    .eq("teacher_confirmed", true);
  const competencies = (competencyRows ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }));

  let competencyScores: ReturnType<typeof buildCompetencyScores> = [];

  if (competencies.length > 0 && assessmentIds.length > 0) {
    const mappingRows = await fetchAll((from, to) =>
      supabase
        .from("assessment_competencies")
        .select("assessment_item_id, competency_id, assessment_items!inner(assessment_id, max_points)")
        .in("competency_id", competencies.map((competency) => competency.id))
        .in("assessment_items.assessment_id", assessmentIds)
        .order("assessment_item_id")
        .order("competency_id")
        .range(from, to),
    );

    const items: ItemCompetencies = new Map();
    const assessmentsWithMappedItems = new Set<string>();
    for (const row of mappingRows) {
      const item = one(row.assessment_items);
      if (!item) continue;
      const itemId = String(row.assessment_item_id);
      const entry = items.get(itemId) ?? { maxPoints: Number(item.max_points), competencyIds: [] };
      entry.competencyIds.push(String(row.competency_id));
      items.set(itemId, entry);
      assessmentsWithMappedItems.add(String(item.assessment_id));
    }

    if (assessmentsWithMappedItems.size > 0) {
      const answerRows = await fetchAll((from, to) =>
        supabase
          .from("submission_answers")
          .select("assessment_item_id, points_awarded, submissions!inner(learner_id, assessment_id, review_status)")
          .eq("submissions.review_status", "confirmed")
          .in("submissions.assessment_id", [...assessmentsWithMappedItems])
          .not("points_awarded", "is", null)
          .order("id")
          .range(from, to),
      );

      const answers: AnswerRow[] = answerRows.flatMap((row) => {
        const submission = one(row.submissions);
        if (!submission) return [];
        return [
          {
            itemId: String(row.assessment_item_id),
            learnerId: String(submission.learner_id),
            assessmentId: String(submission.assessment_id),
            points: Number(row.points_awarded),
          },
        ];
      });

      competencyScores = buildCompetencyScores(answers, items);
    }
  }

  return {
    classInfo: {
      name: String(classroom.name),
      subject: String(classroom.subject),
      gradeLevel: String(classroom.grade_level),
      schoolYear: String(classroom.school_year),
    },
    benchmark: Number(classroom.benchmark),
    thresholds,
    learners,
    scores,
    attendance,
    competencies,
    competencyScores,
  };
}

/** The teacher's most recent notes about one learner. Only used when they allow notes in AI requests. */
export async function loadLearnerNotes(supabase: Supabase, learnerId: string) {
  const { data } = await supabase
    .from("teacher_notes")
    .select("body")
    .eq("learner_id", learnerId)
    .order("created_at", { ascending: false })
    .limit(10);
  return (data ?? []).map((row) => String(row.body).slice(0, 500));
}