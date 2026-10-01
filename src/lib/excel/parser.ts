import ExcelJS from "exceljs";

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
