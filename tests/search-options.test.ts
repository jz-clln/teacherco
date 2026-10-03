// tests/search-options.test.ts

import { describe, expect, it } from "vitest";
import { filterOptions } from "@/lib/search-options";

const learners = [
  { value: "1", label: "Achilles Asher C. Cadeliña" },
  { value: "2", label: "Aldrin Lanuzo" },
  { value: "3", label: "Michaela P. Almonte" },
];

describe("filterOptions", () => {
  it("returns everything when nothing is typed", () => {
    expect(filterOptions(learners, "")).toHaveLength(3);
    expect(filterOptions(learners, "   ")).toHaveLength(3);
  });

  it("ignores case and accents", () => {
    expect(filterOptions(learners, "CADELINA").map((l) => l.value)).toEqual(["1"]);
  });

  it("matches part of a first or last name", () => {
    expect(filterOptions(learners, "ald").map((l) => l.value)).toEqual(["2"]);
    expect(filterOptions(learners, "monte").map((l) => l.value)).toEqual(["3"]);
  });

  it("matches words in any order", () => {
    expect(filterOptions(learners, "lanuzo aldrin").map((l) => l.value)).toEqual(["2"]);
  });

  it("ignores dots and commas", () => {
    expect(filterOptions(learners, "c. cadelina").map((l) => l.value)).toEqual(["1"]);
    expect(filterOptions(learners, "Almonte, Michaela").map((l) => l.value)).toEqual(["3"]);
  });

  it("returns nothing when no learner matches", () => {
    expect(filterOptions(learners, "zzz")).toEqual([]);
  });
});