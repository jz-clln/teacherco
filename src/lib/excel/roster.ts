// src/lib/excel/roster.ts
//
// Finds the learner list inside ANY class record layout. It works on plain
// text grids (rows x columns of strings), so it has no ExcelJS dependency and
// is easy to test. Strategy:
//   1. Auto-detect the sheet, name column(s), name format and row range.
//   2. The teacher confirms or corrects every one of those choices in the UI.
//   3. A pasted list goes through the exact same pipeline.

export type Grid = string[][];
export type SheetGrid = { name: string; hidden: boolean; rows: Grid };
export type NameFormat = "surname-first" | "first-last" | "split";
export type Sex = "M" | "F" | "";

export type RosterMapping = {
  sheet: string;
  format: NameFormat;
  /** Column holding the full name (formats "surname-first" and "first-last"). */
  nameCol: number;
  /** Columns used only by format "split". */
  lastCol: number;
  firstCol: number;
  lrnCol: number | null;
  sexCol: number | null;
  /** 0-based, inclusive. */
  firstRow: number;
  lastRow: number;
};

export type RosterRow = {
  key: string;
  /** 1-based row number in the sheet, for display. */
  sourceRow: number;
  lastName: string;
  firstName: string;
  lrn: string;
  sex: Sex;
  flags: string[];
  include: boolean;
};

export type RosterDetection = {
  mapping: RosterMapping | null;
  confidence: "high" | "low" | "none";
};

// ---------------------------------------------------------------- helpers

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const cell = (rows: Grid, r: number, c: number) => rows[r]?.[c] ?? "";
const sheetWidth = (rows: Grid) => rows.reduce((w, r) => Math.max(w, r.length), 0);

export function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** MALE / FEMALE divider rows used by DepEd-style records. */
const SECTION = /^(males?|females?|boys?|girls?|lalaki|babae)[^a-z]*$/i;

/** Header, title and footer words that are never a learner's name. */
const NOT_A_NAME =
  /\b(learners?|students?|names?|pangalan|total|highest|lowest|score|grade|section|teacher|adviser|principal|subject|region|division|district|school|male|female|average|mean|median|rank|remarks|descriptor|examinees|passing|quarter|term|prepared|checked|noted|approved|signature|date|class record|summary|transmut\w*|initial|final|sex|lrn|no)\b/i;

