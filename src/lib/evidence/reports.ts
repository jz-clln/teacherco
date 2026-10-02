// src/lib/evidence/reports.ts - Jabez

import { belowBenchmark, classAverage, percentage, type ScoreRow } from "./metrics";

export type ReportClassInfo = { name: string; subject: string; gradeLevel: string; schoolYear: string };
export type ReportLearner = { id: string; name: string };
export type ReportCompetency = { id: string; name: string };
export type ReportThresholds = { absences: number; dropPoints: number };

export type ReportScore = {
  learnerId: string;
  assessmentId: string;
  assessmentTitle: string;
  sortKey: string;
  earned: number;
  possible: number;
};

export type ReportAttendance = { learnerId: string; status: "present" | "absent" | "late" | "excused" };

export type CompetencyScore = {
  competencyId: string;
  learnerId: string;
  assessmentId: string;
  earned: number;
  possible: number;
};

export type AnswerRow = { itemId: string; learnerId: string; assessmentId: string; points: number };
export type ItemCompetencies = Map<string, { maxPoints: number; competencyIds: string[] }>;

export type ReportInput = {
  classInfo: ReportClassInfo;
  benchmark: number;
  thresholds: ReportThresholds;
  learners: ReportLearner[];
  scores: ReportScore[];
  attendance: ReportAttendance[];
  competencies: ReportCompetency[];
  competencyScores: CompetencyScore[];
};

export type LearnerFlag = "below_benchmark" | "absences" | "drop";

export type CompetencyStat = {
  id: string;
  name: string;
  average: number;
  assessmentCount: number;
  learnerCount: number;
  belowBenchmarkCount: number;
};

export type ClassReportEvidence = {
  kind: "class_performance";
  version: 1;
  classInfo: ReportClassInfo;
  benchmark: number;
  thresholds: ReportThresholds;
  learnerCount: number;
  scoredLearnerCount: number;
  assessmentCount: number;
  classAverage: number | null;
  belowBenchmarkCount: number;
  /** null when the class has no attendance records at all. */
  attendanceConcernCount: number | null;
  dropCount: number;
  competencies: CompetencyStat[];
  learners: {
    id: string;
    name: string;
    average: number | null;
    absences: number | null;
    change: number | null;
    flags: LearnerFlag[];
  }[];
};

export type LearnerReportEvidence = {
  kind: "learner_progress";
  version: 1;
  classInfo: ReportClassInfo;
  benchmark: number;
  thresholds: ReportThresholds;
  learner: ReportLearner;
  average: number | null;
  classAverage: number | null;
  belowBenchmark: boolean;
  assessments: { title: string; earned: number; possible: number; percentage: number }[];
  /** Latest assessment percentage minus the average of the earlier ones. */
  change: number | null;
  absences: number | null;
  attendance: { present: number; absent: number; late: number; excused: number } | null;
  competencies: { name: string; average: number; classAverage: number; belowBenchmark: boolean }[];
};

const round1 = (value: number) => Math.round(value * 10) / 10;
const round1OrNull = (value: number | null) => (value == null ? null : round1(value));

function toRow(score: { learnerId: string; earned: number; possible: number }): ScoreRow {
  return { learnerId: score.learnerId, earned: score.earned, possible: score.possible };
}

const byDate = (a: ReportScore, b: ReportScore) =>
  a.sortKey.localeCompare(b.sortKey) || a.assessmentId.localeCompare(b.assessmentId);

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = groups.get(k);
    if (list) list.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

function averagesByLearner(rows: ScoreRow[]) {
  const averages = new Map<string, number>();
  for (const [learnerId, list] of groupBy(rows, (row) => row.learnerId)) {
    const average = classAverage(list);
    if (average != null) averages.set(learnerId, average);
  }
  return averages;
}

function learnersBelow(averages: Map<string, number>, benchmark: number) {
  const rows: ScoreRow[] = [...averages].map(([learnerId, average]) => ({ learnerId, earned: average, possible: 100 }));
  return new Set(belowBenchmark(rows, benchmark).map((row) => row.learnerId));
}

function latestChange(scores: ReportScore[]) {
  if (scores.length < 2) return null;
  const ordered = [...scores].sort(byDate);
  const latest = ordered[ordered.length - 1];
  const earlier = classAverage(ordered.slice(0, -1).map(toRow));
  const latestPercentage = percentage(latest.earned, latest.possible);
  if (earlier == null || latestPercentage == null) return null;
  return latestPercentage - earlier;
}

function competencyStats(competencies: ReportCompetency[], scores: CompetencyScore[], benchmark: number) {
  const byCompetency = groupBy(scores, (score) => score.competencyId);
  const stats: CompetencyStat[] = [];

  for (const competency of competencies) {
    const rows = byCompetency.get(competency.id) ?? [];
    const average = classAverage(rows.map(toRow));
    if (average == null) continue;
    stats.push({
      id: competency.id,
      name: competency.name,
      average: round1(average),
      assessmentCount: new Set(rows.map((row) => row.assessmentId)).size,
      learnerCount: new Set(rows.map((row) => row.learnerId)).size,
      belowBenchmarkCount: learnersBelow(averagesByLearner(rows.map(toRow)), benchmark).size,
    });
  }

  return stats.sort((a, b) => a.average - b.average || a.name.localeCompare(b.name));
}

