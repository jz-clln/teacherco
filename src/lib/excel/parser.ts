// src/lib/excel/parser.ts

import ExcelJS from "exceljs";
import { detectClassInfo, type ClassInfo } from "@/lib/excel/class-info";
import { detectGradeSheet, type GradeSheet } from "@/lib/excel/grades";
import { detectRoster, type RosterDetection, type SheetGrid } from "@/lib/excel/roster";
import type { DescriptorRow, TransmutationRow } from "@/lib/grading/deped";

export type SheetPreview = {
  name: string;
  rowCount: number;
  columnCount: number;
  sampleRows: unknown[][];
};

export type WorkbookPreview = {
  fileName: string;
  sheets: SheetPreview[];
};

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value == null) return "";
  if (typeof value === "object") {
    if ("result" in value && value.result != null) return value.result;
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
    return JSON.stringify(value);
  }
  return value;
}

export async function parseWorkbookPreview(file: File): Promise<WorkbookPreview> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Please choose an .xlsx workbook.");
  const bytes = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);

  return {
    fileName: file.name,
    sheets: workbook.worksheets.map((sheet) => {
      const sampleRows: unknown[][] = [];
      const limit = Math.min(sheet.actualRowCount || sheet.rowCount, 8);
      for (let r = 1; r <= limit; r++) {
        const row = sheet.getRow(r);
        const values: unknown[] = [];
        const width = Math.min(sheet.actualColumnCount || sheet.columnCount, 12);
        for (let c = 1; c <= width; c++) values.push(cellValue(row.getCell(c).value));
        sampleRows.push(values);
      }
      return { name: sheet.name, rowCount: sheet.actualRowCount || sheet.rowCount, columnCount: sheet.actualColumnCount || sheet.columnCount, sampleRows };
    }),
  };
}

// ---------------------------------------------------------------------------
// Full-sheet reader used by the roster import.

const MAX_ROWS = 600;
const MAX_COLS = 80;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Any cell value as plain text. Formula errors (#DIV/0!) become "". */
function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value) return value.result == null ? "" : cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) return clean(value.richText.map((p) => p.text).join(""));
    if ("text" in value && typeof value.text === "string") return clean(value.text);
    return "";
  }
  return clean(String(value));
}

export type SheetInfo = { name: string; hidden: boolean };

export type WorkbookReader = {
  fileName: string;
  /** Sheet names only. No cell data is read until a sheet is asked for. */
  sheets: SheetInfo[];
  /** Converts ONE sheet to a grid of text. Each sheet is converted at most once. */
  read: (name: string) => SheetGrid;
  /** Finds the learner list. Stops at the first sheet that clearly has it. */
  detect: () => { sheetName: string; detection: RosterDetection };
  /**
   * Looks for score columns (TERM1, TERM2, ...). Opens every visible sheet, so only
   * call it when the teacher asks to import grades. Hidden sheets are skipped.
   */
  findGrades: () => GradeSheet[];
  /** School name, adviser, grade, section, subject and school year from the top of the sheets. */
  classInfo: () => ClassInfo;
};

// Same hint roster.ts uses to prefer the learner sheet (INPUT, SF1, Learners...).
const LIKELY_ROSTER_SHEET = /input|learner|student|sf1|master|enrol|roster|names/i;

/**
 * Reads ONE worksheet into a grid of text. Merged cells keep their value only in
 * the top-left cell, so a title merged across 12 columns is read once, not 12 times.
 */
function sheetToGrid(sheet: ExcelJS.Worksheet): SheetGrid {
  const rowCount = Math.min(sheet.rowCount, MAX_ROWS);
  const colCount = Math.min(sheet.columnCount, MAX_COLS);
  const rows: string[][] = [];
  for (let r = 1; r <= rowCount; r++) {
    const row = sheet.getRow(r);
    const values: string[] = [];
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      values.push(cell.type === ExcelJS.ValueType.Merge ? "" : cellText(cell.value));
    }
    rows.push(values);
  }
  return { name: sheet.name, hidden: sheet.state !== "visible", rows };
}

/**
 * The last row and column that actually hold a value. A sheet can be formatted far below its data
 * (the DepEd record is styled down to row 1000), so rowCount and columnCount alone overstate its size.
 */
function dataExtent(sheet: ExcelJS.Worksheet) {
  let rows = 0;
  let cols = 0;
  sheet.eachRow({ includeEmpty: false }, (row, r) => {
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      if (cell.type === ExcelJS.ValueType.Merge || cellText(cell.value) === "") return;
      if (r > rows) rows = r;
      if (c > cols) cols = c;
    });
  });
  return { rows, cols };
}

/** True when real data sits past the rows or columns the reader supports. */
function hasDataBeyondLimits(sheet: ExcelJS.Worksheet) {
  if (sheet.rowCount <= MAX_ROWS && sheet.columnCount <= MAX_COLS) return false;
  const { rows, cols } = dataExtent(sheet);
  return rows > MAX_ROWS || cols > MAX_COLS;
}

