"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp, History, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { applyRecordSync, previewRecordSync, listSyncVersions, readSyncVersion, readSyncChanges, type SyncPreview, type SyncVersion } from "./sync-actions";
import type { Change, SyncInput } from "./sync-model";

const labels: Record<Change["kind"], string> = { learner: "New learners", new_score: "New scores", score: "Corrected scores", grade: "New or corrected grades", attendance: "Attendance changes", activity: "Activity changes", missing: "Missing / removed data — kept", protected: "Protected TeacherCo activities" };

export function ChangeReview({ changes }: { changes: Change[] }) {
  return <div className="space-y-3">{(Object.keys(labels) as Change["kind"][]).map(kind => {
    const rows = changes.filter(c => c.kind === kind);
    if (!rows.length) return null;
    return <ChangeGroup key={kind} kind={kind} rows={rows} />;
  })}</div>;
}

function ChangeGroup({ kind, rows }: { kind: Change["kind"]; rows: Change[] }) {
  const [open, setOpen] = useState(rows.length < 12);
  const [limit, setLimit] = useState(100);
  return <details className="rounded-xl border border-[#E3E5E1] bg-white p-4" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-semibold text-[#1A4D2E]">{labels[kind]} <span className="ml-2 rounded-full bg-[#EAF0EA] px-2 py-0.5">{rows.length}</span></summary>
      {open && <><div className="mt-3 max-h-96 overflow-auto"><table className="w-full text-left text-sm">
        <caption className="sr-only">{labels[kind]} comparison</caption>
        <thead className="sticky top-0 bg-[#F7F9F6]"><tr><th className="p-2">Learner / item</th><th className="p-2">Saved</th><th className="p-2">After sync</th></tr></thead>
        <tbody>{rows.slice(0, limit).map((c, i) => <tr key={i} className="border-t border-[#E3E5E1]"><th scope="row" className="min-w-40 p-2 font-normal">{c.label}</th><td className="min-w-24 p-2 text-[#606861]">{c.before}</td><td className="min-w-28 p-2">{c.after}</td></tr>)}</tbody>
      </table></div>{rows.length > limit && <Button variant="ghost" onClick={() => setLimit(n => n + 100)}>Show more ({limit} of {rows.length})</Button>}</>}
    </details>;
}

export function RecordSync({ classId, className, initialVersions, historyError }: { classId: string; className: string; initialVersions: SyncVersion[]; historyError?: string }) {
  const router = useRouter();
  const lock = useRef(false);
  const requestId = useRef("");
  const [busy, setBusy] = useState("");
  const [input, setInput] = useState<SyncInput | null>(null);
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [versions, setVersions] = useState(initialVersions);
  const [moreVersions, setMoreVersions] = useState(initialVersions.length === 50);
  const [versionError, setVersionError] = useState(historyError ?? "");
  const [versionChanges, setVersionChanges] = useState<Record<string, Change[]>>({});
  const historyRequests = useRef(new Set<string>());

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
    lock.current = true; setBusy("Reading your workbook…"); setError(""); setSuccess(""); setPreview(null); setInput(null); setConfirmed(false); setWarnings([]);
    try {
      const { readSyncWorkbook } = await import("./read-sync-workbook");
      const parsed = await readSyncWorkbook(file);
      setInput(parsed.input); setWarnings(parsed.warnings); setBusy("Comparing with saved records…");
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
      setPreview(null); setInput(null); setConfirmed(false);
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
      <label className="block text-sm font-medium">Updated class record (.xlsx)<input type="file" accept=".xlsx" disabled={Boolean(busy) || Boolean(historyError)} className="mt-2 block w-full rounded-xl border border-[#E3E5E1] bg-[#F7F9F6] p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#EAF0EA] file:px-3 file:py-2 file:text-[#1A4D2E]" onChange={e => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ""; void compare(file); }} /></label>
      <p className="flex items-start gap-2 text-sm text-[#606861]"><ShieldCheck size={18} className="shrink-0" />Blank cells and absent learners are kept, never automatically deleted. Typed and checked activities stay protected.</p>
    </Card>
    {busy && <p role="status" className="flex items-center gap-2 rounded-xl bg-[#EAF0EA] p-4 text-sm text-[#1A4D2E]"><Loader2 size={18} className="animate-spin" />{busy}</p>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {success && <p role="status" className="flex items-center gap-2 rounded-xl bg-[#EAF0EA] p-4 text-sm text-[#1A4D2E]"><CheckCircle2 size={18} />{success}</p>}
    {input && <div className="space-y-3">
      <div><h2 className="break-words text-xl font-semibold">Review {input.filename}</h2><p className="mt-1 text-sm text-[#606861]">{input.learners.length} learners · {input.sheets.length} of 3 term sheets · {preview?.count ?? "…"} changes to apply</p></div>
      <details className="rounded-xl border border-[#E3E5E1] bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Check detected learner names</summary><p className="mt-3 max-h-48 overflow-auto text-sm text-[#606861]">{input.learners.map(l => `${l.lastName}, ${l.firstName}`).join("; ")}</p></details>
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
      {versions.map(v => <details key={v.id} onToggle={e => { if (e.currentTarget.open) void loadChanges(v.id); }} className="rounded-xl border border-[#E3E5E1] bg-white p-4"><summary className="cursor-pointer break-words text-sm font-semibold">Version {v.version_number} · {v.filename}<span className="mt-1 block text-xs font-normal text-[#606861]">{new Date(v.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} · {v.change_count} changes and notices</span></summary><div className="mt-4 space-y-3">{versionChanges[v.id] ? <ChangeReview changes={versionChanges[v.id]} /> : <p role="status" className="text-sm">Loading changes…</p>}<Button variant="secondary" disabled={Boolean(busy)} onClick={() => void download(v)}>Download version data</Button></div></details>)}
      {moreVersions && <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void loadOlderVersions()}>Load older versions</Button>}
    </section>
  </div>;
}
