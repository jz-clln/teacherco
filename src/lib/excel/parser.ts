// src/lib/excel/parser.ts

import ExcelJS from "exceljs";
import type { SheetGrid } from "@/lib/excel/roster";

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

/**
 * Reads every sheet into a grid of text. Merged cells keep their value only in
 * the top-left cell, so a title merged across 12 columns is read once, not 12 times.
 */
export async function readWorkbookGrids(file: File): Promise<{ fileName: string; sheets: SheetGrid[] }> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Please choose an .xlsx workbook.");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error("This file could not be opened. Check that it is a valid .xlsx workbook.");
  }

  const sheets: SheetGrid[] = workbook.worksheets.map((sheet) => {
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
  });

  return { fileName: file.name, sheets };
}