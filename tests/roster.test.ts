import { describe, expect, it } from "vitest";
import {
  detectRoster,
  extractRoster,
  gridFromPaste,
  nameKey,
  parseName,
  smartCase,
  suggestMapping,
  type SheetGrid,
} from "@/lib/excel/roster";

const sheet = (name: string, rows: (string | number)[][], hidden = false): SheetGrid => ({
  name,
  hidden,
  rows: rows.map((r) => r.map((v) => String(v))),
});

// Layout A: names in column B as "SURNAME, FIRST M.", MALE/FEMALE dividers, blank numbered rows.
const MALE = ["ANGELES, ANDRIE C.", "AVILA, VON CONRAD GABRIEL", "BONGALONTA, CJ P.", "CADELIÑA, ACHILLES ASHER C."];
const FEMALE = ["ALMONTE, MICHAELA P.", "AUSTRIA, STACEY P.", "SAHAGUN ANGEL CHELSEA M.", "SALAS, ELOIDA D."];

function layoutA(): SheetGrid {
  const rows: (string | number)[][] = [
    ["Class Record"],
    [],
    ["", "REGION", "", "", "V"],
    ["", "SCHOOL NAME", "", "", "NATO ELEMENTARY SCHOOL"],
    ["", "LEARNERS' NAMES"],
    ["", "HIGHEST POSSIBLE SCORE"],
    ["", "MALE "],
    ...MALE.map((n, i) => [i + 1, n]),
    [5, ""],
    [6, ""],
    ["", "FEMALE "],
    ...FEMALE.map((n, i) => [i + 1, n]),
    [5, ""],
  ];
  return sheet("INPUT", rows);
}

describe("detectRoster", () => {
  it("finds the learner sheet and column in a DepEd-style class record", () => {
    const termSheet = sheet("TERM1", [
      ["", "LEARNERS' NAMES", "WRITTEN WORKS (20%)"],
      ["", "HIGHEST POSSIBLE SCORE", 10],
      ["1", "AQUINO, ARZEL V.", 5],
      ["2", "BASILLA, JACOB T.", 6],
      ["3", "CABARLES, DANIEL M.", 5],
    ]);
    const det = detectRoster([termSheet, layoutA()]);
    expect(det.mapping?.sheet).toBe("INPUT");
    expect(det.mapping?.nameCol).toBe(1);
    expect(det.mapping?.format).toBe("surname-first");
    expect(det.confidence).toBe("high");
  });

  it("ignores hidden sheets when a visible one has learners", () => {
    const hidden = sheet("Helper", layoutA().rows, true);
    const visible = sheet("Class list", [["1", "Juan Dela Cruz"], ["2", "Maria Santos"], ["3", "Pedro Reyes"]]);
    expect(detectRoster([hidden, visible]).mapping?.sheet).toBe("Class list");
  });

  it("reads separate surname and first name columns", () => {
    const s = sheet("SF1", [
      ["No.", "LRN", "Last Name", "First Name", "Sex"],
      [1, "123456789012", "DELA CRUZ", "JUAN", "M"],
      [2, "123456789013", "SANTOS", "MARIA", "F"],
      [3, "123456789014", "REYES", "PEDRO", "M"],
    ]);
    const det = detectRoster([s]);
    expect(det.mapping?.format).toBe("split");
    const rows = extractRoster(s.rows, det.mapping!);
    expect(rows.map((r) => [r.lastName, r.firstName, r.lrn, r.sex])).toEqual([
      ["Dela Cruz", "Juan", "123456789012", "M"],
      ["Santos", "Maria", "123456789013", "F"],
      ["Reyes", "Pedro", "123456789014", "M"],
    ]);
  });

  it("returns no mapping when the sheet has no names", () => {
    expect(detectRoster([sheet("Empty", [["a"], ["1", "2"]])]).mapping).toBeNull();
  });

  it("detects an LRN column", () => {
    const s = sheet("Input data", [
      ["No.", "LRN", "LEARNERS' NAMES", "SEX"],
      ["", "", "MALE", ""],
      [1, "100000000001", "DELA CRUZ, JUAN A.", "M"],
      [2, "100000000002", "REYES, PEDRO B.", "M"],
      [3, "100000000003", "SANTOS, JOSE C.", "M"],
      ["", "", "FEMALE", ""],
      [1, "100000000004", "LIM, ANA D.", "F"],
    ]);
    const m = detectRoster([s]).mapping!;
    expect(m.lrnCol).toBe(1);
    expect(m.sexCol).toBe(3);
  });
});

