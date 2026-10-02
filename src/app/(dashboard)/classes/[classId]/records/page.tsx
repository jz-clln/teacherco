//src\app\(dashboard)\classes\[classId]\records\page.tsx - Jabez

"use client";

import { useState } from "react";
import { UploadCloud } from "lucide-react";
import { parseWorkbookPreview, type WorkbookPreview } from "@/lib/excel/parser";

export default function RecordImportPage() {
  const [preview, setPreview] = useState<WorkbookPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file?: File) {
    if (!file) return;
    setBusy(true); setError(null);
    try { setPreview(await parseWorkbookPreview(file)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not read workbook"); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><p className="text-sm font-medium text-[#4F6F52]">RECORD IMPORT</p><h1 className="mt-1 text-3xl font-bold">Import the record you already use</h1><p className="mt-2 text-[#606861]">This preview is parsed in your browser. The next implementation step is the teacher confirmation/mapping flow.</p></div>
      <label className="teacherco-card flex cursor-pointer flex-col items-center justify-center border-dashed p-10 text-center"><UploadCloud size={32} className="text-[#1A4D2E]"/><span className="mt-3 font-semibold">Choose an Excel workbook</span><span className="mt-1 text-sm text-[#606861]">.xlsx files</span><input type="file" accept=".xlsx" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])}/></label>
      {busy ? <p>Reading workbook…</p> : null}{error ? <p className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p> : null}
      {preview ? <div className="teacherco-card overflow-hidden"><div className="border-b border-[#E3E5E1] p-4"><h2 className="font-semibold">Workbook preview</h2><p className="text-sm text-[#606861]">{preview.fileName} · {preview.sheets.length} sheet(s)</p></div><div className="divide-y divide-[#E3E5E1]">{preview.sheets.map((sheet) => <div key={sheet.name} className="p-4"><p className="font-medium">{sheet.name}</p><p className="mt-1 text-sm text-[#606861]">{sheet.rowCount} rows · {sheet.columnCount} columns</p><div className="mt-3 overflow-auto rounded-xl border border-[#E3E5E1]"><table className="min-w-full text-left text-xs"><tbody>{sheet.sampleRows.map((row, i) => <tr key={i} className="border-b border-[#E3E5E1] last:border-0">{row.map((cell, j) => <td key={j} className="max-w-48 truncate px-3 py-2">{String(cell ?? "")}</td>)}</tr>)}</tbody></table></div></div>)}</div></div> : null}
    </div>
  );
}
