import type { SupabaseClient } from "@supabase/supabase-js";
import {
  compareToRecord,
  computeTermGrade,
  inferTermAndComponent,
  type Component,
  type GradingConfig,
  type TermGradeResult,
  type Comparison,
  type RecordedGrade,
  type ScoreItem,
} from "@/lib/grading/deped";
import { defaultGradingConfig } from "@/lib/grading/presets";
import { loadReportInput } from "@/features/reports/queries";
import { createClient } from "@/lib/supabase/server";

export type GradingClassInput = { id: string; name: string; subject: string };
export type GradingClassSetting = GradingClassInput & {
  config: GradingConfig;
  defaultConfig: GradingConfig;
  customized: boolean;
  sourceFilename: string | null;
};

function asConfig(value: { weights: unknown; transmutation: unknown; descriptors: unknown }, subject: string): GradingConfig {
  const defaults = defaultGradingConfig(subject);
  const weights = value.weights && typeof value.weights === "object" ? value.weights as Record<string, unknown> : {};
  const transmutation = Array.isArray(value.transmutation) ? value.transmutation : defaults.transmutation;
  const descriptors = Array.isArray(value.descriptors) ? value.descriptors : defaults.descriptors;
  return {
    weights: {
      written_work: Number(weights.written_work ?? defaults.weights.written_work),
      performance_task: Number(weights.performance_task ?? defaults.weights.performance_task),
      assessment: Number(weights.assessment ?? defaults.weights.assessment),
    },
    transmutation: transmutation as GradingConfig["transmutation"],
    descriptors: descriptors as GradingConfig["descriptors"],
  };
}

export async function getGradingClassSettings(
  supabase: SupabaseClient,
  classes: GradingClassInput[],
): Promise<GradingClassSetting[]> {
  if (!classes.length) return [];
  const { data, error } = await supabase
    .from("class_grading_config")
    .select("class_id,weights,transmutation,descriptors,source_filename")
    .in("class_id", classes.map((classroom) => classroom.id));
  if (error) throw new Error("Could not load class grading rules.");
  const savedByClass = new Map((data ?? []).map((row) => [String(row.class_id), row]));

  return classes.map((classroom) => {
    const saved = savedByClass.get(classroom.id);
    const defaultConfig = defaultGradingConfig(classroom.subject);
    return {
      ...classroom,
      config: saved ? asConfig(saved, classroom.subject) : defaultConfig,
      defaultConfig,
      customized: Boolean(saved),
      sourceFilename: saved?.source_filename ? String(saved.source_filename) : null,
    };
  });
}

export type LearnerTermGrade = {
  term: number;
  result: TermGradeResult;
  comparison: Comparison;
  recorded: RecordedGrade | null;
};

export type ClassTermGrades = {
  id: string;
  name: string;
  subject: string;
  gradeLevel: string;
  config: GradingConfig;
  customized: boolean;
  sourceFilename: string | null;
  hasTermData: boolean;
  unassignedActivityCount: number;
  learners: { id: string; name: string; terms: LearnerTermGrade[] }[];
};

