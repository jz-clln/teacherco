// src/lib/ai/report-narrative.ts - Jabez

import type { ClassReportEvidence, LearnerReportEvidence } from "../evidence/reports";
import { getAIProvider } from "./provider";

export type NarrativeLanguage = "en" | "fil";
export type FallbackReason = "ai_off" | "not_configured" | "failed" | "unverified_numbers";

export type Narrative = {
  text: string;
  source: "ai" | "facts";
  provider?: string;
  model?: string;
  fallbackReason?: FallbackReason;
};

export type GenerationMeta = {
  source: "ai" | "facts";
  provider?: string;
  model?: string;
  fallbackReason?: FallbackReason;
  language: NarrativeLanguage;
  generatedAt: string;
};

type Evidence = ClassReportEvidence | LearnerReportEvidence;

const plural = (count: number, singular: string, many: string) => (count === 1 ? singular : many);
const pct = (value: number) => `${value.toFixed(1)}%`;
const points = (value: number) => Math.abs(value).toFixed(1);

function classFactsEn(e: ClassReportEvidence) {
  const { name, subject, gradeLevel, schoolYear } = e.classInfo;
  const learners = (n: number) => plural(n, "learner", "learners");
  const paragraphs: string[] = [];

  const intro = `${name} (${subject}, ${gradeLevel}, SY ${schoolYear}) has confirmed scores for ${e.scoredLearnerCount} ${learners(e.scoredLearnerCount)} across ${e.assessmentCount} ${plural(e.assessmentCount, "assessment", "assessments")}.`;
  paragraphs.push(e.classAverage == null ? intro : `${intro} The class average is ${pct(e.classAverage)}.`);
  paragraphs.push(`${e.belowBenchmarkCount} of ${e.scoredLearnerCount} ${learners(e.scoredLearnerCount)} ${plural(e.belowBenchmarkCount, "is", "are")} below the ${e.benchmark}% benchmark.`);

  const weakest = e.competencies[0];
  if (weakest) {
    paragraphs.push(
      `Among the competencies you confirmed, ${weakest.name} has the lowest average at ${pct(weakest.average)} across ${weakest.assessmentCount} ${plural(weakest.assessmentCount, "assessment", "assessments")}, with ${weakest.belowBenchmarkCount} ${learners(weakest.belowBenchmarkCount)} below the benchmark.`,
    );
  }

  const attention: string[] = [];
  if (e.attendanceConcernCount != null) {
    attention.push(`${e.attendanceConcernCount} ${learners(e.attendanceConcernCount)} ${plural(e.attendanceConcernCount, "has", "have")} ${e.thresholds.absences} or more absences.`);
  }
  if (e.dropCount > 0) {
    attention.push(`${e.dropCount} ${learners(e.dropCount)} ${plural(e.dropCount, "has", "have")} dropped by ${e.thresholds.dropPoints} percentage points or more on the latest assessment.`);
  }
  if (attention.length > 0) paragraphs.push(attention.join(" "));

  return paragraphs.join("\n\n");
}

function classFactsFil(e: ClassReportEvidence) {
  const { name, subject, gradeLevel, schoolYear } = e.classInfo;
  const paragraphs: string[] = [];

  const intro = `Ang ${name} (${subject}, ${gradeLevel}, SY ${schoolYear}) ay may kumpirmadong marka para sa ${e.scoredLearnerCount} mag-aaral sa ${e.assessmentCount} pagtatasa.`;
  paragraphs.push(e.classAverage == null ? intro : `${intro} Ang average ng klase ay ${pct(e.classAverage)}.`);
  paragraphs.push(`${e.belowBenchmarkCount} sa ${e.scoredLearnerCount} mag-aaral ang mas mababa sa ${e.benchmark}% na benchmark.`);

  const weakest = e.competencies[0];
  if (weakest) {
    paragraphs.push(
      `Sa mga kasanayang kinumpirma mo, pinakamababa ang ${weakest.name} na may average na ${pct(weakest.average)} sa ${weakest.assessmentCount} pagtatasa; ${weakest.belowBenchmarkCount} mag-aaral ang mas mababa sa benchmark.`,
    );
  }

  const attention: string[] = [];
  if (e.attendanceConcernCount != null) {
    attention.push(`${e.attendanceConcernCount} mag-aaral ang may ${e.thresholds.absences} o higit pang pagliban.`);
  }
  if (e.dropCount > 0) {
    attention.push(`${e.dropCount} mag-aaral ang bumaba nang ${e.thresholds.dropPoints} puntos o higit pa sa pinakahuling pagtatasa.`);
  }
  if (attention.length > 0) paragraphs.push(attention.join(" "));

  return paragraphs.join("\n\n");
}