/** Reads only the workbook's explicitly named active grading tables, even when their helper sheet is hidden. */
export function readWorkbookGradingRules(workbook: ExcelJS.Workbook) {
  const definedNames = workbook.definedNames as unknown as { model?: { name: string; ranges: string[] }[] };
  const readNamedTable = (name: string) => {
    const range = definedNames.model?.find((entry) => entry.name.toLowerCase() === name.toLowerCase())?.ranges[0];
    if (!range) return null;
    const match = /^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/i.exec(range);
    if (!match) return null;
    const sheetName = (match[1] ?? match[2] ?? "").replace(/''/g, "'");
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) return null;
    const columnNumber = (letters: string) => [...letters.toUpperCase()].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0);
    const fromColumn = columnNumber(match[3] ?? "A");
    const fromRow = Number(match[4]);
    const toColumn = columnNumber(match[5] ?? "A");
    const toRow = Number(match[6]);
    const valueAt = (row: number, column: number) => {
      const value = sheet.getCell(row, column).value;
      if (value && typeof value === "object" && "result" in value) return value.result;
      return value;
    };
    return Array.from({ length: Math.max(0, toRow - fromRow + 1) }, (_, offset) =>
      Array.from({ length: Math.max(0, toColumn - fromColumn + 1) }, (_, index) => valueAt(fromRow + offset, fromColumn + index)),
    );
  };

  const transmutationRows = readNamedTable("NewTransmu");
  const descriptorRows = readNamedTable("DESCRIPTORS");
  if (!transmutationRows || !descriptorRows) return undefined;
  const transmutation: TransmutationRow[] = transmutationRows.flatMap((row) => {
    const min = Number(row[0]);
    const maxValue = row[2];
    const grade = Number(row[3]);
    if (!Number.isFinite(min) || !Number.isFinite(grade)) return [];
    const maxNumber = Number(maxValue);
    return [{ min, max: Number.isFinite(maxNumber) ? maxNumber : null, grade }];
  });
  const descriptors: DescriptorRow[] = descriptorRows.flatMap((row) => {
    const min = Number(row[0]);
    const label = String(row[3] ?? "").trim();
    return Number.isFinite(min) && label ? [{ min, label }] : [];
  });
  return transmutation.length && descriptors.length ? { transmutation, descriptors } : undefined;
}

/**
 * Opens a workbook WITHOUT turning its sheets into grids. A class record can have
 * 7+ sheets (INPUT, TERM1-3, SUMMARY, hidden helpers) and only one holds the
 * learner list, so a sheet is converted only when detection or the teacher needs it.
 * Hidden sheets are never opened automatically.
 */
export async function openWorkbook(file: File, options: { rejectTruncation?: boolean } = {}): Promise<WorkbookReader> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Please choose an .xlsx workbook.");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error("This file could not be opened. Check that it is a valid .xlsx workbook.");
  }

  const sheets: SheetInfo[] = workbook.worksheets.map((s) => ({ name: s.name, hidden: s.state !== "visible" }));
  if (sheets.length === 0) throw new Error("This workbook has no sheets.");
  if (options.rejectTruncation && workbook.worksheets.some(s => s.state === "visible" && hasDataBeyondLimits(s))) {
    throw new Error(`This workbook exceeds the supported ${MAX_ROWS} rows or ${MAX_COLS} columns per visible sheet. Split the record before syncing so no data is skipped.`);
  }

  const cache = new Map<string, SheetGrid>();
  const read = (name: string): SheetGrid => {
    const hit = cache.get(name);
    if (hit) return hit;
    const sheet = workbook.getWorksheet(name);
    if (!sheet) throw new Error(`Sheet "${name}" was not found.`);
    const grid = sheetToGrid(sheet);
    cache.set(name, grid);
    return grid;
  };

  // Learner sheet first, then the others. Hidden sheets are never opened automatically.
  const visibleOrdered = () => {
    const visible = sheets.filter((s) => !s.hidden);
    return [
      ...visible.filter((s) => LIKELY_ROSTER_SHEET.test(s.name)),
      ...visible.filter((s) => !LIKELY_ROSTER_SHEET.test(s.name)),
    ];
  };

  const detect = () => {
    const ordered = visibleOrdered();

    let weak: { sheetName: string; detection: RosterDetection } | null = null;
    for (const info of ordered) {
      const detection = detectRoster([read(info.name)]);
      if (detection.confidence === "high") return { sheetName: info.name, detection };
      if (detection.mapping && !weak) weak = { sheetName: info.name, detection };
    }
    return (
      weak ?? {
        sheetName: (ordered[0] ?? sheets[0]).name,
        detection: { mapping: null, confidence: "none" } as RosterDetection,
      }
    );
  };

  const findGrades = () => {
    const gradingRules = readWorkbookGradingRules(workbook);
    return sheets
      .filter((s) => !s.hidden)
      .flatMap((s) => {
        const found = detectGradeSheet(read(s.name), { keepEmpty: true, includeFree: true });
        return found ? [{ ...found, ...(gradingRules ? { gradingRules } : {}) }] : [];
      });
  };

  // Stops reading sheets as soon as every detail has been found.
  const classInfo = () =>
    detectClassInfo(
      (function* () {
        for (const info of visibleOrdered()) yield read(info.name);
      })(),
    );

  return { fileName: file.name, sheets, read, detect, findGrades, classInfo };
}
