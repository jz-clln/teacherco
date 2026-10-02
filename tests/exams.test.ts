import { describe, expect, it } from "vitest";
import { analyze, formatItemRange } from "@/lib/exams/analytics";
import { parseAnswerKeyText } from "@/lib/exams/key-parser";
import { normalizeAnswer, scoreAnswers } from "@/lib/exams/scoring";

const items = [1, 2, 3, 4].map((n) => ({ id: `i${n}`, itemNumber: n, expected: "ABCD"[n - 1] ?? "A", points: 1 }));

describe("scoreAnswers", () => {
  it("scores correct answers and treats blanks as zero", () => {
    const r = scoreAnswers(items, { 1: "A", 2: "B", 3: "", 4: "A" });
    expect(r.score).toBe(2);
    expect(r.maxScore).toBe(4);
    expect(r.percent).toBe(50);
  });
  it("is case-insensitive and honors item points", () => {
    const r = scoreAnswers([{ id: "x", itemNumber: 1, expected: "B", points: 2.5 }], { 1: "b" });
    expect(r.score).toBe(2.5);
  });
  it("scores a custom point value across an item range", () => {
    const weighted = [45, 46, 47, 48, 49, 50].map((itemNumber) => ({
      id: `i${itemNumber}`,
      itemNumber,
      expected: "A",
      points: itemNumber >= 46 ? 5 : 1,
    }));
    const r = scoreAnswers(weighted, { 45: "A", 46: "A" });
    expect(r.score).toBe(6);
    expect(r.maxScore).toBe(26);
  });
});

describe("normalizeAnswer", () => {
  it("accepts allowed, blank, rejects others", () => {
    expect(normalizeAnswer(" b ", ["A", "B"])).toBe("B");
    expect(normalizeAnswer("", ["A", "B"])).toBe("");
    expect(normalizeAnswer("Z", ["A", "B"])).toBeNull();
  });
});

describe("parseAnswerKeyText", () => {
  const abcd = ["A", "B", "C", "D"];
  it("parses spoken English", () => {
    const r = parseAnswerKeyText("Number one B. Number two C. Number three A, number four D.", abcd, 4);
    expect(r.answers).toEqual({ 1: "B", 2: "C", 3: "A", 4: "D" });
    expect(r.warnings).toEqual([]);
  });
  it("parses compact digits", () => {
    expect(parseAnswerKeyText("1B2C3A4D", abcd, 4).answers).toEqual({ 1: "B", 2: "C", 3: "A", 4: "D" });
  });
  it("handles spelled letters and tens", () => {
    const r = parseAnswerKeyText("twenty one bee", abcd, 30);
    expect(r.answers).toEqual({ 21: "B" });
  });
  it("parses true or false in English and Filipino", () => {
    const r = parseAnswerKeyText("1 true 2 mali 3 T", ["T", "F"], 3);
    expect(r.answers).toEqual({ 1: "T", 2: "F", 3: "T" });
  });
  it("warns instead of guessing", () => {
    const r = parseAnswerKeyText("1 B 2 3 C 9 A", abcd, 4);
    expect(r.answers).toEqual({ 1: "B", 3: "C" });
    expect(r.warnings.length).toBeGreaterThanOrEqual(2);
  });
});

describe("analyze", () => {
  const subs = Array.from({ length: 6 }, (_, k) => ({
    learnerId: `l${k}`,
    score: k < 2 ? 4 : 1,
    maxScore: 4,
    answers: Object.fromEntries(
      items.map((it) => [it.id, k < 2 ? { given: it.expected, isCorrect: true } : { given: it.itemNumber === 1 ? "A" : "D", isCorrect: it.itemNumber === 1 }]),
    ),
  }));
  const comp = items.map((i) => ({ ...i, competencies: i.itemNumber <= 2 ? ["Fractions"] : [] }));

  it("computes class stats and flags gaps", () => {
    const r = analyze(comp, subs, { benchmark: 75, rosterSize: 8 });
    expect(r.classStats.checked).toBe(6);
    expect(r.classStats.belowBenchmark).toBe(4);
    expect(r.gaps.map((g) => g.itemNumber)).toContain(2);
    expect(r.competencyStats[0]?.name).toBe("Fractions");
  });
});

describe("formatItemRange", () => {
  it("collapses runs", () => {
    expect(formatItemRange([1, 2, 3, 7, 9, 10])).toBe("1–3, 7, 9–10");
  });
});