function learnerFactsEn(e: LearnerReportEvidence) {
  const name = e.learner.name;
  const paragraphs: string[] = [];

  if (e.average != null) {
    const intro = `${name}'s average across ${e.assessments.length} confirmed ${plural(e.assessments.length, "assessment", "assessments")} in ${e.classInfo.name} is ${pct(e.average)}, ${e.belowBenchmark ? "below" : "at or above"} the ${e.benchmark}% benchmark.`;
    paragraphs.push(e.classAverage == null ? intro : `${intro} The class average is ${pct(e.classAverage)}.`);
  }

  if (e.change != null) {
    const direction = e.change === 0 ? "" : e.change > 0 ? "higher" : "lower";
    paragraphs.push(
      e.change === 0
        ? `${name}'s latest assessment score was the same as the average of the earlier assessments.`
        : `${name}'s latest assessment score was ${points(e.change)} percentage points ${direction} than the average of the earlier assessments.`,
    );
  }

  if (e.absences != null) {
    paragraphs.push(`${name} has ${e.absences} recorded ${plural(e.absences, "absence", "absences")}.`);
  }

  const lowest = e.competencies[0];
  const highest = e.competencies[e.competencies.length - 1];
  if (lowest && highest && lowest !== highest) {
    paragraphs.push(`Among the confirmed competencies, ${name}'s lowest is ${lowest.name} at ${pct(lowest.average)} and the highest is ${highest.name} at ${pct(highest.average)}.`);
  } else if (lowest) {
    paragraphs.push(`${name}'s confirmed competency ${lowest.name} stands at ${pct(lowest.average)}.`);
  }

  return paragraphs.join("\n\n");
}

function learnerFactsFil(e: LearnerReportEvidence) {
  const name = e.learner.name;
  const paragraphs: string[] = [];

  if (e.average != null) {
    const intro = `Ang average ni ${name} sa ${e.assessments.length} kumpirmadong pagtatasa sa ${e.classInfo.name} ay ${pct(e.average)}, ${e.belowBenchmark ? "mas mababa sa" : "nasa o mas mataas sa"} ${e.benchmark}% na benchmark.`;
    paragraphs.push(e.classAverage == null ? intro : `${intro} Ang average ng klase ay ${pct(e.classAverage)}.`);
  }

  if (e.change != null) {
    paragraphs.push(
      e.change === 0
        ? `Pareho ang pinakahuling marka ni ${name} sa average ng mga naunang pagtatasa.`
        : `Ang pinakahuling marka ni ${name} ay ${points(e.change)} puntos na ${e.change > 0 ? "mas mataas" : "mas mababa"} kaysa sa average ng mga naunang pagtatasa.`,
    );
  }

  if (e.absences != null) {
    paragraphs.push(`May ${e.absences} naitalang pagliban si ${name}.`);
  }

  const lowest = e.competencies[0];
  const highest = e.competencies[e.competencies.length - 1];
  if (lowest && highest && lowest !== highest) {
    paragraphs.push(`Sa mga kumpirmadong kasanayan ni ${name}, pinakamababa ang ${lowest.name} (${pct(lowest.average)}) at pinakamataas ang ${highest.name} (${pct(highest.average)}).`);
  } else if (lowest) {
    paragraphs.push(`Ang kumpirmadong kasanayan ni ${name} na ${lowest.name} ay nasa ${pct(lowest.average)}.`);
  }

  return paragraphs.join("\n\n");
}

/** Plain text written straight from the verified numbers. No AI involved. */
export function buildFactsNarrative(evidence: Evidence, language: NarrativeLanguage) {
  if (evidence.kind === "class_performance") {
    return language === "fil" ? classFactsFil(evidence) : classFactsEn(evidence);
  }
  return language === "fil" ? learnerFactsFil(evidence) : learnerFactsEn(evidence);
}

