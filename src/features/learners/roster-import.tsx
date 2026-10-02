// src/features/learners/roster-import.tsx

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { importLearners } from "@/features/learners/import-actions";
import { readWorkbookGrids } from "@/lib/excel/parser";
import {
  columnOptions,
  defaultMapping,
  detectRoster,
  extractRoster,
  gridFromPaste,
  suggestMapping,
  type NameFormat,
  type RosterMapping,
  type RosterRow,
  type SheetGrid,
} from "@/lib/excel/roster";
import { cn } from "@/lib/utils";

type Source = { label: string; sheets: SheetGrid[] };
type Edit = Partial<Pick<RosterRow, "firstName" | "lastName" | "lrn" | "include">>;

const FORMAT_OPTIONS: { value: NameFormat; label: string }[] = [
  { value: "surname-first", label: "Surname, First name (DELA CRUZ, JUAN)" },
  { value: "first-last", label: "First name Surname (Juan Dela Cruz)" },
  { value: "split", label: "Surname and first name in separate columns" },
];

const cellInput =
  "w-full min-w-28 rounded-lg border border-[#E3E5E1] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#4F6F52]";

export function RosterImport({ classId }: { classId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"file" | "paste">("file");
  const [source, setSource] = useState<Source | null>(null);
  const [mapping, setMapping] = useState<RosterMapping | null>(null);
  const [confident, setConfident] = useState(false);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function load(next: Source) {
    if (next.sheets.length === 0) {
      setError("This workbook has no sheets.");
      return;
    }
    const found = detectRoster(next.sheets);
    const fallback = next.sheets.find((s) => !s.hidden) ?? next.sheets[0];
    setSource(next);
    setMapping(found.mapping ?? defaultMapping(fallback));
    setConfident(found.confidence === "high");
    setEdits({});
    setError(null);
  }

  async function onFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const wb = await readWorkbookGrids(file);
      load({ label: wb.fileName, sheets: wb.sheets });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this workbook.");
    } finally {
      setBusy(false);
    }
  }

  function onDragOver(e: React.DragEvent) {
    // Required, otherwise the browser refuses the drop and opens the file instead.
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!dragging) setDragging(true);
  }

  function onDragLeave(e: React.DragEvent) {
    // Ignore leave events fired when moving over a child element.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    void onFile(e.dataTransfer.files[0]);
  }

  function onPaste() {
    const sheet = gridFromPaste(pasted);
    if (sheet.rows.length === 0) {
      setError("Paste at least one name first.");
      return;
    }
    load({ label: "Pasted list", sheets: [sheet] });
  }

  function remap(patch: Partial<RosterMapping>) {
    setMapping((m) => (m ? { ...m, ...patch } : m));
    setEdits({});
  }

  function changeSheet(name: string) {
    const next = source?.sheets.find((s) => s.name === name);
    if (!next) return;
    setMapping(suggestMapping(next));
    setConfident(false);
    setEdits({});
  }

  function patchRow(key: string, patch: Edit) {
    setEdits((cur) => ({ ...cur, [key]: { ...cur[key], ...patch } }));
  }

  const sheet = source?.sheets.find((s) => s.name === mapping?.sheet) ?? null;
  const base = useMemo(() => (sheet && mapping ? extractRoster(sheet.rows, mapping) : []), [sheet, mapping]);
  const rows = useMemo(() => base.map((r) => ({ ...r, ...edits[r.key] })), [base, edits]);

  const picked = rows.filter((r) => r.include);
  const incomplete = picked.filter((r) => !r.firstName.trim() || !r.lastName.trim());
  const canImport = picked.length > 0 && incomplete.length === 0 && !pending;

  const columns = useMemo(
    () =>
      sheet && mapping
        ? columnOptions(sheet, mapping.firstRow, [mapping.nameCol, mapping.lastCol, mapping.firstCol, mapping.lrnCol])
        : [],
    [sheet, mapping],
  );

  function runImport() {
    setError(null);
    start(async () => {
      const result = await importLearners({
        classId,
        rows: picked.map((r) => ({ firstName: r.firstName.trim(), lastName: r.lastName.trim(), lrn: r.lrn.trim() })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/classes/${classId}?imported=${result.added}&skipped=${result.skipped}`);
    });
  }

  // ------------------------------------------------------------ first step
  if (!source || !mapping) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button variant={tab === "file" ? "primary" : "secondary"} onClick={() => setTab("file")}>
            <UploadCloud size={16} className="mr-2" /> Excel file
          </Button>
          <Button variant={tab === "paste" ? "primary" : "secondary"} onClick={() => setTab("paste")}>
            <ClipboardPaste size={16} className="mr-2" /> Paste a list
          </Button>
        </div>

        {tab === "file" ? (
          <label
            onDragEnter={onDragOver}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={cn(
              "teacherco-card flex cursor-pointer flex-col items-center justify-center border-2 border-dashed p-10 text-center transition focus-within:border-[#4F6F52]",
              dragging && "border-[#1A4D2E] bg-[#EAF0EA]",
            )}
          >
            <UploadCloud size={32} className="text-[#1A4D2E]" />
            <span className="mt-3 font-semibold">{dragging ? "Drop your file to read it" : "Drag and drop your class record here"}</span>
            <span className="mt-1 text-sm text-[#606861]">
              or click to choose a file. .xlsx files, any layout. You confirm what we found before anything is saved.
            </span>
            <input
              type="file"
              accept=".xlsx"
              className="sr-only"
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        ) : (
          <Card>
            <label className="block text-sm font-medium">
              Paste the names from Excel, Word or a message
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={8}
                placeholder={"DELA CRUZ, JUAN A.\nSANTOS, MARIA B.\nREYES, PEDRO C."}
                className="mt-1.5 w-full rounded-xl border border-[#E3E5E1] px-3 py-3 text-sm outline-none focus:border-[#4F6F52]"
              />
            </label>
            <p className="mt-2 text-sm text-[#606861]">One learner per line. Columns copied from Excel are fine.</p>
            <Button className="mt-4" onClick={onPaste} disabled={!pasted.trim()}>
              Read these names
            </Button>
          </Card>
        )}

        {busy ? <p className="text-sm text-[#606861]">Reading workbook…</p> : null}
        {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      </div>
    );
  }

  // ------------------------------------------------------ confirmation step
  const split = mapping.format === "split";
  const sheetOptions = source.sheets.map((s) => ({ value: s.name, label: s.hidden ? `${s.name} (hidden)` : s.name }));
  const rowNumber = (value: string, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 1 ? n - 1 : fallback;
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{source.label}</h2>
            <p className="mt-1 text-sm text-[#606861]">
              {confident
                ? "We found your learner list. Check the names below, then import."
                : "We were not sure about this layout. Check the settings and the names below."}
            </p>
          </div>
          <Button variant="ghost" onClick={() => setSource(null)}>
            Choose a different file
          </Button>
        </div>

        <details className="mt-4" open={!confident}>
          <summary className="cursor-pointer text-sm font-medium text-[#1A4D2E]">How we read this file</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {source.sheets.length > 1 ? (
              <Select name="sheet" label="Sheet with the learner list" options={sheetOptions} value={mapping.sheet} onChange={changeSheet} />
            ) : null}
            <Select
              name="format"
              label="How names are written"
              options={FORMAT_OPTIONS}
              value={mapping.format}
              onChange={(v) => remap({ format: v as NameFormat })}
            />
            {split ? (
              <>
                <Select
                  name="lastCol"
                  label="Surname column"
                  options={columns}
                  value={String(mapping.lastCol)}
                  onChange={(v) => remap({ lastCol: Number(v) })}
                />
                <Select
                  name="firstCol"
                  label="First name column"
                  options={columns}
                  value={String(mapping.firstCol)}
                  onChange={(v) => remap({ firstCol: Number(v) })}
                />
              </>
            ) : (
              <Select
                name="nameCol"
                label="Name column"
                options={columns}
                value={String(mapping.nameCol)}
                onChange={(v) => remap({ nameCol: Number(v) })}
              />
            )}
            <Select
              name="lrnCol"
              label="LRN column"
              emptyLabel="No LRN column"
              options={columns}
              value={mapping.lrnCol == null ? "" : String(mapping.lrnCol)}
              onChange={(v) => remap({ lrnCol: v === "" ? null : Number(v) })}
            />
            <label className="block text-sm font-medium">
              First row
              <input
                type="number"
                min={1}
                value={mapping.firstRow + 1}
                onChange={(e) => remap({ firstRow: rowNumber(e.target.value, mapping.firstRow) })}
                className={cn(cellInput, "mt-1.5 py-3")}
              />
            </label>
            <label className="block text-sm font-medium">
              Last row
              <input
                type="number"
                min={1}
                value={mapping.lastRow + 1}
                onChange={(e) => remap({ lastRow: rowNumber(e.target.value, mapping.lastRow) })}
                className={cn(cellInput, "mt-1.5 py-3")}
              />
            </label>
          </div>
          <p className="mt-3 text-xs text-[#606861]">Changing a setting re-reads the file and resets any edits you made below.</p>
        </details>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E3E5E1] px-5 py-4">
          <h2 className="text-lg font-semibold">Learners found</h2>
          <span className="text-sm text-[#606861]">
            {picked.length} of {rows.length} selected
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[#606861]">
            No names found with these settings. Try another sheet, column or row range.
          </p>
        ) : (
          <div className="max-h-[32rem] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-[#F5F6F4] text-xs text-[#606861]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={rows.length > 0 && rows.every((r) => r.include)}
                      onChange={(e) => rows.forEach((r) => patchRow(r.key, { include: e.target.checked }))}
                    />
                  </th>
                  <th className="px-2 py-2.5 font-medium">Row</th>
                  <th className="px-2 py-2.5 font-medium">Surname</th>
                  <th className="px-2 py-2.5 font-medium">First name</th>
                  <th className="px-2 py-2.5 font-medium">LRN</th>
                  <th className="px-2 py-2.5 font-medium">Sex</th>
                  <th className="px-2 py-2.5 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E5E1]">
                {rows.map((r) => {
                  const missing = r.include && (!r.firstName.trim() || !r.lastName.trim());
                  return (
                    <tr key={r.key} className={cn(!r.include && "bg-[#F5F6F4]/60 text-[#8B928C]")}>
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Include row ${r.sourceRow}`}
                          checked={r.include}
                          onChange={(e) => patchRow(r.key, { include: e.target.checked })}
                        />
                      </td>
                      <td className="px-2 py-2 text-[#606861]">{r.sourceRow}</td>
                      <td className="px-2 py-1.5">
                        <input
                          aria-label={`Surname, row ${r.sourceRow}`}
                          value={r.lastName}
                          onChange={(e) => patchRow(r.key, { lastName: e.target.value })}
                          className={cn(cellInput, missing && !r.lastName.trim() && "border-red-400")}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          aria-label={`First name, row ${r.sourceRow}`}
                          value={r.firstName}
                          onChange={(e) => patchRow(r.key, { firstName: e.target.value })}
                          className={cn(cellInput, missing && !r.firstName.trim() && "border-red-400")}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          aria-label={`LRN, row ${r.sourceRow}`}
                          value={r.lrn}
                          onChange={(e) => patchRow(r.key, { lrn: e.target.value })}
                          className={cn(cellInput, "min-w-36")}
                        />
                      </td>
                      <td className="px-2 py-2 text-[#606861]">{r.sex || "—"}</td>
                      <td className="px-2 py-2 text-xs text-amber-700">{r.flags.join(" ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {incomplete.length > 0 ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          {incomplete.length} selected {incomplete.length === 1 ? "learner needs" : "learners need"} both a surname and a first name.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={runImport} disabled={!canImport}>
          {pending ? "Importing…" : `Import ${picked.length} ${picked.length === 1 ? "learner" : "learners"}`}
        </Button>
        <p className="text-sm text-[#606861]">
          Your file is read in your browser. Only the names you confirm are saved. Learners already in this class are skipped.
        </p>
      </div>
    </div>
  );
}