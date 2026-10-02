// src/lib/ai/privacy.ts -Jabez

import type { ClassEvidence } from "./schemas";

type PseudonymizeOptions = {
  /** Teacher notes are free text and can contain names, so they are excluded unless the teacher opts in. */
  includeNotes?: boolean;
};

export function buildPseudonymizedEvidence(evidence: ClassEvidence, { includeNotes = false }: PseudonymizeOptions = {}) {
  return {
    ...evidence,
    learners: evidence.learners.map((learner, index) => ({
      learnerId: `learner_${String(index + 1).padStart(3, "0")}`,
      average: learner.average,
      absences: learner.absences,
      missingActivities: learner.missingActivities,
      ...(includeNotes ? { notes: learner.notes } : {}),
    })),
  };
}