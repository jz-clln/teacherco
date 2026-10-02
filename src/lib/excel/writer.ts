// src/lib/excel/writer.ts
//
// Writes scores back into the teacher's ORIGINAL .xlsx without disturbing anything else.
//
// Why not load and re-save with ExcelJS? A class record carries logos, drawings, named
// ranges, data validation and Google Sheets metadata that a load/save round trip can
// drop or damage. Instead this edits ONLY the <c> (cell) elements that receive a score,
// inside the worksheet XML, and leaves every other byte of the file untouched.
//
//   * Formula cells are never overwritten.
//   * Cell styles (number format, borders, fill) are kept.
//   * The workbook is flagged "recalculate on open", so totals, term grades and the
//     summary sheet refresh by themselves the next time the file is opened.

import JSZip from "jszip";
import { colName, type PlannedWrite } from "@/lib/excel/export-plan";

type Edit = Pick<PlannedWrite, "sheet" | "row" | "col" | "value">;

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

export type Exporter = {
  /** Cells (as "Sheet!F12") that hold a formula, so they will be left alone. */
  formulaCells: (writes: Pick<PlannedWrite, "key" | "sheet" | "address" | "row" | "col">[]) => Promise<Set<string>>;
  /** Builds the updated workbook. Formula cells in `writes` are skipped. */
  build: (writes: Edit[]) => Promise<{ blob: Blob; written: number; skippedFormulas: number }>;
};

