import { describe, expect, it } from "vitest";
import { belowBenchmark, classAverage } from "@/lib/evidence/metrics";

describe("evidence metrics", () => {
  it("calculates class average without inventing missing scores", () => {
    const result = classAverage([
      { learnerId: "a", earned: 8, possible: 10 },
      { learnerId: "b", earned: 6, possible: 10 },
      { learnerId: "c", earned: null, possible: 10 },
    ]);
    expect(result).toBe(70);
  });

  it("filters below benchmark deterministically", () => {
    const result = belowBenchmark([
      { learnerId: "a", earned: 8, possible: 10 },
      { learnerId: "b", earned: 6, possible: 10 },
    ], 75);
    expect(result.map((item) => item.learnerId)).toEqual(["b"]);
  });
});
