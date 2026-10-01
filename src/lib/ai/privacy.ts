import type { ClassEvidence } from "./schemas";

export function buildPseudonymizedEvidence(evidence: ClassEvidence) {
  return {
    ...evidence,
    learners: evidence.learners.map((learner, index) => ({
      learnerId: `learner_${String(index + 1).padStart(3, "0")}`,
      average: learner.average,
      absences: learner.absences,
      missingActivities: learner.missingActivities,
      notes: learner.notes,
    })),
  };
}
