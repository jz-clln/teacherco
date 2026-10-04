"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp, History, Loader2, Search, ShieldCheck, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { applyRecordSync, previewRecordSync, listSyncVersions, readSyncVersion, readSyncChanges, type SyncPreview, type SyncVersion } from "./sync-actions";
import type { DisplayLearner } from "./read-sync-workbook";
import type { Change, SyncInput } from "./sync-model";

const labels: Record<Change["kind"], string> = { learner: "New learners", new_score: "New scores", score: "Corrected scores", grade: "New or corrected grades", attendance: "Attendance changes", activity: "Activity changes", missing: "Missing / removed data — kept", protected: "Protected TeacherCo activities" };

/** What the "items" under a learner are called, for the stats line. Other kinds show no item count. */
const ITEM_NOUN: Partial<Record<Change["kind"], [string, string]>> = {
  score: ["activity", "activities"],
  new_score: ["activity", "activities"],
  attendance: ["date", "dates"],
};

export function ChangeReview({ changes }: { changes: Change[] }) {
  return <div className="space-y-3">{(Object.keys(labels) as Change["kind"][]).map(kind => {
    const rows = changes.filter(c => c.kind === kind);
    if (!rows.length) return null;
    return <ChangeGroup key={kind} kind={kind} rows={rows} />;
  })}</div>;
}

/**
 * Labels arrive as one line: "Angeles, Andrie C. · Term 1 · Written Work 1".
 * A label starts with a learner only when its first part has a comma (Surname, First name).
 * Activity titles such as "Term 1 · Written Work 1" have no comma, so they stay whole.
 */
function splitLabel(label: string): { learner: string; item: string } {
  const parts = label.split(" · ");
  if (parts.length > 1 && parts[0].includes(",")) return { learner: parts[0], item: parts.slice(1).join(" · ") };
  return { learner: "", item: label };
}

