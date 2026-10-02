//src\lib\ai\schemas.ts - Jabez

import { z } from "zod";

export const LearnerEvidenceSchema = z.object({
  learnerId: z.string().min(1),
  learnerName: z.string().min(1).optional(),
  average: z.number().nullable().optional(),
  absences: z.number().int().nonnegative().nullable().optional(),
  missingActivities: z.number().int().nonnegative().nullable().optional(),
  notes: z.array(z.string()).default([]),
});

export const ClassEvidenceSchema = z.object({
  classId: z.string().min(1),
  className: z.string().min(1),
  classAverage: z.number().nullable(),
  benchmark: z.number().nullable(),
  weakestCompetency: z.object({ name: z.string(), average: z.number(), assessmentCount: z.number().int().nonnegative() }).nullable(),
  learners: z.array(LearnerEvidenceSchema).max(100),
});

export type ClassEvidence = z.infer<typeof ClassEvidenceSchema>;
