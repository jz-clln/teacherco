// tests/reports-evidence.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildClassReportEvidence,
  buildCompetencyScores,
  buildLearnerReportEvidence,
  type ReportInput,
  type ReportScore,
} from "../src/lib/evidence/reports";
import { buildFactsNarrative, numbersAreGrounded, writeNarrative } from "../src/lib/ai/report-narrative";

function score(learnerId: string, assessmentId: string, sortKey: string, earned: number, possible: number): ReportScore {
  return { learnerId, assessmentId, assessmentTitle: assessmentId, sortKey, earned, possible };
}

const input: ReportInput = {
  classInfo: { name: "Grade 6 Einstein", subject: "Mathematics", gradeLevel: "Grade 6", schoolYear: "2026–2027" },
  benchmark: 75,
  thresholds: { absences: 5, dropPoints: 10 },
  learners: [
    { id: "A", name: "Ana Reyes" },
    { id: "B", name: "Ben Cruz" },
    { id: "C", name: "Carla Dizon" },
  ],
  scores: [
    score("A", "a1", "2026-08-01", 9, 10),
    score("B", "a1", "2026-08-01", 5, 10),
    score("C", "a1", "2026-08-01", 8, 10),
    score("A", "a2", "2026-09-01", 5, 10),
    score("B", "a2", "2026-09-01", 6, 10),
    score("C", "a2", "2026-09-01", 8, 10),
  ],
  attendance: [
    ...Array.from({ length: 5 }, () => ({ learnerId: "A", status: "absent" as const })),
    { learnerId: "B", status: "absent" as const },
  ],
  competencies: [
    { id: "c1", name: "Fractions" },
    { id: "c2", name: "Decimals" },
  ],
  competencyScores: [
    { competencyId: "c1", learnerId: "A", assessmentId: "a1", earned: 3, possible: 5 },
    { competencyId: "c1", learnerId: "B", assessmentId: "a1", earned: 2, possible: 5 },
    { competencyId: "c1", learnerId: "C", assessmentId: "a1", earned: 5, possible: 5 },
    { competencyId: "c2", learnerId: "A", assessmentId: "a1", earned: 4, possible: 5 },
    { competencyId: "c2", learnerId: "B", assessmentId: "a1", earned: 5, possible: 5 },
  ],
};

describe("class report evidence", () => {
  const evidence = buildClassReportEvidence(input);

  it("calculates the headline numbers", () => {
    expect(evidence.classAverage).toBe(68.3);
    expect(evidence.scoredLearnerCount).toBe(3);
    expect(evidence.assessmentCount).toBe(2);
    expect(evidence.belowBenchmarkCount).toBe(2);
  });

  it("applies the teacher's absence and drop rules", () => {
    expect(evidence.attendanceConcernCount).toBe(1);
    expect(evidence.dropCount).toBe(1);
    const ana = evidence.learners.find((l) => l.id === "A");
    expect(ana?.flags).toEqual(["below_benchmark", "absences", "drop"]);
    expect(ana?.change).toBe(-40);
  });

  it("ranks competencies from weakest to strongest", () => {
    expect(evidence.competencies.map((c) => [c.name, c.average, c.belowBenchmarkCount])).toEqual([
      ["Fractions", 66.7, 2],
      ["Decimals", 90, 0],
    ]);
  });

  it("reports no attendance concern count when nothing was recorded", () => {
    expect(buildClassReportEvidence({ ...input, attendance: [] }).attendanceConcernCount).toBeNull();
  });
});

describe("learner report evidence", () => {
  it("summarizes one learner against the class", () => {
    const evidence = buildLearnerReportEvidence(input, "A");
    expect(evidence?.average).toBe(70);
    expect(evidence?.classAverage).toBe(68.3);
    expect(evidence?.belowBenchmark).toBe(true);
    expect(evidence?.change).toBe(-40);
    expect(evidence?.absences).toBe(5);
    expect(evidence?.competencies[0]).toMatchObject({ name: "Fractions", average: 60, classAverage: 66.7 });
  });

  it("returns null for a learner who is not in the class", () => {
    expect(buildLearnerReportEvidence(input, "Z")).toBeNull();
  });
});