// What the AI is allowed to see. Class reports contain no learner names or codes at all.
// Learner reports contain no name either; the AI writes [Learner] and TeacherCo fills it in.
function buildPayload(evidence: Evidence, notes: string[]) {
  if (evidence.kind === "class_performance") {
    return {
      reportType: evidence.kind,
      class: evidence.classInfo,
      benchmarkPercent: evidence.benchmark,
      learnersInClass: evidence.learnerCount,
      learnersWithConfirmedScores: evidence.scoredLearnerCount,
      assessmentsIncluded: evidence.assessmentCount,
      classAveragePercent: evidence.classAverage,
      learnersBelowBenchmark: evidence.belowBenchmarkCount,
      absenceRuleThreshold: evidence.thresholds.absences,
      learnersMeetingAbsenceRule: evidence.attendanceConcernCount,
      dropRulePercentagePoints: evidence.thresholds.dropPoints,
      learnersMeetingDropRule: evidence.dropCount,
      competencies: evidence.competencies.map((c) => ({
        name: c.name,
        averagePercent: c.average,
        assessmentsMapped: c.assessmentCount,
        learnersBelowBenchmark: c.belowBenchmarkCount,
      })),
    };
  }

  return {
    reportType: evidence.kind,
    class: evidence.classInfo,
    benchmarkPercent: evidence.benchmark,
    learnerAveragePercent: evidence.average,
    classAveragePercent: evidence.classAverage,
    learnerBelowBenchmark: evidence.belowBenchmark,
    assessments: evidence.assessments.map((a) => ({ title: a.title, percent: a.percentage })),
    latestChangePercentagePoints: evidence.change,
    recordedAbsences: evidence.absences,
    competencies: evidence.competencies.map((c) => ({
      name: c.name,
      learnerAveragePercent: c.average,
      classAveragePercent: c.classAverage,
    })),
    ...(notes.length > 0 ? { teacherNotes: notes } : {}),
  };
}

function buildSystemPrompt(evidence: Evidence, language: NarrativeLanguage, hasNotes: boolean) {
  const subject = evidence.kind === "class_performance" ? "a class" : "one learner, referred to only as [Learner]";
  return [
    `You write a short classroom report for a Filipino teacher about ${subject}.`,
    "You receive verified statistics that software already calculated.",
    "Rules:",
    "- Use only the numbers provided and copy them exactly. Never calculate, estimate, round or add numbers.",
    "- Do not invent causes, events, names or recommendations that the data does not support.",
    "- Do not say whether any learner passes or fails. The teacher makes every decision.",
    "- Write 2 to 4 short, plain paragraphs. No lists, headings or markdown.",
    `- Write in ${language === "fil" ? "Filipino" : "English"}.`,
    evidence.kind === "learner_progress"
      ? "- Write [Learner] wherever the learner's name belongs. Do not guess a name."
      : "- Do not mention any individual learner.",
    hasNotes ? "- Teacher notes are background from the teacher. Do not quote them." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function numbersIn(text: string) {
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

/** True when every number in the AI text also appears in the data it was given. */
export function numbersAreGrounded(text: string, payload: unknown) {
  const allowed = new Set<number>();
  for (const value of numbersIn(JSON.stringify(payload))) {
    allowed.add(value);
    allowed.add(Math.round(value));
    allowed.add(Math.round(value * 10) / 10);
  }
  return numbersIn(text).every((value) => allowed.has(value));
}

export async function writeNarrative(
  evidence: Evidence,
  options: { aiEnabled: boolean; language: NarrativeLanguage; notes?: string[] },
): Promise<Narrative> {
  const facts = buildFactsNarrative(evidence, options.language);
  const fallback = (fallbackReason: FallbackReason): Narrative => ({ text: facts, source: "facts", fallbackReason });

  if (!options.aiEnabled) return fallback("ai_off");

  let provider: ReturnType<typeof getAIProvider>;
  try {
    provider = getAIProvider();
  } catch {
    return fallback("not_configured");
  }

  const notes = options.notes ?? [];
  const payload = buildPayload(evidence, notes);

  try {
    const result = await provider.generateText({
      system: buildSystemPrompt(evidence, options.language, notes.length > 0),
      prompt: JSON.stringify(payload, null, 2),
    });

    const text = result.text.trim();
    if (!text || !numbersAreGrounded(text, payload)) return fallback("unverified_numbers");

    const finalText = evidence.kind === "learner_progress" ? text.split("[Learner]").join(evidence.learner.name) : text;
    return { text: finalText, source: "ai", provider: result.provider, model: result.model };
  } catch {
    return fallback("failed");
  }
}