export function isNameLike(value: string): boolean {
  const s = squash(value);
  if (s.length < 3 || s.length > 80) return false;
  if (!/[A-Za-zÀ-ÿ]{2}/.test(s) || /[\d=#@%]/.test(s)) return false;
  if (SECTION.test(s) || NOT_A_NAME.test(s)) return false;
  return s.includes(",") || s.split(" ").length >= 2;
}

function sexFromMarker(s: string): Sex {
  if (/^(females?|girls?|babae)/i.test(s)) return "F";
  if (/^(males?|boys?|lalaki)/i.test(s)) return "M";
  return "";
}

function sexFromCell(s: string): Sex {
  const v = s.trim().toLowerCase();
  if (v === "m" || v === "male") return "M";
  if (v === "f" || v === "female") return "F";
  return "";
}

// -------------------------------------------------------------- name logic

/** "DELA CRUZ" -> "Dela Cruz". Mixed-case input is left alone. */
export function smartCase(s: string): string {
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (!letters || letters !== letters.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/(^|[\s\-'’.])([a-zà-ÿ])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
    .replace(/\b(ii|iii|iv)\b/gi, (m) => m.toUpperCase());
}

const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv)$/i;
const PARTICLE = /^(de|del|dela|delas|delos|la|las|los|san|santa|van|von|ver)$/i;

export function parseName(
  raw: string,
  format: Exclude<NameFormat, "split">,
): { firstName: string; lastName: string; flags: string[] } {
  const text = squash(raw);
  const flags: string[] = [];
  let first = "";
  let last = "";
  const commas = (text.match(/,/g) ?? []).length;

  if (commas > 0) {
    // A comma always means "Surname, First name".
    const at = text.indexOf(",");
    last = text.slice(0, at);
    first = text.slice(at + 1).replace(/,/g, " ");
    if (commas > 1) flags.push("More than one comma. Check the name.");
    if (format === "first-last") flags.push("Has a comma. Check the format.");
  } else {
    const tokens = text.split(" ");
    if (tokens.length < 2) {
      last = text;
      flags.push("Only one name found.");
    } else if (format === "surname-first") {
      last = tokens[0];
      first = tokens.slice(1).join(" ");
      flags.push("No comma. Check where the surname ends.");
    } else {
      let take = 1;
      if (SUFFIX.test(tokens[tokens.length - 1]) && tokens.length > 2) take = 2;
      while (tokens.length - take > 1 && PARTICLE.test(tokens[tokens.length - take - 1])) take++;
      last = tokens.slice(tokens.length - take).join(" ");
      first = tokens.slice(0, tokens.length - take).join(" ");
    }
  }

  return { firstName: smartCase(squash(first)), lastName: smartCase(squash(last)), flags };
}

/** Same key on the client and the server, so duplicates are caught everywhere. */
export function nameKey(first: string, last: string): string {
  const strip = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return `${strip(last)}|${strip(first)}`;
}

// -------------------------------------------------------------- extraction

export function extractRoster(rows: Grid, m: RosterMapping): RosterRow[] {
  const out: RosterRow[] = [];
  const seenNames = new Set<string>();
  const seenLrns = new Set<string>();
  let section: Sex = "";
  const end = Math.min(m.lastRow, rows.length - 1);

  // The MALE / FEMALE divider usually sits just above the first learner.
  for (let r = Math.max(0, m.firstRow) - 1; r >= Math.max(0, m.firstRow - 5); r--) {
    const lead = squash(cell(rows, r, m.format === "split" ? m.lastCol : m.nameCol));
    if (SECTION.test(lead)) {
      section = sexFromMarker(lead);
      break;
    }
  }

  for (let r = Math.max(0, m.firstRow); r <= end; r++) {
    const flags: string[] = [];
    let first = "";
    let last = "";
    let looksLikeName: boolean;

    if (m.format === "split") {
      const l = squash(cell(rows, r, m.lastCol));
      const f = squash(cell(rows, r, m.firstCol));
      const lead = l || f;
      if (!lead) continue;
      if (!(l && f) && SECTION.test(lead)) {
        section = sexFromMarker(lead);
        continue;
      }
      if (NOT_A_NAME.test(l) || NOT_A_NAME.test(f)) continue;
      last = smartCase(l);
      first = smartCase(f);
      looksLikeName = /[A-Za-zÀ-ÿ]{2}/.test(l + f) && !/\d/.test(l + f);
    } else {
      const raw = squash(cell(rows, r, m.nameCol));
      if (!raw) continue;
      if (SECTION.test(raw)) {
        section = sexFromMarker(raw);
        continue;
      }
      if (NOT_A_NAME.test(raw)) continue;
      const parsed = parseName(raw, m.format);
      first = parsed.firstName;
      last = parsed.lastName;
      flags.push(...parsed.flags);
      looksLikeName = isNameLike(raw);
    }

    if (!looksLikeName) flags.push("Does not look like a name.");
    if (!first) flags.push("Missing first name.");
    if (!last) flags.push("Missing surname.");

    const lrnRaw = m.lrnCol != null ? squash(cell(rows, r, m.lrnCol)) : "";
    const lrn = lrnRaw.replace(/\D/g, "");
    if (lrn && lrn.length !== 12) flags.push("LRN is not 12 digits.");

    const sex = (m.sexCol != null ? sexFromCell(cell(rows, r, m.sexCol)) : "") || section;

    const key = nameKey(first, last);
    if (first && last && seenNames.has(key)) flags.push("Duplicate name in this file.");
    if (lrn && seenLrns.has(lrn)) flags.push("Duplicate LRN in this file.");
    seenNames.add(key);
    if (lrn) seenLrns.add(lrn);

    const blocked = flags.some((f) => /^(Duplicate|Does not look|Missing)/.test(f));
    out.push({
      key: `${m.sheet}:${r}`,
      sourceRow: r + 1,
      lastName: last,
      firstName: first,
      lrn,
      sex,
      flags,
      include: !blocked,
    });
  }
  return out;
}

// --------------------------------------------------------------- detection

type Candidate = { mapping: RosterMapping; count: number; score: number };

function nameLikeRows(rows: Grid, col: number): number[] {
  const out: number[] = [];
  for (let r = 0; r < rows.length; r++) if (isNameLike(cell(rows, r, col))) out.push(r);
  return out;
}

/** Drops stray one-off matches (titles, signatures) at either end of a column. */
function trimRun(list: number[]): [number, number] | null {
  if (list.length < 3) return null;
  const a = list.findIndex((r, i) => i + 2 < list.length && list[i + 2] - r <= 6);
  let b = -1;
  for (let i = list.length - 1; i >= 2; i--) {
    if (list[i] - list[i - 2] <= 6) {
      b = i;
      break;
    }
  }
  if (a < 0 || b < 0 || b < a) return null;
  return [list[a], list[b]];
}

function detectAux(rows: Grid, first: number, last: number, exclude: number[], count: number) {
  let lrnCol: number | null = null;
  let sexCol: number | null = null;
  let bestLrn = 0;
  let bestSex = 0;
  const width = sheetWidth(rows);
  for (let c = 0; c < width; c++) {
    if (exclude.includes(c)) continue;
    let lrn = 0;
    let sex = 0;
    for (let r = first; r <= last; r++) {
      const v = squash(cell(rows, r, c));
      if (/^\d{10,13}$/.test(v)) lrn++;
      else if (/^(m|f|male|female)$/i.test(v)) sex++;
    }
    if (lrn > bestLrn) {
      bestLrn = lrn;
      lrnCol = c;
    }
    if (sex > bestSex) {
      bestSex = sex;
      sexCol = c;
    }
  }
  if (bestLrn < Math.max(3, count * 0.5)) lrnCol = null;
  if (bestSex < Math.max(3, count * 0.7)) sexCol = null;
  return { lrnCol, sexCol };
}

function guessFormat(values: string[]): Exclude<NameFormat, "split"> {
  const names = values.filter(Boolean);
  const commas = names.filter((n) => n.includes(",")).length;
  return commas > 0 && commas >= names.length / 2 ? "surname-first" : "first-last";
}

function scanSheet(sheet: SheetGrid): Candidate | null {
  const rows = sheet.rows;
  const width = sheetWidth(rows);
  const found: Candidate[] = [];

  // A) Separate "Last name" / "First name" columns, found by their headers.
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    let lastCol = -1;
    let firstCol = -1;
    for (let c = 0; c < width; c++) {
      const v = squash(cell(rows, r, c));
      if (/^(last\s*name|surname|family\s*name|apelyido)\b/i.test(v)) lastCol = c;
      if (/^(first\s*name|given\s*name)\b/i.test(v)) firstCol = c;
    }
    if (lastCol < 0 || firstCol < 0 || lastCol === firstCol) continue;
    const hits: number[] = [];
    for (let i = r + 1; i < rows.length; i++) {
      const l = squash(cell(rows, i, lastCol));
      const f = squash(cell(rows, i, firstCol));
      if (l && f && /[A-Za-zÀ-ÿ]{2}/.test(l + f) && !/\d/.test(l + f) && !NOT_A_NAME.test(l) && !NOT_A_NAME.test(f)) {
        hits.push(i);
      }
    }
    if (hits.length >= 3) {
      const [first, last] = [hits[0], hits[hits.length - 1]];
      const aux = detectAux(rows, first, last, [lastCol, firstCol], hits.length);
      found.push({
        count: hits.length,
        score: hits.length + 5,
        mapping: { sheet: sheet.name, format: "split", nameCol: lastCol, lastCol, firstCol, ...aux, firstRow: first, lastRow: last },
      });
    }
    break;
  }

  // B) One column with full names.
  let bestCol = -1;
  let bestRows: number[] = [];
  for (let c = 0; c < width; c++) {
    const list = nameLikeRows(rows, c);
    if (list.length > bestRows.length) {
      bestCol = c;
      bestRows = list;
    }
  }
  const run = bestCol >= 0 ? trimRun(bestRows) : null;
  if (run) {
    const inRange = bestRows.filter((r) => r >= run[0] && r <= run[1]);
    const values = inRange.map((r) => cell(rows, r, bestCol));
    const aux = detectAux(rows, run[0], run[1], [bestCol], inRange.length);
    found.push({
      count: inRange.length,
      score: inRange.length,
      mapping: {
        sheet: sheet.name,
        format: guessFormat(values),
        nameCol: bestCol,
        lastCol: bestCol,
        firstCol: bestCol + 1,
        ...aux,
        firstRow: run[0],
        lastRow: run[1],
      },
    });
  }

  return found.sort((a, b) => b.score - a.score)[0] ?? null;
}

const SHEET_HINT = /input|learner|student|sf1|master|enrol|roster|names/i;

/** Last resort when nothing was detected: the teacher fixes it in the UI. */
export function defaultMapping(sheet: SheetGrid): RosterMapping {
  const width = sheetWidth(sheet.rows);
  let best = 0;
  let bestN = -1;
  for (let c = 0; c < width; c++) {
    const n = sheet.rows.filter((r) => /[A-Za-zÀ-ÿ]{2}/.test(r[c] ?? "") && !NOT_A_NAME.test(r[c] ?? "")).length;
    if (n > bestN) {
      bestN = n;
      best = c;
    }
  }
  return {
    sheet: sheet.name,
    format: guessFormat(sheet.rows.map((r) => r[best] ?? "")),
    nameCol: best,
    lastCol: best,
    firstCol: best + 1,
    lrnCol: null,
    sexCol: null,
    firstRow: 0,
    lastRow: Math.max(0, sheet.rows.length - 1),
  };
}

/** Best guess for one sheet (used when the teacher switches sheets). */
export function suggestMapping(sheet: SheetGrid): RosterMapping {
  return scanSheet(sheet)?.mapping ?? defaultMapping(sheet);
}

export function detectRoster(sheets: SheetGrid[]): RosterDetection {
  const pick = (list: SheetGrid[]) => {
    let best: Candidate | null = null;
    for (const sheet of list) {
      const c = scanSheet(sheet);
      if (!c) continue;
      const score = c.score + (SHEET_HINT.test(sheet.name) ? 15 : 0);
      if (!best || score > best.score) best = { ...c, score };
    }
    return best;
  };
  const best = pick(sheets.filter((s) => !s.hidden)) ?? pick(sheets.filter((s) => s.hidden));
  if (!best) return { mapping: null, confidence: "none" };
  return { mapping: best.mapping, confidence: best.count >= 5 ? "high" : "low" };
}

/** Text pasted from Excel/Word/anywhere becomes a one-sheet grid (tabs split columns). */
export function gridFromPaste(text: string): SheetGrid {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.split("\t").map(squash))
    .filter((r) => r.some(Boolean));
  return { name: "Pasted list", hidden: false, rows };
}

// ------------------------------------------------------- column pickers (UI)

export function columnOptions(sheet: SheetGrid, fromRow: number, selected: Array<number | null>) {
  const width = Math.min(sheetWidth(sheet.rows), 80);
  const out: { value: string; label: string }[] = [];
  for (let c = 0; c < width; c++) {
    let sample = "";
    for (let r = Math.max(0, fromRow); r < Math.min(sheet.rows.length, fromRow + 60); r++) {
      const v = squash(cell(sheet.rows, r, c));
      if (v) {
        sample = v;
        break;
      }
    }
    if (!sample && !selected.includes(c)) continue;
    out.push({
      value: String(c),
      label: `Column ${colLetter(c)}${sample ? `: ${sample.slice(0, 28)}` : ""}`,
    });
  }
  return out;
}