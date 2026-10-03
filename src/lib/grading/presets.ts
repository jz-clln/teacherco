import type { GradingConfig } from "./deped";

const TRANSMUTATION_MINS = [
  0, 40, 43, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 73, 75, 76, 77, 78,
  79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97.5, 99.5,
] as const;

const DESCRIPTORS = [
  { min: 0, label: "Emerging" },
  { min: 65, label: "Developing" },
  { min: 75, label: "Connecting" },
  { min: 80, label: "Benchmarking" },
  { min: 90, label: "Advancing" },
] as const;

export function defaultGradingConfig(subject: string): GradingConfig {
  const normalizedSubject = subject.trim().toLocaleUpperCase();
  const weights = /\b(EPP|TLE)\b|TECHNOLOGY AND LIVELIHOOD|HOME ECONOMICS|PANTAHANAN|PANGKABUHAYAN/.test(normalizedSubject)
    ? { written_work: 0.2, performance_task: 0.6, assessment: 0.2 }
    : { written_work: 0.2, performance_task: 0.5, assessment: 0.3 };

  return {
    weights,
    transmutation: TRANSMUTATION_MINS.map((min, index) => ({
      min,
      max: TRANSMUTATION_MINS[index + 1] == null ? 100 : Math.round((TRANSMUTATION_MINS[index + 1] - 0.01) * 100) / 100,
      grade: 60 + index,
    })),
    descriptors: DESCRIPTORS.map((row) => ({ ...row })),
  };
}