const NUMBER = /^(-?\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/;

/** New minus old, only when both are numbers out of the same total ("5/10" to "3/10" is -2). */
function deltaOf(before: string, after: string): number | null {
  const a = NUMBER.exec(before.trim());
  const b = NUMBER.exec(after.trim());
  if (!a || !b || a[2] !== b[2]) return null;
  return Math.round((Number(b[1]) - Number(a[1])) * 100) / 100;
}

function Name({ value }: { value: string }) {
  const comma = value.indexOf(",");
  if (comma < 0) return <>{value}</>;
  return <><strong className="font-semibold">{value.slice(0, comma)}</strong>{value.slice(comma)}</>;
}

type ParsedRow = { learner: string; item: string; before: string; after: string; delta: number | null };

function ChangeGroup({ kind, rows }: { kind: Change["kind"]; rows: Change[] }) {
  const [open, setOpen] = useState(rows.length < 12);
  const [limit, setLimit] = useState(100);

  const parsed = useMemo<ParsedRow[]>(
    () => rows.map(c => ({ ...splitLabel(c.label), before: c.before, after: c.after, delta: deltaOf(c.before, c.after) })),
    [rows],
  );

  const stats = useMemo(() => {
    const learners = new Set<string>();
    const perItem = new Map<string, { count: number; up: number; down: number }>();
    let up = 0, down = 0, same = 0;
    for (const r of parsed) {
      if (!r.learner) continue;
      learners.add(r.learner);
      const entry = perItem.get(r.item) ?? { count: 0, up: 0, down: 0 };
      entry.count++;
      if (r.delta !== null) {
        if (r.delta > 0) { up++; entry.up++; }
        else if (r.delta < 0) { down++; entry.down++; }
        else same++;
      }
      perItem.set(r.item, entry);
    }
    return { learners: learners.size, perItem, up, down, same };
  }, [parsed]);

  const hasLearner = stats.perItem.size > 0;
  const hasDelta = stats.up + stats.down + stats.same > 0;
  const columns = 3 + (hasDelta ? 1 : 0);

  const noun = ITEM_NOUN[kind];
  const summary = [
    stats.learners > 0 ? `${stats.learners} ${stats.learners === 1 ? "learner" : "learners"}` : "",
    noun && stats.perItem.size > 0 ? `${stats.perItem.size} ${stats.perItem.size === 1 ? noun[0] : noun[1]}` : "",
    hasDelta && stats.down > 0 ? `${stats.down} went down` : "",
    hasDelta && stats.up > 0 ? `${stats.up} went up` : "",
    hasDelta && stats.same > 0 ? `${stats.same} unchanged` : "",
  ].filter(Boolean).join(" · ");

  const body = !open ? [] : parsed.slice(0, limit).flatMap((r, i, shown) => {
    const previous = shown[i - 1];
    // A heading starts whenever the activity changes from the row above.
    const startsGroup = Boolean(r.learner) && !(previous?.learner && previous.item === r.item);
    const out: React.ReactNode[] = [];
    if (startsGroup) {
      const group = stats.perItem.get(r.item) ?? { count: 0, up: 0, down: 0 };
      const detail = [
        `${group.count} ${group.count === 1 ? "learner" : "learners"}`,
        group.down > 0 ? `${group.down} down` : "",
        group.up > 0 ? `${group.up} up` : "",
      ].filter(Boolean).join(" · ");
      out.push(<tr key={`group-${i}`} className="bg-[#F7F9F6]"><th colSpan={columns} scope="colgroup" className="p-2 text-left text-xs font-semibold text-[#1A4D2E]">{r.item}<span className="ml-2 font-normal text-[#606861]">{detail}</span></th></tr>);
    }
    out.push(<tr key={i} className="border-t border-[#E3E5E1]">
      <th scope="row" className={cn("min-w-40 p-2 text-left font-normal", r.learner && "pl-4")}>
        {r.learner ? <><Name value={r.learner} /><span className="sr-only"> · {r.item}</span></> : r.item}
      </th>
      <td className="min-w-24 p-2 text-[#606861]">{r.before}</td>
      <td className="min-w-28 p-2">{r.after}</td>
      {hasDelta && <td className={cn("min-w-16 p-2 tabular-nums", r.delta !== null && r.delta > 0 && "text-[#1A4D2E]", r.delta !== null && r.delta < 0 && "text-red-700")}>
        {r.delta === null ? "" : r.delta > 0 ? `+${r.delta}` : r.delta < 0 ? `−${Math.abs(r.delta)}` : "0"}
      </td>}
    </tr>);
    return out;
  });

  return <details className="rounded-xl border border-[#E3E5E1] bg-white p-4" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-semibold text-[#1A4D2E]">
        {labels[kind]} <span className="ml-2 rounded-full bg-[#EAF0EA] px-2 py-0.5">{rows.length}</span>
        {summary && <span className="mt-1 block text-xs font-normal text-[#606861]">{summary}</span>}
      </summary>
      {open && <><div className="mt-3 max-h-96 overflow-auto"><table className="w-full text-left text-sm">
        <caption className="sr-only">{labels[kind]} comparison</caption>
        <thead className="sticky top-0 z-10 bg-[#F7F9F6]"><tr><th className="p-2">{hasLearner ? "Learner" : "Item"}</th><th className="p-2">Saved</th><th className="p-2">After sync</th>{hasDelta && <th className="p-2">Change</th>}</tr></thead>
        <tbody>{body}</tbody>
      </table></div>{rows.length > limit && <Button variant="ghost" onClick={() => setLimit(n => n + 100)}>Show more ({limit} of {rows.length})</Button>}</>}
    </details>;
}

/** Changes that are not notices. Used for the "N changes" badge next to a learner. */
const NOT_EDITS: Change["kind"][] = ["missing", "protected", "learner"];

/**
 * The learners found in the workbook, numbered and grouped the way the teacher's record is laid out
 * (MALE, then FEMALE), with male and female counts under the title. Badges show who is new to the
 * class and who has changes to apply. Sex is only used to group and count names here.
 * It is never sent to the server.
 */
export function LearnerNames({ people, changes }: { people: DisplayLearner[]; changes: Change[] | null }) {
  const [query, setQuery] = useState("");

  const { rows, newCount } = useMemo(() => {
    const isNew = new Set<string>();
    const edits = new Map<string, number>();
    for (const c of changes ?? []) {
      if (c.kind === "learner") isNew.add(c.label);
      else if (!NOT_EDITS.includes(c.kind)) {
        const who = c.label.split(" · ")[0];
        edits.set(who, (edits.get(who) ?? 0) + 1);
      }
    }
    const rows = people.map(p => {
      const label = `${p.lastName}, ${p.firstName}`;
      return { ...p, label, isNew: isNew.has(label), edits: edits.get(label) ?? 0 };
    });
    return { rows, newCount: rows.filter(r => r.isNew).length };
  }, [people, changes]);

  const grouped = rows.some(r => r.sex);
  const groups = (grouped
    ? [
        { title: "Male", members: rows.filter(r => r.sex === "M") },
        { title: "Female", members: rows.filter(r => r.sex === "F") },
        { title: "Not marked in the file", members: rows.filter(r => !r.sex) },
      ]
    : [{ title: "", members: rows }]
  ).filter(g => g.members.length > 0);

  const q = query.trim().toLowerCase();
  const summary = [
    ...groups.filter(g => g.title && g.title !== "Not marked in the file").map(g => `${g.members.length} ${g.title.toLowerCase()}`),
    ...(changes && newCount > 0 ? [`${newCount} new to this class`] : []),
  ].join(" · ");

  return <details open className="rounded-xl border border-[#E3E5E1] bg-white p-4">
    <summary className="cursor-pointer text-sm font-semibold">
      Check detected learner names <span className="ml-1 rounded-full bg-[#EAF0EA] px-2 py-0.5 text-[#1A4D2E]">{rows.length}</span>
      {summary && <span className="mt-1 block text-xs font-normal text-[#606861]">{summary}</span>}
    </summary>

    {rows.length > 12 && <label className="relative mt-3 block">
      <span className="sr-only">Search learners</span>
      <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8B928C]" />
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search a learner"
        autoComplete="off"
        className="w-full rounded-xl border border-[#E3E5E1] bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#4F6F52]"
      />
    </label>}

    <div className="mt-3 max-h-96 space-y-4 overflow-auto pr-1">
      {groups.map(group => {
        const shown = group.members
          .map((member, index) => ({ member, number: index + 1 }))
          .filter(({ member }) => !q || member.label.toLowerCase().includes(q));
        if (!shown.length) return null;
        return <section key={group.title || "all"} aria-label={group.title || "Learners"}>
          {group.title && <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#606861]">{group.title} <span className="font-normal">({group.members.length})</span></h3>}
          <ol className="columns-1 gap-x-8 text-sm sm:columns-2">
            {shown.map(({ member, number }) => <li key={member.label} className="flex break-inside-avoid items-baseline gap-2 border-b border-[#EEF0ED] py-1.5">
              <span className="w-6 shrink-0 text-right text-xs tabular-nums text-[#8B928C]">{number}</span>
              <span className="min-w-0 flex-1 wrap-break-word"><strong className="font-semibold">{member.lastName}</strong>, {member.firstName}</span>
              {member.isNew && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">New to class</span>}
              {member.edits > 0 && <span className="shrink-0 rounded-full bg-[#EAF0EA] px-2 py-0.5 text-xs font-medium text-[#1A4D2E]">{member.edits} {member.edits === 1 ? "change" : "changes"}</span>}
            </li>)}
          </ol>
        </section>;
      })}
      {q && !groups.some(g => g.members.some(m => m.label.toLowerCase().includes(q))) && <p className="text-sm text-[#606861]">No learner matches “{query.trim()}”.</p>}
    </div>
  </details>;
}

export function RecordSync({ classId, className, initialVersions, historyError, initialOpenVersion, focusedVersion }: { classId: string; className: string; initialVersions: SyncVersion[]; historyError?: string; initialOpenVersion?: string; focusedVersion?: SyncVersion }) {
  const router = useRouter();
  const lock = useRef(false);
  const requestId = useRef("");
  const [busy, setBusy] = useState("");
  const [input, setInput] = useState<SyncInput | null>(null);
  const [display, setDisplay] = useState<DisplayLearner[]>([]);
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dragging, setDragging] = useState(false);
  const [versions, setVersions] = useState(initialVersions);
  const [moreVersions, setMoreVersions] = useState(initialVersions.length === 50);
  const [versionError, setVersionError] = useState(historyError ?? "");
  const [versionChanges, setVersionChanges] = useState<Record<string, Change[]>>({});
  const historyRequests = useRef(new Set<string>());
  const disabled = Boolean(busy) || Boolean(historyError);
  const shownVersions = focusedVersion && !versions.some(v => v.id === focusedVersion.id) ? [...versions, focusedVersion] : versions;

  // Names to show. Falls back to the sync data (without grouping) if the display list does not line up.
  const people: DisplayLearner[] = input
    ? display.length === input.learners.length ? display : input.learners.map(l => ({ firstName: l.firstName, lastName: l.lastName, sex: "" }))
    : [];

  useEffect(() => {
    if (!initialOpenVersion) return;
    const detail = document.getElementById(`version-${initialOpenVersion}`);
    if (detail instanceof HTMLDetailsElement) { detail.open = true; detail.scrollIntoView?.({ block: "start" }); }
  }, [initialOpenVersion]);

  // A file dropped just outside the box would make the browser open or download it and lose this page.
  useEffect(() => {
    const stop = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); };
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => { window.removeEventListener("dragover", stop); window.removeEventListener("drop", stop); };
  }, []);

  function pickFiles(files?: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    if (list.length > 1) { setError("Drop one workbook at a time."); return; }
    if (!list[0].name.toLowerCase().endsWith(".xlsx")) { setError("Please choose an .xlsx workbook."); return; }
    void compare(list[0]);
  }
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

  async function loadOlderVersions() {
    if (lock.current || !versions.length) return;
    lock.current = true; setBusy("Loading older versions…");
    try {
      const result = await listSyncVersions(classId, versions[versions.length - 1].version_number);
      if (!result.ok) throw new Error(result.error);
      setVersions(previous => [...previous, ...result.data]); setMoreVersions(result.data.length === 50); setVersionError("");
    } catch (e) { setVersionError(e instanceof Error ? e.message : "Could not load older versions."); }
    finally { lock.current = false; setBusy(""); }
  }

  async function loadChanges(id: string) {
    if (historyRequests.current.has(id)) return;
    historyRequests.current.add(id);
    try {
      const result = await readSyncChanges(classId, id);
      if (!result.ok) throw new Error(result.error);
      setVersionChanges(previous => ({ ...previous, [id]: result.data }));
    } catch { historyRequests.current.delete(id); setVersionError("Could not load the changes. Close and reopen the version to retry."); }
  }

  async function compare(file?: File) {
    if (!file || lock.current) return;
    lock.current = true; setBusy("Reading your workbook…"); setError(""); setSuccess(""); setPreview(null); setInput(null); setDisplay([]); setConfirmed(false); setWarnings([]);
    try {
      const { readSyncWorkbook } = await import("./read-sync-workbook");
      const parsed = await readSyncWorkbook(file);
      setInput(parsed.input); setDisplay(parsed.display); setWarnings(parsed.warnings); setBusy("Comparing with saved records…");
      const result = await previewRecordSync(classId, parsed.input);
      if (!result.ok) throw new Error(result.error);
      requestId.current = crypto.randomUUID();
      setPreview(result.data);
    } catch (e) { setError(e instanceof Error ? ("issues" in e ? "Check the workbook’s learner names, three term sheets and attendance dates before syncing." : e.message) : "Could not compare this workbook."); }
    finally { lock.current = false; setBusy(""); }
  }
  async function refreshComparison() {
    if (!input || lock.current) return;
    lock.current = true; setBusy("Comparing again…"); setError(""); setConfirmed(false);
    try {
      const result = await previewRecordSync(classId, input);
      if (!result.ok) throw new Error(result.error);
      requestId.current = crypto.randomUUID(); setPreview(result.data);
    } catch (e) { setPreview(null); setError(e instanceof Error ? e.message : "Could not compare this workbook."); }
    finally { lock.current = false; setBusy(""); }
  }
  async function apply() {
    if (!input || !preview || !confirmed || lock.current) return;
    lock.current = true; setBusy("Saving changes and version history…"); setError("");
    try {
      const result = await applyRecordSync(classId, input, preview.revision, requestId.current);
      if (!result.ok) throw new Error(result.error);
      setSuccess(`Record synced. Version ${result.data.version} is saved, together with the previous records.`);
      setPreview(null); setInput(null); setDisplay([]); setConfirmed(false);
      const history = await listSyncVersions(classId);
      if (history.ok) { setVersions(history.data); setMoreVersions(history.data.length === 50); setVersionError(""); } else setVersionError(history.error);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "The response was interrupted. Retry to check whether this sync was saved."); }
    finally { lock.current = false; setBusy(""); }
  }
  async function download(version: SyncVersion) {
    if (lock.current) return;
    lock.current = true; setBusy("Preparing saved version…"); setError("");
    try {
      const result = await readSyncVersion(classId, version.id);
      if (!result.ok) throw new Error(result.error);
      const url = URL.createObjectURL(new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = `teacherco-record-version-${version.version_number}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not download this version."); }
    finally { lock.current = false; setBusy(""); }
  }
  return <div className="space-y-6" aria-busy={Boolean(busy)}>
    <Card className="space-y-4 p-5 sm:p-6">
      <div className="flex items-start gap-3"><FileUp className="mt-1 shrink-0 text-[#4F6F52]" /><div><h2 className="text-lg font-semibold">Upload the updated Excel record</h2><p className="mt-1 text-sm text-[#606861]">Compare against {className}. Check the learner list and all changes before saving. Your workbook stays on this device; only recognized record data is sent.</p></div></div>
      <label
        onDragEnter={e => { if (disabled || !hasFiles(e)) return; e.preventDefault(); setDragging(true); }}
        onDragOver={e => { if (disabled || !hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={e => { e.preventDefault(); setDragging(false); if (!disabled) pickFiles(e.dataTransfer.files); }}
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition",
          disabled ? "cursor-not-allowed border-[#E3E5E1] bg-[#F7F9F6] opacity-50"
            : dragging ? "cursor-copy border-[#1A4D2E] bg-[#EAF0EA]"
            : "cursor-pointer border-[#C9D3C9] bg-[#F7F9F6] hover:bg-[#EAF0EA]",
        )}
      >
        <UploadCloud size={32} className="mb-1 text-[#4F6F52]" aria-hidden />
        <span className="text-base font-semibold text-[#1A4D2E]">
          <span className="sm:hidden">Choose your Excel file</span>
          <span className="hidden sm:inline">{dragging ? "Drop it here" : "Drop your Excel file here"}</span>
        </span>
        <span className="text-sm text-[#606861]"><span className="hidden sm:inline">or click to choose a file · </span>.xlsx only</span>
        <input type="file" aria-label="Updated class record" accept=".xlsx" disabled={disabled} className="sr-only" onChange={e => { const files = e.currentTarget.files; pickFiles(files); e.currentTarget.value = ""; }} />
      </label>
      <p className="flex items-start gap-2 text-sm text-[#606861]"><ShieldCheck size={18} className="shrink-0" />Blank cells and absent learners are kept, never automatically deleted. Typed and checked activities stay protected.</p>
    </Card>
    {busy && <p role="status" className="flex items-center gap-2 rounded-xl bg-[#EAF0EA] p-4 text-sm text-[#1A4D2E]"><Loader2 size={18} className="animate-spin" />{busy}</p>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {success && <p role="status" className="flex items-center gap-2 rounded-xl bg-[#EAF0EA] p-4 text-sm text-[#1A4D2E]"><CheckCircle2 size={18} />{success}</p>}
    {input && <div className="space-y-3">
      <div><h2 className="wrap-break-word text-xl font-semibold">Review {input.filename}</h2><p className="mt-1 text-sm text-[#606861]">{input.learners.length} learners · {input.sheets.length} of 3 term sheets · {preview?.count ?? "…"} changes to apply</p></div>
      <LearnerNames people={people} changes={preview?.changes ?? null} />
      {warnings.map(w => <p key={w} className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{w}</p>)}
      {preview && <>
        <ChangeReview changes={preview.changes} />
        {preview.count === 0 ? <p className="rounded-xl bg-[#EAF0EA] p-4 text-sm">No new or corrected data to apply. Saved records are unchanged.</p> : <Card className="space-y-4 p-5">
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} disabled={Boolean(busy)} onChange={e => setConfirmed(e.target.checked)} className="mt-1 size-4 accent-[#1A4D2E]" /><span>I checked that this workbook belongs to <strong>{className}</strong> and reviewed the learners and changes above.</span></label>
          <Button onClick={() => void apply()} disabled={!confirmed || Boolean(busy)}>{busy ? "Please wait…" : `Apply ${preview.count} changes`}</Button>
          <p className="text-xs text-[#606861]">The saved version includes records before and after this sync. Missing entries remain unchanged.</p>
        </Card>}
      </>}
      <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void refreshComparison()}>Compare again</Button>
    </div>}
    <section className="space-y-3"><h2 className="flex items-center gap-2 text-xl font-semibold"><History size={20} />Version history</h2>
      <p className="text-sm text-[#606861]">Previous records are kept for every successful sync. View the changes or download a data snapshot, including the records before syncing.</p>
      {versionError && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{versionError}</p>}
      {!versions.length && !versionError && <p className="rounded-xl border border-[#E3E5E1] p-4 text-sm text-[#606861]">Your first sync will save the existing class record as its previous version.</p>}
      {shownVersions.map(v => <details id={`version-${v.id}`} key={v.id} onToggle={e => { if (e.currentTarget.open) void loadChanges(v.id); }} className="scroll-mt-20 rounded-xl border border-[#E3E5E1] bg-white p-4"><summary className="cursor-pointer wrap-break-word text-sm font-semibold">Version {v.version_number} · {v.filename}<span className="mt-1 block text-xs font-normal text-[#606861]">{new Date(v.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} · {v.change_count} changes and notices</span></summary><div className="mt-4 space-y-3">{versionChanges[v.id] ? <ChangeReview changes={versionChanges[v.id]} /> : <p role="status" className="text-sm">Loading changes…</p>}<Button variant="secondary" disabled={Boolean(busy)} onClick={() => void download(v)}>Download version data</Button></div></details>)}
      {moreVersions && <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void loadOlderVersions()}>Load older versions</Button>}
    </section>
  </div>;
}