export async function getClassTermGrades(supabase: SupabaseClient, classId: string): Promise<ClassTermGrades | null> {
  async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
    const rows: T[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await page(offset, offset + 499);
      if (error || !data) throw new Error("Could not load the class grading records.");
      rows.push(...data);
      if (data.length < 500) return rows;
    }
  }
  const [input, configResult, recordResult, activityResult] = await Promise.all([
    loadReportInput(supabase as Awaited<ReturnType<typeof createClient>>, classId, { absences: 5, dropPoints: 10 }),
    supabase.from("class_grading_config").select("weights,transmutation,descriptors,term_possible,source_filename").eq("class_id", classId).maybeSingle(),
    allRows((from, to) => supabase.from("teacher_term_grades").select("learner_id,term,initial_grade,term_grade,descriptor").eq("class_id", classId).order("id").range(from, to)),
    allRows((from, to) => supabase.from("assessments").select("id,activity_slot,term,component").eq("class_id", classId).order("id").range(from, to)),
  ]);
  if (!input) return null;
  if (configResult.error) throw new Error("Could not load the class grading records.");

  // Reuse the verified configuration read above; a failed second read must not
  // silently substitute default rules while copying an official reviewed grade.
  const saved = configResult.data;
  const gradingSetting = {
    config: saved ? asConfig(saved, input.classInfo.subject) : defaultGradingConfig(input.classInfo.subject),
    customized: Boolean(saved), sourceFilename: saved?.source_filename ?? null,
  };
  const learners = input.learners;
  const scoreByKey = new Map<string, { earned: number; possible: number }>();
  const assessmentById = new Map<string, {
    id: string;
    title: string;
    term: number | null;
    component: Component | null;
    isTermExam: boolean;
    possible: number;
  }>();
  for (const score of input.scores) {
    const activity = activityResult.find((a) => a.id === score.assessmentId);
    const inferred = inferTermAndComponent(activity?.activity_slot ?? score.assessmentTitle);
    if (activity?.term) inferred.term = Number(activity.term);
    if (activity?.component) inferred.component = activity.component as Component;
    const current = assessmentById.get(score.assessmentId);
    assessmentById.set(score.assessmentId, current ?? {
      id: score.assessmentId,
      title: score.assessmentTitle,
      term: inferred.term,
      component: inferred.component,
      isTermExam: inferred.isTermExam,
      possible: score.possible,
    });
    scoreByKey.set(`${score.learnerId}|${score.assessmentId}`, { earned: score.earned, possible: score.possible });
  }
  const assessments = [...assessmentById.values()].filter((item) => item.term != null && item.term >= 1 && item.term <= 3 && item.component != null);

  const termPossibleRaw = configResult.data?.term_possible;
  const termPossible = termPossibleRaw && typeof termPossibleRaw === "object" ? termPossibleRaw as Record<string, Record<string, unknown>> : {};
  const hasSavedHps = Object.values(termPossible).some((components) =>
    Object.values(components).some((value) => Number(value) > 0),
  );
  const recordedByKey = new Map<string, RecordedGrade>();
  for (const record of recordResult) {
    recordedByKey.set(`${record.learner_id}|${record.term}`, {
      initialGrade: record.initial_grade == null ? null : Number(record.initial_grade),
      termGrade: record.term_grade == null ? null : Number(record.term_grade),
      descriptor: record.descriptor == null ? null : String(record.descriptor),
    });
  }

  return {
    id: classId,
    name: input.classInfo.name,
    subject: input.classInfo.subject,
    gradeLevel: input.classInfo.gradeLevel,
    config: gradingSetting.config,
    customized: gradingSetting.customized,
    sourceFilename: gradingSetting.sourceFilename,
    hasTermData: assessments.length > 0 || hasSavedHps,
    unassignedActivityCount: [...assessmentById.values()].filter((item) => item.term == null || item.component == null).length,
    learners: learners.map((learner) => ({
      ...learner,
      terms: [1, 2, 3].map((term) => {
        const termAssessments = assessments.filter((item) => item.term === term);
        const items: ScoreItem[] = termAssessments.flatMap((assessment) => {
          if (!assessment.component) return [];
          const score = scoreByKey.get(`${learner.id}|${assessment.id}`);
          return [{
            title: assessment.title,
            component: assessment.component,
            possible: score?.possible ?? assessment.possible ?? 0,
            earned: score?.earned ?? null,
            isTermExam: assessment.isTermExam,
          }];
        });

        const possible = termPossible[String(term)] ?? {};
        for (const component of ["written_work", "performance_task", "assessment"] as const) {
          const expected = Number(possible[component]);
          if (!Number.isFinite(expected) || expected <= 0) continue;
          const present = items.filter((item) => item.component === component).reduce((sum, item) => sum + item.possible, 0);
          if (expected - present > 0.001) {
            items.push({ title: "Unscored class-record columns", component, possible: expected - present, earned: null, isTermExam: false });
          }
        }

        const sheetPossible = Object.fromEntries(
          (["written_work", "performance_task", "assessment"] as const)
            .flatMap((component) => Number.isFinite(Number(possible[component])) ? [[component, Number(possible[component])]] : []),
        ) as Partial<Record<Component, number>>;
        const result = computeTermGrade(items, gradingSetting.config, sheetPossible);
        const record = recordedByKey.get(`${learner.id}|${term}`) ?? null;
        return { term, result, recorded: record, comparison: compareToRecord(result, record) };
      }),
    })),
  };
}