/** Adds up each answer's points per competency, learner and assessment. */
export function buildCompetencyScores(answers: AnswerRow[], items: ItemCompetencies): CompetencyScore[] {
  const totals = new Map<string, CompetencyScore>();

  for (const answer of answers) {
    const item = items.get(answer.itemId);
    if (!item) continue;
    for (const competencyId of item.competencyIds) {
      const key = `${competencyId}|${answer.learnerId}|${answer.assessmentId}`;
      const total = totals.get(key) ?? {
        competencyId,
        learnerId: answer.learnerId,
        assessmentId: answer.assessmentId,
        earned: 0,
        possible: 0,
      };
      total.earned += answer.points;
      total.possible += item.maxPoints;
      totals.set(key, total);
    }
  }

  return [...totals.values()];
}

function activeOnly(input: ReportInput) {
  const active = new Set(input.learners.map((learner) => learner.id));
  return {
    scores: input.scores.filter((score) => active.has(score.learnerId)),
    attendance: input.attendance.filter((entry) => active.has(entry.learnerId)),
    competencyScores: input.competencyScores.filter((score) => active.has(score.learnerId)),
  };
}

export function buildClassReportEvidence(input: ReportInput): ClassReportEvidence {
  const { benchmark, thresholds } = input;
  const { scores, attendance, competencyScores } = activeOnly(input);

  const rows = scores.map(toRow);
  const averages = averagesByLearner(rows);
  const below = learnersBelow(averages, benchmark);
  const scoresByLearner = groupBy(scores, (score) => score.learnerId);

  const absences = new Map<string, number>();
  for (const entry of attendance) {
    absences.set(entry.learnerId, (absences.get(entry.learnerId) ?? 0) + (entry.status === "absent" ? 1 : 0));
  }

  const learners = input.learners
    .map((learner) => {
      const average = averages.get(learner.id) ?? null;
      const absent = absences.get(learner.id) ?? null;
      const change = latestChange(scoresByLearner.get(learner.id) ?? []);

      const flags: LearnerFlag[] = [];
      if (below.has(learner.id)) flags.push("below_benchmark");
      if (absent != null && absent >= thresholds.absences) flags.push("absences");
      if (change != null && change <= -thresholds.dropPoints) flags.push("drop");

      return { id: learner.id, name: learner.name, average: round1OrNull(average), absences: absent, change: round1OrNull(change), flags };
    })
    .sort((a, b) => (a.average ?? Infinity) - (b.average ?? Infinity) || a.name.localeCompare(b.name));

  return {
    kind: "class_performance",
    version: 1,
    classInfo: input.classInfo,
    benchmark,
    thresholds,
    learnerCount: input.learners.length,
    scoredLearnerCount: averages.size,
    assessmentCount: new Set(scores.map((score) => score.assessmentId)).size,
    classAverage: round1OrNull(classAverage(rows)),
    belowBenchmarkCount: below.size,
    attendanceConcernCount: attendance.length === 0 ? null : learners.filter((l) => l.flags.includes("absences")).length,
    dropCount: learners.filter((l) => l.flags.includes("drop")).length,
    competencies: competencyStats(input.competencies, competencyScores, benchmark),
    learners,
  };
}

export function buildLearnerReportEvidence(input: ReportInput, learnerId: string): LearnerReportEvidence | null {
  const learner = input.learners.find((item) => item.id === learnerId);
  if (!learner) return null;

  const { scores, attendance, competencyScores } = activeOnly(input);
  const mine = scores.filter((score) => score.learnerId === learnerId).sort(byDate);
  const average = classAverage(mine.map(toRow));

  const myAttendance = attendance.filter((entry) => entry.learnerId === learnerId);
  const countStatus = (status: ReportAttendance["status"]) => myAttendance.filter((entry) => entry.status === status).length;

  const competencies = input.competencies.flatMap((competency) => {
    const all = competencyScores.filter((score) => score.competencyId === competency.id);
    const own = classAverage(all.filter((score) => score.learnerId === learnerId).map(toRow));
    const overall = classAverage(all.map(toRow));
    if (own == null || overall == null) return [];
    return [{ name: competency.name, average: round1(own), classAverage: round1(overall), belowBenchmark: own < input.benchmark }];
  });

  return {
    kind: "learner_progress",
    version: 1,
    classInfo: input.classInfo,
    benchmark: input.benchmark,
    thresholds: input.thresholds,
    learner,
    average: round1OrNull(average),
    classAverage: round1OrNull(classAverage(scores.map(toRow))),
    belowBenchmark: average != null && average < input.benchmark,
    assessments: mine.map((score) => ({
      title: score.assessmentTitle,
      earned: score.earned,
      possible: score.possible,
      percentage: round1(percentage(score.earned, score.possible) ?? 0),
    })),
    change: round1OrNull(latestChange(mine)),
    absences: myAttendance.length === 0 ? null : countStatus("absent"),
    attendance:
      myAttendance.length === 0
        ? null
        : { present: countStatus("present"), absent: countStatus("absent"), late: countStatus("late"), excused: countStatus("excused") },
    competencies: competencies.sort((a, b) => a.average - b.average || a.name.localeCompare(b.name)),
  };
}