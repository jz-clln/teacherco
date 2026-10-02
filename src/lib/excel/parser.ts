// src/lib/excel/parser.ts

import ExcelJS from "exceljs";
import { detectClassInfo, type ClassInfo } from "@/lib/excel/class-info";
import { detectGradeSheet, type GradeSheet } from "@/lib/excel/grades";
import { detectRoster, type RosterDetection, type SheetGrid } from "@/lib/excel/roster";

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
 * Opens a workbook WITHOUT turning its sheets into grids. A class record can have
 * 7+ sheets (INPUT, TERM1-3, SUMMARY, hidden helpers) and only one holds the
 * learner list, so a sheet is converted only when detection or the teacher needs it.
 * Hidden sheets are never opened automatically.
 */
export async function openWorkbook(file: File): Promise<WorkbookReader> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Please choose an .xlsx workbook.");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error("This file could not be opened. Check that it is a valid .xlsx workbook.");
  }

  const sheets: SheetInfo[] = workbook.worksheets.map((s) => ({ name: s.name, hidden: s.state !== "visible" }));
  if (sheets.length === 0) throw new Error("This workbook has no sheets.");

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

  const findGrades = () =>
    sheets
      .filter((s) => !s.hidden)
      .flatMap((s) => {
        const found = detectGradeSheet(read(s.name));
        return found ? [found] : [];
      });

  // Stops reading sheets as soon as every detail has been found.
  const classInfo = () =>
    detectClassInfo(
      (function* () {
        for (const info of visibleOrdered()) yield read(info.name);
      })(),
    );

  return { fileName: file.name, sheets, read, detect, findGrades, classInfo };
}