export async function openExporter(file: File): Promise<Exporter> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Please choose the .xlsx workbook you imported.");
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error("This file could not be opened. Check that it is a valid .xlsx workbook.");
  }

  const workbookXml = await readText(zip, "xl/workbook.xml");
  const relsXml = await readText(zip, "xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relsXml) throw new Error("This does not look like an Excel workbook.");

  // sheet name -> worksheet part path
  const targets = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = m[0];
    const id = /\bId="([^"]+)"/.exec(tag)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(tag)?.[1];
    if (id && target) targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`);
  }
  const sheetPath = new Map<string, string>();
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const tag = m[0];
    const name = /\bname="([^"]*)"/.exec(tag)?.[1];
    const rid = /\br:id="([^"]+)"/.exec(tag)?.[1];
    const path = rid ? targets.get(rid) : undefined;
    if (name && path) sheetPath.set(unescapeXml(name), path);
  }

  const cache = new Map<string, string>();
  const sheetXml = async (name: string) => {
    const path = sheetPath.get(name);
    if (!path) throw new Error(`Sheet "${name}" was not found in the file.`);
    let xml = cache.get(path);
    if (xml == null) {
      xml = (await readText(zip, path)) ?? "";
      cache.set(path, xml);
    }
    return { path, xml };
  };

  return {
    async formulaCells(writes) {
      const out = new Set<string>();
      for (const w of writes) {
        const { xml } = await sheetXml(w.sheet);
        const cell = findCell(xml, w.row, w.col);
        if (cell && /<f[\s>/]/.test(cell.inner)) out.add(w.key);
      }
      return out;
    },

    async build(edits) {
      const bySheet = new Map<string, Edit[]>();
      for (const e of edits) bySheet.set(e.sheet, [...(bySheet.get(e.sheet) ?? []), e]);

      let written = 0;
      let skippedFormulas = 0;
      const out = new Map<string, string>();

      for (const [name, list] of bySheet) {
        const { path, xml } = await sheetXml(name);
        const res = patchSheet(xml, list);
        written += res.written;
        skippedFormulas += res.skippedFormulas;
        out.set(path, res.xml);
      }

      // Copy the original zip entry by entry. Only changed parts are replaced.
      const next = new JSZip();
      const names = Object.keys(zip.files);
      for (const n of names) {
        const entry = zip.files[n];
        if (entry.dir) continue;
        const keep = { createFolders: false };
        if (out.has(n)) next.file(n, out.get(n)!, keep);
        else if (n === "xl/workbook.xml") next.file(n, forceRecalc(workbookXml), keep);
        else next.file(n, await entry.async("uint8array"), keep);
      }

      const blob = await next.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      return { blob, written, skippedFormulas };
    },
  };
}

async function readText(zip: JSZip, path: string): Promise<string | null> {
  const f = zip.file(path);
  return f ? f.async("string") : null;
}

/** Adds fullCalcOnLoad="1" so Excel and Google Sheets recompute every formula when the file opens. */
export function forceRecalc(xml: string): string {
  const existing = /<calcPr\b[^>]*?(\/?)>/.exec(xml);
  if (existing) {
    if (/\bfullCalcOnLoad=/.test(existing[0])) return xml.replace(/\bfullCalcOnLoad="[^"]*"/, 'fullCalcOnLoad="1"');
    const tag = existing[0].replace(/\s*(\/?)>$/, ' fullCalcOnLoad="1"$1>');
    return xml.replace(existing[0], tag);
  }
  const before = /<(oleSize|customWorkbookViews|pivotCaches|smartTagPr|smartTagTypes|webPublishing|fileRecoveryPr|webPublishObjects|extLst)\b/.exec(xml);
  const calc = '<calcPr fullCalcOnLoad="1"/>';
  if (before) return xml.slice(0, before.index) + calc + xml.slice(before.index);
  return xml.replace("</workbook>", `${calc}</workbook>`);
}

// ------------------------------------------------------------------ worksheet patching

const rowRe = (r: number) => new RegExp(`<row\\b[^>]*?\\br="${r}"[^>]*?(/>|>)`);

type Found = { start: number; end: number; attrs: string; inner: string; selfClosing: boolean };

function cellRe(ref: string) {
  return new RegExp(`<c\\b(?=[^>]*?\\br="${ref}")([^>]*?)(/>|>([\\s\\S]*?)</c>)`);
}

/** Locates one <c> element anywhere in the sheet. Used for the formula check. */
function findCell(xml: string, row: number, col: number): Found | null {
  const ref = `${colName(col)}${row}`;
  const rowMatch = rowRe(row).exec(xml);
  if (!rowMatch || rowMatch[1] === "/>") return null;
  const bodyStart = rowMatch.index + rowMatch[0].length;
  const bodyEnd = xml.indexOf("</row>", bodyStart);
  if (bodyEnd < 0) return null;
  const m = cellRe(ref).exec(xml.slice(bodyStart, bodyEnd));
  if (!m) return null;
  return {
    start: bodyStart + m.index,
    end: bodyStart + m.index + m[0].length,
    attrs: m[1],
    inner: m[3] ?? "",
    selfClosing: m[2] === "/>",
  };
}

function colOfRef(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function newCell(ref: string, attrs: string, value: number): string {
  const kept = attrs.replace(/\s+r="[^"]*"/, "").replace(/\s+t="[^"]*"/, "");
  return `<c r="${ref}"${kept}><v>${value}</v></c>`;
}

export function patchSheet(
  xml: string,
  edits: Pick<PlannedWrite, "row" | "col" | "value">[],
): { xml: string; written: number; skippedFormulas: number } {
  let out = xml;
  let written = 0;
  let skippedFormulas = 0;

  const rows = new Map<number, typeof edits>();
  for (const e of edits) rows.set(e.row, [...(rows.get(e.row) ?? []), e]);

  for (const [r, list] of [...rows].sort((a, b) => a[0] - b[0])) {
    const sorted = [...list].sort((a, b) => a.col - b.col);
    const rowMatch = rowRe(r).exec(out);

    // Row is missing: create it in the right place.
    if (!rowMatch) {
      const cells = sorted.map((e) => newCell(`${colName(e.col)}${r}`, "", e.value)).join("");
      const html = `<row r="${r}">${cells}</row>`;
      let at = out.indexOf("</sheetData>");
      for (const m of out.matchAll(/<row\b[^>]*?\br="(\d+)"/g)) {
        if (Number(m[1]) > r) {
          at = m.index!;
          break;
        }
      }
      if (at < 0) continue;
      out = out.slice(0, at) + html + out.slice(at);
      written += sorted.length;
      continue;
    }

    // Row exists. A self-closing row becomes an open one.
    const rowStart = rowMatch.index;
    let bodyStart = rowStart + rowMatch[0].length;
    if (rowMatch[1] === "/>") {
      const open = rowMatch[0].replace(/\s*\/>$/, ">");
      out = out.slice(0, rowStart) + open + "</row>" + out.slice(rowStart + rowMatch[0].length);
      bodyStart = rowStart + open.length;
    }
    const bodyEnd = out.indexOf("</row>", bodyStart);
    let body = out.slice(bodyStart, bodyEnd);

    for (const e of sorted) {
      const ref = `${colName(e.col)}${r}`;
      const m = cellRe(ref).exec(body);
      if (m) {
        const inner = m[3] ?? "";
        if (/<f[\s>/]/.test(inner)) {
          skippedFormulas++;
          continue;
        }
        body = body.slice(0, m.index) + newCell(ref, m[1], e.value) + body.slice(m.index + m[0].length);
      } else {
        // Insert in column order.
        let at = body.length;
        for (const c of body.matchAll(/<c\b[^>]*?\br="([A-Z]+)\d+"/g)) {
          if (colOfRef(c[1]) > e.col) {
            at = c.index!;
            break;
          }
        }
        body = body.slice(0, at) + newCell(ref, "", e.value) + body.slice(at);
      }
      written++;
    }
    out = out.slice(0, bodyStart) + body + out.slice(bodyEnd);
  }

  return { xml: out, written, skippedFormulas };
}