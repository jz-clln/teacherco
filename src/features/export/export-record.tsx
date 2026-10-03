// src/features/export/export-record.tsx

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getExportData, rememberExportedColumns } from "@/features/export/actions";
import { ImportLoader } from "@/features/learners/import-loader";
import { detectGradeSheet, type GradeSheet } from "@/lib/excel/grades";
import { colName, planExport, type ColumnRef, type ExportData } from "@/lib/excel/export-plan";
import { COMPONENT_LABEL } from "@/lib/grading/deped";
import { openWorkbook } from "@/lib/excel/parser";
import { openExporter, type Exporter } from "@/lib/excel/writer";
import type { SheetGrid } from "@/lib/excel/roster";
import { cn } from "@/lib/utils";

const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
const fmt = (n: number | null) => (n == null ? "blank" : String(Math.round(n * 100) / 100));
const SHOW_MAX = 300;

type Loaded = {
  fileName: string;
  grades: GradeSheet[];
  grids: Map<string, SheetGrid>;
  data: ExportData;
  exporter: Exporter;
  /** Assessment id -> title of the column it was exported into before. */
  exportedTitles: Record<string, string>;
  /** Assessment id -> that same column, found again in this file. */
  remembered: Record<string, ColumnRef>;
};

export function ExportRecord({ classId }: { classId: string }) {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("Opening your workbook");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [manual, setManual] = useState<Record<string, ColumnRef | null>>({});
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [formulas, setFormulas] = useState<Set<string>>(new Set());
  const [building, setBuilding] = useState(false);
  const [done, setDone] = useState<{ written: number; fileName: string } | null>(null);
  const run = useRef(0);

  async function onFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setDone(null);
    setStage("Opening your workbook");
    try {
      await nextPaint();
      const wb = await openWorkbook(file);
      setStage("Finding your score columns");
      await nextPaint();
      const grids = new Map<string, SheetGrid>();
      const grades: GradeSheet[] = [];
      for (const s of wb.sheets.filter((x) => !x.hidden)) {
        const grid = wb.read(s.name);
        grids.set(s.name, grid);
        const found = detectGradeSheet(grid, { keepEmpty: true, includeFree: true });
        if (found) grades.push(found);
      }
      if (grades.length === 0) {
        throw new Error('No score columns found. TeacherCo looks for a "Highest possible score" row in your term sheets.');
      }

      setStage("Getting your TeacherCo scores");
      await nextPaint();
      const [res, exporter] = await Promise.all([getExportData(classId), openExporter(file)]);
      if (!res.ok) throw new Error(res.error);

      // Activities exported into this file before go back into the same column.
      const remembered: Record<string, ColumnRef> = {};
      const claimed = new Set<string>();
      for (const a of res.data.assessments) {
        const title = a.activitySlot ?? res.exportedTitles[a.id];
        if (!title) continue;
        for (const g of grades) {
          const column = g.columns.find((c) => c.title === title);
          if (!column) continue;
          const key = `${g.sheet}|${column.col}`;
          if (!claimed.has(key)) {
            claimed.add(key);
            remembered[a.id] = { sheet: g.sheet, col: column.col };
          }
          break;
        }
      }

      // Free slots TeacherCo can fill by itself: same component and term, and every learner has a score.
      const first = planExport(grades, grids, res.data, remembered);
      const suggested: Record<string, ColumnRef> = {};
      for (const u of first.unmapped) if (u.suggested) suggested[u.id] = u.suggested;

      setLoaded({ fileName: file.name, grades, grids, data: res.data, exporter, exportedTitles: res.exportedTitles, remembered });
      setManual({ ...remembered, ...suggested });
      setSkip(new Set());
      setFormulas(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this workbook.");
    } finally {
      setBusy(false);
    }
  }

  const plan = useMemo(
    () => (loaded ? planExport(loaded.grades, loaded.grids, loaded.data, manual) : null),
    [loaded, manual],
  );

  // Which target cells hold a formula? Those are never overwritten.
  useEffect(() => {
    if (!loaded || !plan) return;
    const id = ++run.current;
    void loaded.exporter.formulaCells([...plan.writes, ...plan.hpsWrites]).then((set) => {
      if (id === run.current) setFormulas(set);
    });
  }, [loaded, plan]);

  // A score that needs a highest possible score in a formula cell cannot be written either.
  const writes = plan ? plan.writes.filter((w) => !formulas.has(w.key) && !(w.needs && formulas.has(w.needs))) : [];
  const chosen = writes.filter((w) => !skip.has(w.key));
  /** Highest possible scores written into free slots that really receive a score. */
  const hpsChosen = plan ? plan.hpsWrites.filter((h) => !formulas.has(h.key) && chosen.some((w) => w.needs === h.key)) : [];
  const added = chosen.filter((w) => w.kind === "new").length;
  const replaced = chosen.filter((w) => w.kind === "changed");
  const changedAll = writes.filter((w) => w.kind === "changed");

  /** Checked or typed-in activities that really received scores, and the column each one went into. */
  function filledColumns() {
    if (!loaded) return [];
    const items: { assessmentId: string; columnTitle: string }[] = [];
    for (const [assessmentId, ref] of Object.entries(manual)) {
      if (!ref) continue;
      const assessment = loaded.data.assessments.find((a) => a.id === assessmentId);
      const column = loaded.grades.find((g) => g.sheet === ref.sheet)?.columns.find((c) => c.col === ref.col);
      if (!assessment || !column) continue;
      const wrote = chosen.some((w) => w.title === assessment.title && w.sheet === ref.sheet && w.col === ref.col);
      if (wrote) items.push({ assessmentId, columnTitle: column.title });
    }
    return items;
  }

  async function download() {
    if (!loaded || chosen.length === 0) return;
    setBuilding(true);
    setError(null);
    try {
      const { blob, written: cells } = await loaded.exporter.build([...hpsChosen, ...chosen]);
      const written = Math.max(0, cells - hpsChosen.length);
      const name = `${loaded.fileName.replace(/\.xlsx$/i, "")} (TeacherCo).xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDone({ written, fileName: name });

      // Remember where each checked or typed-in activity went, so a later import does not count it twice.
      const items = filledColumns();
      if (items.length > 0) {
        const saved = await rememberExportedColumns({ classId, items });
        if (!saved.ok) setError(saved.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the file. Your original file was not changed.");
    } finally {
      setBuilding(false);
    }
  }

  // ------------------------------------------------------------ first step
  if (!loaded || !plan) {
    return (
      <div className="space-y-4">
        {busy ? (
          <ImportLoader message={stage} />
        ) : (
          <label
            onDragEnter={(e) => (e.preventDefault(), setDragging(true))}
            onDragOver={(e) => (e.preventDefault(), (e.dataTransfer.dropEffect = "copy"))}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void onFile(e.dataTransfer.files[0]);
            }}
            className={cn(
              "teacherco-card flex cursor-pointer flex-col items-center justify-center border-2 border-dashed p-10 text-center transition focus-within:border-[#4F6F52]",
              dragging && "border-[#1A4D2E] bg-[#EAF0EA]",
            )}
          >
            <UploadCloud size={32} className="text-[#1A4D2E]" />
            <span className="mt-3 font-semibold">{dragging ? "Drop your file" : "Choose your class record"}</span>
            <span className="mt-1 max-w-md text-sm text-[#606861]">
              Use the same Excel file you imported (or a newer copy of it). TeacherCo adds your scores to it and gives you a
              new file. Your original is never changed.
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
        )}
        {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      </div>
    );
  }

  // ------------------------------------------------------------ preview step
  const nothing = writes.length === 0;
  const unmapped = plan.unmapped.filter((u) => !loaded.remembered[u.id]);
  const rememberedAssessments = loaded.data.assessments.filter((a) => loaded.remembered[a.id]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="mt-0.5 text-[#4F6F52]" size={22} />
            <div>
              <h2 className="text-lg font-semibold">{loaded.fileName}</h2>
              <p className="mt-1 text-sm text-[#606861]">
                {plan.matched.length} of your score columns have TeacherCo scores. Check what will be written, then download.
              </p>
            </div>
          </div>
          <Button variant="ghost" onClick={() => (setLoaded(null), setDone(null))}>
            Choose a different file
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[#EAF0EA] p-4">
            <p className="text-2xl font-bold text-[#1A4D2E]">{added}</p>
            <p className="text-sm text-[#606861]">scores added to blank cells</p>
          </div>
          <div className="rounded-xl bg-[#E8DFCA]/60 p-4">
            <p className="text-2xl font-bold">{replaced.length}</p>
            <p className="text-sm text-[#606861]">scores replace a different number</p>
          </div>
          <div className="rounded-xl bg-[#F5F6F4] p-4">
            <p className="text-2xl font-bold">{plan.unchanged}</p>
            <p className="text-sm text-[#606861]">already match, left as they are</p>
          </div>
        </div>
      </Card>

      {rememberedAssessments.length > 0 ? (
        <Card>
          <h2 className="text-lg font-semibold">Filled before</h2>
          <p className="mt-1 text-sm text-[#606861]">
            These activities were exported into your file earlier, so TeacherCo uses the same columns again instead of filling a
            second one.
          </p>
          <ul className="mt-3 divide-y divide-[#E3E5E1] rounded-xl border border-[#E3E5E1]">
            {rememberedAssessments.map((a) => {
              const ref = loaded.remembered[a.id];
              const on = Boolean(manual[a.id]);
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <p className="text-sm">
                    <span className="font-medium">{a.title}</span>
                    <span className="text-[#606861]">
                      {" "}
                      → {loaded.exportedTitles[a.id]} ({ref.sheet} {colName(ref.col)})
                    </span>
                  </p>
                  <button
                    type="button"
                    className="text-sm font-medium text-[#1A4D2E] hover:underline"
                    onClick={() => setManual((m) => ({ ...m, [a.id]: on ? null : ref }))}
                  >
                    {on ? "Don't export" : "Export again"}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {unmapped.length > 0 ? (
        <Card>
          <h2 className="text-lg font-semibold">Scores that are not in your file yet</h2>
          <p className="mt-1 text-sm text-[#606861]">
            These were made or checked in TeacherCo. Each one goes into a free column of the same kind in your record. You do not
            need to prepare the column: TeacherCo also fills in its highest possible score.
          </p>
          <ul className="mt-3 divide-y divide-[#E3E5E1] rounded-xl border border-[#E3E5E1]">
            {unmapped.map((u) => (
              <li key={u.id} className="grid items-start gap-2 px-4 py-3 sm:grid-cols-2">
                <div className="text-sm">
                  <p>
                    <span className="font-medium">{u.title}</span>{" "}
                    <span className="text-[#606861]">· {u.total} points</span>
                  </p>
                  {u.component ? <p className="text-xs text-[#606861]">{COMPONENT_LABEL[u.component]}</p> : null}
                  {u.heldBack && !manual[u.id] ? (
                    <p className="mt-1 text-xs text-amber-700">
                      Not chosen for you: only {u.heldBack.of - u.heldBack.missing} of {u.heldBack.of} learners have a score. Once it is in
                      column {u.heldBack.column}, the other {u.heldBack.missing} count as 0 in the term total. Choose the column yourself if
                      you still want it.
                    </p>
                  ) : null}
                </div>
                {u.candidates.length === 0 ? (
                  <p className="text-xs text-amber-700">
                    No free {u.component ? COMPONENT_LABEL[u.component] : "score"} column in your file. Add a column header (for example
                    WW6) in Excel, then choose the file again.
                  </p>
                ) : (
                  <select
                    aria-label={`Column for ${u.title}`}
                    value={manual[u.id] ? `${manual[u.id]!.sheet}|${manual[u.id]!.col}` : ""}
                    onChange={(e) => {
                      const [sheet, col] = e.target.value.split("|");
                      setManual((m) => ({ ...m, [u.id]: e.target.value ? { sheet, col: Number(col) } : null }));
                    }}
                    className="w-full rounded-lg border border-[#E3E5E1] bg-white px-2 py-2 text-sm outline-none focus:border-[#4F6F52]"
                  >
                    <option value="">Don&apos;t export this one</option>
                    {u.candidates.map((c) => (
                      <option key={`${c.sheet}|${c.col}`} value={`${c.sheet}|${c.col}`}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {hpsChosen.length > 0 ? (
        <Card>
          <h2 className="text-lg font-semibold">Highest possible scores TeacherCo will fill in</h2>
          <p className="mt-1 text-sm text-[#606861]">
            The same number you would type under &quot;Highest possible score&quot; by hand. Your sheet&apos;s totals and term grades
            update from it.
          </p>
          <ul className="mt-3 divide-y divide-[#E3E5E1] rounded-xl border border-[#E3E5E1] text-sm">
            {hpsChosen.map((h) => (
              <li key={h.key} className="px-4 py-3">
                <p>
                  <span className="font-medium">{h.title}</span>
                  <span className="text-[#606861]">
                    {" "}
                    → {h.sheet} {h.address} = {h.value}
                  </span>
                </p>
                {h.missing ? (
                  <p className="mt-1 text-xs text-amber-700">
                    {h.missing} of {h.of} learners have no score for it. They count as 0 in the term total, so their grades can drop.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {changedAll.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <details open={changedAll.length <= 12}>
            <summary className="cursor-pointer px-5 py-4 text-lg font-semibold">
              Numbers that will be replaced <span className="text-sm font-normal text-[#606861]">({changedAll.length})</span>
            </summary>
            <div className="flex flex-wrap gap-2 border-t border-[#E3E5E1] px-5 py-3 text-sm">
              <button type="button" className="font-medium text-[#1A4D2E] hover:underline" onClick={() => setSkip(new Set())}>
                Replace all
              </button>
              <span className="text-[#606861]">·</span>
              <button
                type="button"
                className="font-medium text-[#1A4D2E] hover:underline"
                onClick={() => setSkip(new Set(changedAll.map((w) => w.key)))}
              >
                Keep my file&apos;s numbers
              </button>
            </div>
            <div className="max-h-96 overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-[#F5F6F4] text-xs text-[#606861]">
                  <tr>
                    <th className="px-4 py-2 font-medium"><span className="sr-only">Replace</span></th>
                    <th className="px-2 py-2 font-medium">Learner</th>
                    <th className="px-2 py-2 font-medium">Cell</th>
                    <th className="px-2 py-2 font-medium">Score</th>
                    <th className="px-2 py-2 font-medium">In your file</th>
                    <th className="px-2 py-2 font-medium">TeacherCo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E5E1]">
                  {changedAll.slice(0, SHOW_MAX).map((w) => (
                    <tr key={w.key} className={cn(skip.has(w.key) && "text-[#8B928C]")}>
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Replace ${w.address}`}
                          checked={!skip.has(w.key)}
                          onChange={(e) =>
                            setSkip((cur) => {
                              const next = new Set(cur);
                              if (e.target.checked) next.delete(w.key);
                              else next.add(w.key);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-2">{w.learner}</td>
                      <td className="px-2 py-2 text-[#606861]">{w.sheet} {w.address}</td>
                      <td className="px-2 py-2 text-[#606861]">{w.title.split(" · ").pop()}</td>
                      <td className="px-2 py-2">{fmt(w.old)}</td>
                      <td className="px-2 py-2 font-medium">{fmt(w.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {changedAll.length > SHOW_MAX ? (
                <p className="px-5 py-3 text-xs text-[#606861]">Showing the first {SHOW_MAX}. The rest follow the buttons above.</p>
              ) : null}
            </div>
          </details>
        </Card>
      ) : null}

      {(formulas.size > 0 || plan.keptText > 0 || plan.unknownLearners.length > 0 || plan.ambiguousLearners.length > 0 || plan.mismatched.length > 0) ? (
        <Card className="space-y-2 bg-amber-50 text-sm text-amber-900">
          <h2 className="font-semibold">Left alone</h2>
          {formulas.size > 0 ? <p>{formulas.size} cells hold a formula, so they were not touched.</p> : null}
          {plan.keptText > 0 ? <p>{plan.keptText} cells hold text such as &quot;ABS&quot;, so they were not touched.</p> : null}
          {plan.mismatched.map((m) => (
            <p key={m.title}>
              {m.title}: your file says {m.fileTotal} points but TeacherCo has {m.appTotal}. Not exported.
            </p>
          ))}
          {plan.unknownLearners.length > 0 ? (
            <p>
              {plan.unknownLearners.length} {plan.unknownLearners.length === 1 ? "name" : "names"} in your file are not in this class
              ({plan.unknownLearners.slice(0, 3).join("; ")}
              {plan.unknownLearners.length > 3 ? "…" : ""}).
            </p>
          ) : null}
          {plan.ambiguousLearners.length > 0 ? (
            <p>
              {plan.ambiguousLearners.length} {plan.ambiguousLearners.length === 1 ? "name appears" : "names appear"} twice in the same sheet
              ({plan.ambiguousLearners.slice(0, 3).join("; ")}
              {plan.ambiguousLearners.length > 3 ? "…" : ""}). TeacherCo matches by name, so those rows were not touched.
            </p>
          ) : null}
        </Card>
      ) : null}

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {done ? (
        <div className="space-y-1.5 rounded-xl bg-green-50 p-3 text-sm text-green-800" role="status">
          <p>
            Done. {done.written} {done.written === 1 ? "score was" : "scores were"} written to <strong>{done.fileName}</strong>.
          </p>
          <p>
            Open it in Excel or Google Sheets. If Excel shows a yellow bar, click <strong>Enable Editing</strong>. Your totals and
            grades update as soon as the file opens for editing. A phone or Drive preview can still show the old totals, so open
            the file in the Excel or Sheets app to see the new ones.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void download()} disabled={nothing || chosen.length === 0 || building}>
          <Download size={16} className="mr-2" />
          {building ? "Building your file…" : nothing ? "Nothing to export" : `Download updated record (${chosen.length})`}
        </Button>
        <p className="text-sm text-[#606861]">
          {nothing
            ? "Your file already has all of TeacherCo's scores."
            : "Done in your browser. Only the score cells above change. Formulas, logos and formatting stay as they are."}
        </p>
      </div>
    </div>
  );
}