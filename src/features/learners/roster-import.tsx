// src/features/learners/roster-import.tsx

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { updateClassDetails } from "@/features/classes/details-actions";
import type { ClassDetails } from "@/features/classes/details";
import { ImportLoader } from "@/features/learners/import-loader";
import { importGrades } from "@/features/learners/grade-actions";
import { findSimilarLearners, importLearners, type LearnerMatch } from "@/features/learners/import-actions";
import type { GradeSheet } from "@/lib/excel/grades";
import { hasClassInfo, type ClassInfo } from "@/lib/excel/class-info";
import { openWorkbook, type SheetInfo } from "@/lib/excel/parser";
import {
  columnOptions,
  defaultMapping,
  detectRoster,
  extractRoster,
  gridFromPaste,
  nameKey,
  suggestMapping,
  type NameFormat,
  type RosterDetection,
  type RosterMapping,
  type RosterRow,
  type SheetGrid,
} from "@/lib/excel/roster";
import { cn } from "@/lib/utils";

// Sheets are listed by name only. A sheet is read when it is first needed.
type Source = {
  label: string;
  sheets: SheetInfo[];
  read: (name: string) => SheetGrid;
  /** Only workbooks can have grades. Opens every visible sheet, so it runs on request. */
  findGrades?: () => GradeSheet[];
  /** School, adviser, grade, section, subject and school year printed in the workbook. */
  classInfo?: () => ClassInfo;
};

type InfoKey = "name" | "schoolName" | "schoolId" | "adviser" | "gradeLevel" | "section" | "subject" | "schoolYear";
const INFO_ROWS: { key: InfoKey; label: string }[] = [
  { key: "schoolName", label: "School name" },
  { key: "adviser", label: "Adviser / teacher" },
  { key: "gradeLevel", label: "Grade level" },
  { key: "section", label: "Section" },
  { key: "subject", label: "Subject" },
  { key: "schoolYear", label: "School year" },
  { key: "schoolId", label: "School ID" },
  { key: "name", label: "Class name" },
];
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
type Edit = Partial<Pick<RosterRow, "firstName" | "lastName" | "lrn" | "include">>;

const FORMAT_OPTIONS: { value: NameFormat; label: string }[] = [
  { value: "surname-first", label: "Surname, First name (DELA CRUZ, JUAN)" },
  { value: "first-last", label: "First name Surname (Juan Dela Cruz)" },
  { value: "split", label: "Surname and first name in separate columns" },
];

const cellInput =
  "w-full min-w-28 rounded-lg border border-[#E3E5E1] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#4F6F52]";

/** Waits until the browser has painted, so a loading message is visible before slow work starts. */
const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