describe("competency scores", () => {
  it("adds item points to every competency the item is mapped to", () => {
    const items = new Map([
      ["i1", { maxPoints: 2, competencyIds: ["c1", "c2"] }],
      ["i2", { maxPoints: 3, competencyIds: ["c1"] }],
    ]);
    const answers = [
      { itemId: "i1", learnerId: "L", assessmentId: "a1", points: 1 },
      { itemId: "i2", learnerId: "L", assessmentId: "a1", points: 3 },
      { itemId: "unmapped", learnerId: "L", assessmentId: "a1", points: 9 },
    ];
    const result = buildCompetencyScores(answers, items);
    expect(result.find((r) => r.competencyId === "c1")).toMatchObject({ earned: 4, possible: 5 });
    expect(result.find((r) => r.competencyId === "c2")).toMatchObject({ earned: 1, possible: 2 });
  });
});

describe("narrative", () => {
  const evidence = buildClassReportEvidence(input);

  it("writes a facts-only summary from the verified numbers", () => {
    const text = buildFactsNarrative(evidence, "en");
    expect(text).toContain("68.3%");
    expect(text).toContain("2 of 3 learners are below the 75% benchmark");
  });

  it("falls back to facts when AI is off or not connected", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect((await writeNarrative(evidence, { aiEnabled: false, language: "en" })).fallbackReason).toBe("ai_off");
    const unconnected = await writeNarrative(evidence, { aiEnabled: true, language: "en" });
    expect(unconnected.source).toBe("facts");
    expect(unconnected.fallbackReason).toBe("not_configured");
  });

  it("rejects AI text that contains a number the data does not contain", () => {
    const payload = { classAveragePercent: 78.4, learnersBelowBenchmark: 8 };
    expect(numbersAreGrounded("The class average is 78.4% and 8 learners are below.", payload)).toBe(true);
    expect(numbersAreGrounded("About 9 learners are below.", payload)).toBe(false);
  });
});

describe("narrative with OpenAI", () => {
  const evidence = buildClassReportEvidence(input);

  function stubOpenAI(text: string) {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ status: "completed", model: "gpt-6-luna", output: [{ type: "message", content: [{ type: "output_text", text }] }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps AI text whose numbers match the data", async () => {
    stubOpenAI("The class average is 68.3% and 2 of 3 learners are below the 75% benchmark.");
    const result = await writeNarrative(evidence, { aiEnabled: true, language: "en" });
    expect(result).toMatchObject({ source: "ai", provider: "openai", model: "gpt-6-luna" });
  });

  it("discards AI text that contains an invented number", async () => {
    stubOpenAI("The class average is 71.2%.");
    const result = await writeNarrative(evidence, { aiEnabled: true, language: "en" });
    expect(result.source).toBe("facts");
    expect(result.fallbackReason).toBe("unverified_numbers");
    expect(result.text).toContain("68.3%");
  });

  it("falls back when the AI request fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const result = await writeNarrative(evidence, { aiEnabled: true, language: "en" });
    expect(result.fallbackReason).toBe("failed");
  });

  it("never sends learner names to OpenAI, and puts the name back afterward", async () => {
    const fetchMock = stubOpenAI("[Learner]'s average is 70% and the class average is 68.3%.");
    const learnerEvidence = buildLearnerReportEvidence(input, "A")!;

    const result = await writeNarrative(learnerEvidence, { aiEnabled: true, language: "en" });

    const sent = String(fetchMock.mock.calls[0][1]?.body);
    expect(sent).not.toContain("Ana Reyes");
    expect(sent).not.toContain("Ben Cruz");
    expect(result.text).toBe("Ana Reyes's average is 70% and the class average is 68.3%.");

    await writeNarrative(evidence, { aiEnabled: true, language: "en" });
    const classSent = String(fetchMock.mock.calls[1][1]?.body);
    for (const name of ["Ana Reyes", "Ben Cruz", "Carla Dizon"]) expect(classSent).not.toContain(name);
  });
});