describe("extractRoster", () => {
  it("skips placeholders and dividers, assigns sex, and flags odd names", () => {
    const s = layoutA();
    const rows = extractRoster(s.rows, suggestMapping(s));
    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({ lastName: "Angeles", firstName: "Andrie C.", sex: "M", include: true });
    expect(rows[3]).toMatchObject({ lastName: "Cadeliña", sex: "M" });
    expect(rows[4]).toMatchObject({ lastName: "Almonte", sex: "F" });
    const odd = rows.find((r) => r.lastName === "Sahagun")!;
    expect(odd.firstName).toBe("Angel Chelsea M.");
    expect(odd.flags.join(" ")).toMatch(/No comma/);
    expect(odd.include).toBe(true);
  });

  it("unchecks duplicates inside the file", () => {
    const s = sheet("List", [["1", "REYES, PEDRO"], ["2", "SANTOS, ANA"], ["3", "REYES, PEDRO"], ["4", "LIM, JOSE"]]);
    const rows = extractRoster(s.rows, suggestMapping(s));
    const dup = rows.filter((r) => r.flags.some((f) => f.startsWith("Duplicate")));
    expect(dup).toHaveLength(1);
    expect(dup[0].include).toBe(false);
  });

  it("flags LRNs that are not 12 digits", () => {
    const s = sheet("List", [["1", "REYES, PEDRO", "12345"]]);
    const m = { ...suggestMapping(s), lrnCol: 2, firstRow: 0, lastRow: 0 };
    expect(extractRoster(s.rows, m)[0].flags).toContain("LRN is not 12 digits.");
  });
});

describe("parseName", () => {
  it("handles surname-first with or without a space after the comma", () => {
    expect(parseName("GEREMILLO,PRINCE JOHN NIEL C.", "surname-first")).toMatchObject({
      lastName: "Geremillo",
      firstName: "Prince John Niel C.",
    });
  });

  it("keeps surname particles and suffixes together in first-last mode", () => {
    expect(parseName("Maria Clara Dela Cruz", "first-last")).toMatchObject({ firstName: "Maria Clara", lastName: "Dela Cruz" });
    expect(parseName("Juan Santos Jr.", "first-last")).toMatchObject({ firstName: "Juan", lastName: "Santos Jr." });
  });

  it("treats a comma as surname-first even in first-last mode, with a warning", () => {
    const p = parseName("Cruz, Juan", "first-last");
    expect(p).toMatchObject({ lastName: "Cruz", firstName: "Juan" });
    expect(p.flags.length).toBeGreaterThan(0);
  });
});

describe("helpers", () => {
  it("title-cases ALL CAPS names but leaves mixed case alone", () => {
    expect(smartCase("DE VERGARA")).toBe("De Vergara");
    expect(smartCase("CADELIÑA")).toBe("Cadeliña");
    expect(smartCase("McDonald")).toBe("McDonald");
  });

  it("builds the same duplicate key regardless of case, accents and punctuation", () => {
    expect(nameKey("Achilles Asher C.", "Cadeliña")).toBe(nameKey("ACHILLES ASHER C", "CADELINA"));
  });

  it("turns pasted text (with tabs) into a detectable grid", () => {
    const pasted = "1\tDELA CRUZ, JUAN\n2\tSANTOS, MARIA\n3\tREYES, PEDRO\n";
    const det = detectRoster([gridFromPaste(pasted)]);
    expect(det.mapping?.nameCol).toBe(1);
    expect(det.mapping?.format).toBe("surname-first");
  });
});