export function RosterImport({ classId, currentClass }: { classId: string; currentClass?: ClassDetails }) {
  const router = useRouter();
  const [tab, setTab] = useState<"file" | "paste">("file");
  const [source, setSource] = useState<Source | null>(null);
  const [mapping, setMapping] = useState<RosterMapping | null>(null);
  const [confident, setConfident] = useState(false);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("Opening your workbook");
  const [busyFile, setBusyFile] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [wantGrades, setWantGrades] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [gradeSheets, setGradeSheets] = useState<GradeSheet[] | null>(null);
  const [fileInfo, setFileInfo] = useState<ClassInfo | null>(null);
  const [infoEdits, setInfoEdits] = useState<Record<string, { use?: boolean; value?: string }>>({});
  const [gradePick, setGradePick] = useState<Record<string, boolean>>({});
  // "Same learner?" step. matches is null until the teacher presses Import for the first time.
  const [matches, setMatches] = useState<Record<string, LearnerMatch[]> | null>(null);
  // Row index -> id of the learner to link, or "new" to keep separate.
  const [decisions, setDecisions] = useState<Record<string, string>>({});

  function load(next: Source, fallbackSheet: string, found: RosterDetection) {
    setSource(next);
    setMapping(found.mapping ?? defaultMapping(next.read(fallbackSheet)));
    setConfident(found.confidence === "high");
    setEdits({});
    setWantGrades(false);
    setGradeSheets(null);
    setGradePick({});
    setInfoEdits({});
    setMatches(null);
    setDecisions({});
    setFileInfo(next.classInfo ? next.classInfo() : null);
    setError(null);
    // Read the grades right away so the teacher sees them without having to ask.
    if (next.findGrades) {
      setWantGrades(true);
      void scanGrades(next);
    }
  }

  async function onFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setBusyFile(file.name);
    setStage("Opening your workbook");
    setError(null);
    const started = Date.now();
    try {
      await nextPaint(); // let the loader show before the heavy work blocks the page
      const wb = await openWorkbook(file);
      setStage("Finding your learners");
      await nextPaint();
      const { sheetName, detection } = wb.detect();
      setStage("Getting your list ready");
      await nextPaint();
      // Keep the loader up for a moment so it never just flashes.
      const wait = 800 - (Date.now() - started);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      load(
        { label: wb.fileName, sheets: wb.sheets, read: wb.read, findGrades: wb.findGrades, classInfo: wb.classInfo },
        sheetName,
        detection,
      );
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
    const grid = gridFromPaste(pasted);
    if (grid.rows.length === 0) {
      setError("Paste at least one name first.");
      return;
    }
    load(
      { label: "Pasted list", sheets: [{ name: grid.name, hidden: false }], read: () => grid },
      grid.name,
      detectRoster([grid]),
    );
  }

  function remap(patch: Partial<RosterMapping>) {
    setMapping((m) => (m ? { ...m, ...patch } : m));
    setEdits({});
    setMatches(null);
    setDecisions({});
  }

  function changeSheet(name: string) {
    if (!source?.sheets.some((s) => s.name === name)) return;
    setMapping(suggestMapping(source.read(name)));
    setConfident(false);
    setEdits({});
    setMatches(null);
    setDecisions({});
  }

  async function scanGrades(src: Source) {
    if (!src.findGrades) return;
    setScanning(true);
    await nextPaint(); // let "Looking for grades" show first
    try {
      setGradeSheets(src.findGrades());
    } catch {
      setError("Could not read the grade sheets in this file.");
      setWantGrades(false);
    } finally {
      setScanning(false);
    }
  }

  async function toggleGrades(on: boolean) {
    setWantGrades(on);
    if (on && !gradeSheets && source) await scanGrades(source);
  }

  function patchRow(key: string, patch: Edit) {
    setEdits((cur) => ({ ...cur, [key]: { ...cur[key], ...patch } }));
    setMatches(null);
    setDecisions({});
  }

  const sheetName = mapping?.sheet;
  const sheet = useMemo(() => (source && sheetName ? source.read(sheetName) : null), [source, sheetName]);
  const base = useMemo(() => (sheet && mapping ? extractRoster(sheet.rows, mapping) : []), [sheet, mapping]);
  const rows = useMemo(() => base.map((r) => ({ ...r, ...edits[r.key] })), [base, edits]);

  const picked = rows.filter((r) => r.include);
  const incomplete = picked.filter((r) => !r.firstName.trim() || !r.lastName.trim());
  const undecided = matches ? Object.keys(matches).filter((i) => !decisions[i]).length : 0;
  const canImport = picked.length > 0 && incomplete.length === 0 && undecided === 0 && !pending;

  // Grades are matched to learners by name, so show how many names match the list being imported.
  const rosterKeys = new Set(picked.map((r) => nameKey(r.firstName.trim(), r.lastName.trim())));
  const gradeInfo = (gradeSheets ?? []).map((g) => {
    const matched = g.learners.filter((l) => rosterKeys.has(nameKey(l.firstName, l.lastName))).length;
    const on = matched > 0 && (gradePick[g.sheet] ?? matched * 2 >= g.learners.length);
    return { g, matched, on };
  });
  const chosenGrades = wantGrades ? gradeInfo.filter((x) => x.on) : [];

  // Class details found in the file. A row is ticked by default when it differs from what the class has now.
  const infoRows = hasClassInfo(fileInfo) && currentClass
    ? INFO_ROWS.flatMap(({ key, label }) => {
        const found = fileInfo[key];
        if (!found) return [];
        const now = key === "name" ? currentClass.name : currentClass[key];
        const edit = infoEdits[key];
        const value = edit?.value ?? found;
        return [{ key, label, now, value, use: !!value.trim() && (edit?.use ?? !same(found, now)) }];
      })
    : [];
  const chosenInfo = infoRows.filter((r) => r.use);

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
      // Only names leave the browser. The LRN column is used here to catch duplicates and nowhere else.
      const names = picked.map((r) => ({ firstName: r.firstName.trim(), lastName: r.lastName.trim() }));

      // First press: ask whether any name is a learner the teacher already has in another class.
      if (matches === null) {
        const found = await findSimilarLearners({ classId, rows: names });
        if (!found.ok) {
          setError(found.error);
          return;
        }
        if (Object.keys(found.matches).length > 0) {
          setMatches(found.matches);
          setDecisions({});
          return; // wait for the teacher to answer "Same learner?"
        }
      }

      const result = await importLearners({
        classId,
        rows: names.map((n, i) => {
          const pick = decisions[String(i)];
          return { ...n, link: pick && pick !== "new" ? pick : null };
        }),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      let gradeScores = 0;
      if (chosenGrades.length > 0) {
        const grades = await importGrades({
          classId,
          sheets: chosenGrades.map(({ g }) => ({
            label: g.term,
            learners: g.learners.map((l) => ({ firstName: l.firstName, lastName: l.lastName })),
            columns: g.columns.map((c) => ({ title: c.title, total: c.total, scores: c.scores })),
          })),
        });
        if (!grades.ok) {
          setError(`Learners were saved. ${grades.error}`);
          return;
        }
        gradeScores = grades.scores;
      }

      if (currentClass && chosenInfo.length > 0) {
        const pick = (key: InfoKey, fallback: string) => chosenInfo.find((r) => r.key === key)?.value.trim() ?? fallback;
        const details = await updateClassDetails({
          classId,
          name: pick("name", currentClass.name),
          schoolName: pick("schoolName", currentClass.schoolName),
          schoolId: pick("schoolId", currentClass.schoolId),
          adviser: pick("adviser", currentClass.adviser),
          gradeLevel: pick("gradeLevel", currentClass.gradeLevel),
          section: pick("section", currentClass.section),
          subject: pick("subject", currentClass.subject),
          schoolYear: pick("schoolYear", currentClass.schoolYear),
          benchmark: currentClass.benchmark,
        });
        if (!details.ok) {
          setError(`Learners were saved. ${details.error}`);
          return;
        }
      }

      const gradesParam = gradeScores > 0 ? `&grades=${gradeScores}` : "";
      const detailsParam = currentClass && chosenInfo.length > 0 ? "&details=1" : "";
      router.push(`/classes/${classId}?imported=${result.added}&skipped=${result.skipped}${gradesParam}${detailsParam}`);
    });
  }

  // ------------------------------------------------------------ first step
  if (!source || !mapping) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button variant={tab === "file" ? "primary" : "secondary"} disabled={busy} onClick={() => setTab("file")}>
            <UploadCloud size={16} className="mr-2" /> Excel file
          </Button>
          <Button variant={tab === "paste" ? "primary" : "secondary"} disabled={busy} onClick={() => setTab("paste")}>
            <ClipboardPaste size={16} className="mr-2" /> Paste a list
          </Button>
        </div>

        {busy ? (
          <ImportLoader message={stage} detail={busyFile} />
        ) : tab === "file" ? (
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
              label="LRN column (used here only, never saved)"
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

      {infoRows.length > 0 ? (
        <Card>
          <h2 className="text-lg font-semibold">Class details in your file</h2>
          <p className="mt-1 text-sm text-[#606861]">
            Ticked details replace what this class has now when you import. You can edit them here, or later with
            &quot;Edit class details&quot;.
          </p>
          <ul className="mt-3 divide-y divide-[#E3E5E1] rounded-xl border border-[#E3E5E1]">
            {infoRows.map((r) => (
              <li key={r.key} className="grid items-center gap-2 px-4 py-3 sm:grid-cols-[auto_9rem_1fr_1fr]">
                <input
                  type="checkbox"
                  aria-label={`Use ${r.label} from the file`}
                  checked={r.use}
                  disabled={pending}
                  onChange={(e) => setInfoEdits((cur) => ({ ...cur, [r.key]: { ...cur[r.key], use: e.target.checked } }))}
                />
                <span className="text-sm font-medium">{r.label}</span>
                <input
                  aria-label={`${r.label} from the file`}
                  value={r.value}
                  disabled={pending}
                  onChange={(e) => setInfoEdits((cur) => ({ ...cur, [r.key]: { ...cur[r.key], value: e.target.value } }))}
                  className={cellInput}
                />
                <span className="text-xs text-[#606861]">Now: {r.now || "not set"}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

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
          <div className="max-h-128 overflow-auto">
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
                  <th className="px-2 py-2.5 font-medium">
                    LRN <span className="font-normal text-[#8B928C]">(not saved)</span>
                  </th>
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

      {source.findGrades ? (
        <Card>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={wantGrades}
              disabled={scanning || pending}
              onChange={(e) => void toggleGrades(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block font-semibold">Also import grades</span>
              <span className="block text-sm text-[#606861]">
                Reads the score columns (written works, performance tasks, exams) from the term sheets and matches them to
                learners by name. Totals, term grades and the summary sheet are ignored.
              </span>
            </span>
          </label>

          {scanning ? <ImportLoader compact className="mt-3" message="Looking for grade sheets" /> : null}

          {wantGrades && !scanning && gradeSheets ? (
            gradeInfo.length === 0 ? (
              <p className="mt-3 text-sm text-amber-700">
                No score columns found. Grades are read from sheets that have a &quot;Highest possible score&quot; row.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-[#E3E5E1] rounded-xl border border-[#E3E5E1]">
                {gradeInfo.map(({ g, matched, on }) => (
                  <li key={g.sheet} className="flex items-start gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Import grades from ${g.sheet}`}
                      checked={on}
                      disabled={matched === 0 || pending}
                      onChange={(e) => setGradePick((cur) => ({ ...cur, [g.sheet]: e.target.checked }))}
                      className="mt-1"
                    />
                    <div className="text-sm">
                      <p className="font-medium">
                        {g.term} <span className="font-normal text-[#606861]">(sheet {g.sheet})</span>
                      </p>
                      <p className="text-[#606861]">
                        {g.columns.length} score {g.columns.length === 1 ? "column" : "columns"}. {matched} of {g.learners.length}{" "}
                        learners matched by name.
                      </p>
                      {matched === 0 ? (
                        <p className="mt-1 text-amber-700">
                          No names match the learner list above, so this sheet is skipped. It may belong to a different class list.
                        </p>
                      ) : matched * 2 < g.learners.length ? (
                        <p className="mt-1 text-amber-700">
                          Fewer than half the names match. Only matched learners get grades.
                        </p>
                      ) : null}
                      {g.ignored > 0 ? (
                        <p className="mt-1 text-amber-700">
                          {g.ignored} {g.ignored === 1 ? "cell was" : "cells were"} not a number or above the highest possible score, and{" "}
                          {g.ignored === 1 ? "is" : "are"} left out.
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </Card>
      ) : null}

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {incomplete.length > 0 ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          {incomplete.length} selected {incomplete.length === 1 ? "learner needs" : "learners need"} both a surname and a first name.
        </p>
      ) : null}

      {matches ? (
        <Card>
          <h2 className="text-lg font-semibold">Same learner?</h2>
          <p className="mt-1 text-sm text-[#606861]">
            These names match learners you already have in another class. Link them to keep one record across classes, or keep
            them separate. Nothing is linked unless you choose it.
          </p>
          <ul className="mt-3 divide-y divide-[#E3E5E1] rounded-xl border border-[#E3E5E1]">
            {Object.entries(matches).map(([index, candidates]) => {
              const row = picked[Number(index)];
              if (!row) return null;
              const choice = decisions[index];
              const option =
                "rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A4D2E] disabled:opacity-50";
              const on = "border-[#1A4D2E] bg-[#1A4D2E] text-white";
              const off = "border-[#E3E5E1] bg-white text-[#1E2420] hover:bg-[#F5F6F4]";
              return (
                <li key={index} className="px-4 py-3">
                  <p className="text-sm font-medium">
                    {row.lastName}, {row.firstName}{" "}
                    <span className="font-normal text-[#606861]">(in this file)</span>
                  </p>
                  <div role="group" aria-label={`Same learner? ${row.lastName}, ${row.firstName}`} className="mt-2 flex flex-wrap gap-2">
                    {candidates.map((c) => (
                      <button
                        key={c.learnerId}
                        type="button"
                        aria-pressed={choice === c.learnerId}
                        disabled={pending}
                        onClick={() => setDecisions((cur) => ({ ...cur, [index]: c.learnerId }))}
                        className={cn(option, choice === c.learnerId ? on : off)}
                      >
                        Link to {c.name}
                        {c.classes.length > 0 ? ` (${c.classes.join(", ")})` : ""}
                      </button>
                    ))}
                    <button
                      type="button"
                      aria-pressed={choice === "new"}
                      disabled={pending}
                      onClick={() => setDecisions((cur) => ({ ...cur, [index]: "new" }))}
                      className={cn(option, choice === "new" ? on : off)}
                    >
                      Keep separate
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {undecided > 0 ? (
            <p className="mt-3 text-sm text-amber-700">
              Choose Link or Keep separate for {undecided} more {undecided === 1 ? "name" : "names"} to continue.
            </p>
          ) : null}
        </Card>
      ) : null}

      {pending ? (
        <ImportLoader compact message={chosenGrades.length > 0 ? "Saving learners and grades" : "Saving your learners"} />
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={runImport} disabled={!canImport}>
          {pending
            ? "Importing…"
            : `Import ${picked.length} ${picked.length === 1 ? "learner" : "learners"}${chosenGrades.length > 0 ? " and grades" : ""}${chosenInfo.length > 0 ? " and class details" : ""}`}
        </Button>
        <p className="text-sm text-[#606861]">
          Your file is read in your browser. Only the names you confirm are saved. LRNs stay in your file and are never sent to
          TeacherCo. Learners already in this class are skipped.
        </p>
      </div>
    </div>
  );
}