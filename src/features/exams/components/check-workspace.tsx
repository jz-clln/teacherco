// src/features/exams/components/check-workspace.tsx

"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Camera, Check, ImageIcon, PencilLine, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { compressImage } from "@/lib/exams/image";
import { scoreAnswers, type ScorableItem } from "@/lib/exams/scoring";
import type { AssessmentFormat, Detection } from "@/lib/exams/types";
import { confirmSubmissionAction } from "../actions";
import { btnPrimary, btnQuiet, btnSecondary, field, muted } from "../ui";
import { ChoiceButtons } from "./choice-buttons";

interface RosterEntry {
  learnerId: string;
  name: string;
  score: number | null;
  maxScore: number | null;
}

interface Props {
  assessment: { id: string; title: string; format: AssessmentFormat; choices: string[] };
  items: ScorableItem[];
  roster: RosterEntry[];
  initialLearnerId?: string;
}

type Phase = "capture" | "reading" | "review";

interface Cell {
  extracted: string | null;
  confidence: number | null;
  issue: string | null;
  reason: string | null;
  flagged: boolean;
  /** undefined = teacher has not decided yet */
  final: string | undefined;
}

function nextUndecided(cells: Record<number, Cell>, order: number[], from: number): number | null {
  const start = Math.max(0, order.indexOf(from));
  for (let step = 1; step <= order.length; step += 1) {
    const n = order[(start + step) % order.length];
    if (n === undefined) continue;
    const cell = cells[n];
    if (cell?.flagged && cell.final === undefined) return n;
  }
  return null;
}

export function CheckWorkspace({ assessment, items, roster, initialLearnerId }: Props) {
  const order = useMemo(() => items.map((i) => i.itemNumber).sort((a, b) => a - b), [items]);

  const [saved, setSaved] = useState<Record<string, { score: number; maxScore: number }>>({});
  const merged = roster.map((r) => {
    const s = saved[r.learnerId];
    return s ? { ...r, score: s.score, maxScore: s.maxScore } : r;
  });
  const isChecked = (r: RosterEntry) => r.score !== null;

  const [learnerId, setLearnerId] = useState<string | null>(
    initialLearnerId ?? roster.find((r) => r.score === null)?.learnerId ?? null,
  );
  // The check popup is open while a learner's sheet is being checked.
  const [open, setOpen] = useState(Boolean(initialLearnerId));
  const [phase, setPhase] = useState<Phase>("capture");
  const [mode, setMode] = useState<"scan" | "manual">("scan");
  const [preview, setPreview] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [cells, setCells] = useState<Record<number, Cell>>({});
  const [active, setActive] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, startSaving] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Bumped whenever the sheet is reset, so a slow photo read cannot land in the wrong popup.
  const requestRef = useRef(0);

  const learner = merged.find((r) => r.learnerId === learnerId) ?? null;
  const checkedCount = merged.filter(isChecked).length;

  // Keep the native <dialog> in step with `open`.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Stop the page behind the popup from scrolling.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  function resetSheet() {
    requestRef.current += 1;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setImagePath(null);
    setCells({});
    setActive(null);
    setPhase("capture");
    setMode("scan");
    setError(null);
    setShowAll(false);
    setZoom(false);
  }

  function pick(id: string) {
    resetSheet();
    setNotice(null);
    setLearnerId(id);
    setOpen(true);
  }

  function closePopup() {
    resetSheet();
    setConfirmClose(false);
    setOpen(false);
  }

  // A sheet that is being reviewed asks first, in an in-app popup.
  function requestClose() {
    if (phase === "review") {
      setConfirmClose(true);
      return;
    }
    closePopup();
  }

  function startReview(next: Record<number, Cell>) {
    setCells(next);
    setActive(nextUndecided(next, order, 0) ?? null);
    setPhase("review");
  }

  function manualCells(): Record<number, Cell> {
    return Object.fromEntries(
      order.map((n) => [
        n,
        { extracted: null, confidence: null, issue: null, reason: "Enter this answer", flagged: true, final: undefined } satisfies Cell,
      ]),
    );
  }

  function startManual() {
    setMode("manual");
    startReview(manualCells());
  }

  async function onFile(file: File) {
    if (!learnerId) return;
    setError(null);
    setNotice(null);
    setPhase("reading");
    if (preview) URL.revokeObjectURL(preview);
    const token = (requestRef.current += 1);

    const prepared = await compressImage(file);
    if (token !== requestRef.current) return;
    setPreview(URL.createObjectURL(prepared));

    try {
      const body = new FormData();
      body.set("assessmentId", assessment.id);
      body.set("image", prepared);
      const res = await fetch("/api/exams/read-sheet", { method: "POST", body });
      const json = (await res.json()) as { imagePath?: string; detections?: Detection[] | null; error?: string };
      if (token !== requestRef.current) return;

      if (!res.ok) {
        setError(json.error ?? "Could not read this photo.");
        setPhase("capture");
        return;
      }
      setImagePath(json.imagePath ?? null);

      if (!json.detections) {
        setError(json.error ?? "Could not read this photo. Enter the answers by hand.");
        setMode("manual");
        startReview(manualCells());
        return;
      }

      setMode("scan");
      startReview(
        Object.fromEntries(
          json.detections.map((d) => [
            d.itemNumber,
            {
              extracted: d.answer,
              confidence: d.confidence,
              issue: d.issue,
              reason: d.reason,
              flagged: d.needsReview,
              final: d.needsReview ? undefined : (d.answer ?? ""),
            } satisfies Cell,
          ]),
        ),
      );
    } catch {
      if (token !== requestRef.current) return;
      setError("Connection problem. Check your internet and try the photo again.");
      setPhase("capture");
    }
  }

  function setFinal(n: number, value: string) {
    const current = cells[n];
    if (!current) return;
    const next = { ...cells, [n]: { ...current, final: value } };
    setCells(next);
    setActive(nextUndecided(next, order, n));
  }

  const finals = useMemo(() => {
    const out: Record<number, string | undefined> = {};
    for (const n of order) out[n] = cells[n]?.final;
    return out;
  }, [cells, order]);

  const live = useMemo(() => scoreAnswers(items, finals), [items, finals]);
  const resultByItem = useMemo(() => new Map(live.results.map((r) => [r.itemNumber, r])), [live]);
  const undecided = order.filter((n) => cells[n]?.flagged && cells[n]?.final === undefined);
  const answered = order.filter((n) => cells[n]?.final !== undefined).length;

  function markRestBlank() {
    setCells((prev) =>
      Object.fromEntries(Object.entries(prev).map(([k, c]) => [k, c.final === undefined ? { ...c, final: "" } : c])),
    );
    setActive(null);
  }
  const flaggedCount = order.filter((n) => cells[n]?.flagged).length;

  // Keyboard: tap a letter to answer the highlighted item. 0, X or Backspace = no answer.
  useEffect(() => {
    if (!open || confirmClose || phase !== "review" || active === null) return;
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toUpperCase();
      if (assessment.choices.includes(key)) {
        e.preventDefault();
        setFinal(active, key);
      } else if (key === "0" || key === "X" || key === "BACKSPACE") {
        e.preventDefault();
        setFinal(active, "");
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const i = order.indexOf(active);
        setActive(order[Math.min(order.length - 1, i + 1)] ?? active);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = order.indexOf(active);
        setActive(order[Math.max(0, i - 1)] ?? active);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // setFinal closes over cells and active, so rebind when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, confirmClose, phase, active, cells, assessment.choices, order]);

  useEffect(() => {
    if (active !== null) {
      document.getElementById(`item-${active}`)?.scrollIntoView({ block: mode === "manual" ? "center" : "nearest" });
    }
  }, [active, mode]);

  function confirm() {
    if (!learner) return;
    setError(null);
    startSaving(async () => {
      const result = await confirmSubmissionAction({
        assessmentId: assessment.id,
        learnerId: learner.learnerId,
        imagePath,
        mode,
        entries: order.map((n) => {
          const c = cells[n];
          return {
            itemNumber: n,
            extracted: c?.extracted ?? null,
            confidence: c?.confidence ?? null,
            issue: c?.issue ?? null,
            flagged: c?.flagged ?? true,
            resolved: c?.final !== undefined,
            final: c?.final ?? "",
          };
        }),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const nextSaved = { ...saved, [learner.learnerId]: { score: result.score, maxScore: result.maxScore } };
      setSaved(nextSaved);
      setNotice(`${learner.name}: ${result.score} / ${result.maxScore} (${result.percent}%) saved.`);
      const following = merged.find((r) => r.learnerId !== learner.learnerId && !nextSaved[r.learnerId] && r.score === null);
      closePopup();
      setLearnerId(following?.learnerId ?? null);
      if (following) {
        requestAnimationFrame(() =>
          document.getElementById(`learner-${following.learnerId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }),
        );
      }
    });
  }

  const visible = showAll || flaggedCount === 0 ? order : order.filter((n) => cells[n]?.flagged);
  const filteredRoster = merged.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()));
  const allChecked = merged.length > 0 && checkedCount === merged.length;

  return (
    <div className="space-y-4">
      {notice ? (
        <p role="status" className="rounded-xl border border-[#4F6F52]/40 bg-[#EAF2EC] p-3 text-sm text-[#1A4D2E]">{notice}</p>
      ) : null}

      {!merged.length ? (
        <div className="rounded-2xl border border-[#E8DFCA] bg-white p-6">
          <h2 className="font-semibold">No learners in this class yet</h2>
          <p className={`mt-1 text-sm ${muted}`}>Import a class record first so scores can land on the right learner.</p>
        </div>
      ) : (
        <>
          {allChecked ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E8DFCA] bg-white p-4">
              <div>
                <h2 className="font-semibold">All sheets are checked</h2>
                <p className={`text-sm ${muted}`}>See the class results, learning gaps and item analysis.</p>
              </div>
              <Link href={`/check/${assessment.id}`} className={btnPrimary}>View results</Link>
            </div>
          ) : null}

          {/* Learner list: tap a name to check that sheet in a popup. */}
          <section aria-label="Learners" className="rounded-2xl border border-[#E8DFCA] bg-white p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
              <p role="status" className="text-sm font-medium">
                {checkedCount} of {merged.length} checked
              </p>
              {!allChecked && checkedCount > 0 ? (
                <Link href={`/check/${assessment.id}`} className={btnQuiet}>View results</Link>
              ) : null}
            </div>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[#E8DFCA]">
              <div
                className="h-full bg-[#1A4D2E] transition-[width]"
                style={{ width: `${(checkedCount / merged.length) * 100}%` }}
              />
            </div>
            <label htmlFor="learner-search" className="sr-only">Find a learner</label>
            <input
              id="learner-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a learner"
              className={`${field} mb-3`}
            />
            <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {filteredRoster.map((r) => (
                <li key={r.learnerId}>
                  <button
                    id={`learner-${r.learnerId}`}
                    type="button"
                    onClick={() => pick(r.learnerId)}
                    aria-haspopup="dialog"
                    aria-current={r.learnerId === learnerId ? "true" : undefined}
                    className={`flex min-h-12 w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-[#1A4D2E] ${
                      r.learnerId === learnerId ? "bg-[#E8DFCA] font-semibold" : "hover:bg-[#F5EFE6]"
                    }`}
                  >
                    <span className="truncate">{r.name}</span>
                    {isChecked(r) ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-[#1A4D2E]">
                        <Check className="h-3.5 w-3.5" aria-hidden />
                        {r.score}/{r.maxScore}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
              {!filteredRoster.length ? <li className={`px-3 py-2 text-sm ${muted}`}>No learner found.</li> : null}
            </ul>
          </section>
        </>
      )}

      {/* Check popup: full screen on phones, centered window on larger screens. */}
      <dialog
        ref={dialogRef}
        aria-labelledby="check-dialog-title"
        onCancel={(e) => {
          e.preventDefault();
          requestClose();
        }}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) requestClose();
        }}
        className="m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 backdrop:bg-black/50 sm:m-auto sm:h-auto sm:max-h-[92vh] sm:w-[min(64rem,calc(100%-2rem))]"
      >
        {open && learner ? (
          <div className="flex h-dvh flex-col bg-[#F5EFE6] sm:h-auto sm:max-h-[92vh] sm:rounded-2xl">
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[#E8DFCA] bg-white px-4 py-3 sm:rounded-t-2xl">
              <div className="min-w-0">
                <h2 id="check-dialog-title" className="truncate text-lg font-semibold">{learner.name}</h2>
                <p className={`truncate text-sm ${muted}`}>{assessment.title}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {phase === "review" ? (
                  <button type="button" onClick={resetSheet} className={btnQuiet}>Start over</button>
                ) : null}
                <button type="button" onClick={requestClose} aria-label="Close" className={btnQuiet}>
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {error ? (
                <p role="alert" className="rounded-xl border border-[#E5B4B4] bg-[#FBEAEA] p-3 text-sm text-[#9B2C2C]">{error}</p>
              ) : null}

              {phase !== "review" ? (
                <div>
                  {isChecked(learner) ? (
                    <p className="mb-4 text-sm text-[#8A5A00]">
                      Already scored {learner.score} / {learner.maxScore}. Confirming a new sheet replaces it.
                    </p>
                  ) : null}

                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="sr-only"
                    aria-label="Answer sheet photo"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void onFile(f);
                    }}
                  />

                  {phase === "reading" ? (
                    <div role="status" className="flex items-center gap-4 rounded-xl bg-white p-4">
                      {preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={preview} alt="Answer sheet being read" className="h-24 w-20 rounded-lg object-cover" />
                      ) : null}
                      <div>
                        <p className="font-medium">Reading the sheet…</p>
                        <p className={`text-sm ${muted}`}>This takes a few seconds.</p>
                      </div>
                    </div>
                  ) : order.length === 0 ? (
                    <div className="rounded-xl border border-[#E0B14C] bg-[#FFF8E6] p-4 text-sm">
                      <p className="font-medium">This assessment has no answer key items yet.</p>
                      <p className={`mt-1 ${muted}`}>
                        Sheets are checked against a saved answer key. Create a new assessment and set its key first.
                      </p>
                      <Link href="/check/new" className={`${btnPrimary} mt-3`}>New assessment</Link>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button type="button" onClick={() => fileRef.current?.click()} className={`${btnPrimary} w-full py-3 sm:w-auto`}>
                        <Camera className="h-4 w-4" aria-hidden /> Take or upload photo
                      </button>
                      <button type="button" onClick={startManual} className={`${btnSecondary} w-full py-3 sm:w-auto`}>
                        <PencilLine className="h-4 w-4" aria-hidden /> Enter answers by hand
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                  {preview ? (
                    <figure className="xl:sticky xl:top-0 xl:self-start">
                      <div className={`overflow-auto rounded-2xl border border-[#E8DFCA] bg-white ${zoom ? "max-h-[60vh]" : "max-h-[34vh] xl:max-h-[60vh]"}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={preview}
                          alt={`Answer sheet of ${learner.name}`}
                          className={zoom ? "w-[200%] max-w-none" : "w-full"}
                        />
                      </div>
                      <figcaption className="mt-1.5 flex items-center justify-between text-sm">
                        <span className={`flex items-center gap-1.5 ${muted}`}><ImageIcon className="h-4 w-4" aria-hidden /> Photo</span>
                        <button type="button" onClick={() => setZoom((z) => !z)} className={btnQuiet} aria-pressed={zoom}>
                          {zoom ? "Fit to screen" : "Zoom in"}
                        </button>
                      </figcaption>
                    </figure>
                  ) : null}

                  <div className={preview ? "" : "xl:col-span-2"}>
                    {mode === "manual" ? (
                      <div>
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <p role="status" className="text-sm font-medium">
                            {answered} of {order.length} answered
                          </p>
                          {answered < order.length ? (
                            <button type="button" onClick={markRestBlank} className={btnQuiet}>
                              Mark the rest as no answer
                            </button>
                          ) : null}
                        </div>
                        <ul className="gap-x-2 sm:columns-2">
                          {order.map((n) => {
                            const c = cells[n];
                            if (!c) return null;
                            return (
                              <li
                                key={n}
                                id={`item-${n}`}
                                onClick={() => setActive(n)}
                                className={`mb-2 flex break-inside-avoid items-center gap-3 rounded-xl border p-2.5 ${
                                  c.final === undefined ? "border-[#E0B14C] bg-[#FFF8E6]" : "border-[#E8DFCA] bg-white"
                                } ${active === n ? "ring-2 ring-[#1A4D2E] ring-offset-1" : ""}`}
                              >
                                <span className="w-8 shrink-0 text-center text-sm font-semibold text-[#4F6F52]">{n}</span>
                                <ChoiceButtons
                                  groupLabel={`Answer for item ${n}`}
                                  choices={assessment.choices}
                                  format={assessment.format}
                                  value={c.final}
                                  onChange={(v) => setFinal(n, v)}
                                />
                                {c.final === "" ? <span className={`ml-auto text-xs ${muted}`}>No answer</span> : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : (
                      <>
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm">
                            {flaggedCount === 0
                              ? "Every answer was read clearly. Check anything that looks off."
                              : `${flaggedCount} answer${flaggedCount === 1 ? "" : "s"} need your review.`}
                          </p>
                          {flaggedCount > 0 ? (
                            <button type="button" onClick={() => setShowAll((s) => !s)} className={btnQuiet} aria-pressed={showAll}>
                              {showAll ? "Show uncertain only" : "Show all items"}
                            </button>
                          ) : null}
                        </div>
                        <p className={`mb-3 hidden text-xs sm:block ${muted}`}>
                          Keys: {assessment.choices.join(" / ")} to answer, 0 for no answer, arrows to move.
                        </p>

                        <ul className="grid gap-2 sm:grid-cols-2">
                          {visible.map((n) => {
                            const c = cells[n];
                            if (!c) return null;
                            const result = resultByItem.get(n);
                            const needs = c.flagged && c.final === undefined;
                            return (
                              <li
                                key={n}
                                id={`item-${n}`}
                                onClick={() => setActive(n)}
                                className={`rounded-xl border p-3 ${
                                  needs ? "border-[#E0B14C] bg-[#FFF8E6]" : "border-[#E8DFCA] bg-white"
                                } ${active === n ? "ring-2 ring-[#1A4D2E] ring-offset-1" : ""}`}
                              >
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <span className="text-sm font-semibold">Item {n}</span>
                                  {needs ? (
                                    <span className="flex items-center gap-1 text-xs font-medium text-[#8A5A00]">
                                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                                      {c.reason ?? "Needs review"}
                                    </span>
                                  ) : c.final !== undefined && result ? (
                                    <span
                                      className={`flex items-center gap-1 text-xs font-medium ${result.isCorrect ? "text-[#1A4D2E]" : "text-[#9B2C2C]"}`}
                                    >
                                      {result.isCorrect ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
                                      {result.isCorrect ? "Correct" : c.final === "" ? "No answer" : "Wrong"}
                                    </span>
                                  ) : null}
                                </div>
                                <ChoiceButtons
                                  groupLabel={`Answer for item ${n}`}
                                  choices={assessment.choices}
                                  format={assessment.format}
                                  value={c.final}
                                  suggestion={needs ? c.extracted : null}
                                  allowBlank
                                  onChange={(v) => setFinal(n, v)}
                                />
                                {needs && c.extracted ? (
                                  <p className={`mt-1.5 text-xs ${muted}`}>
                                    Detected {c.extracted}
                                    {c.confidence !== null ? ` (${Math.round(c.confidence * 100)}% sure)` : ""}. Tap to accept or choose another.
                                  </p>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>

                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {phase === "review" ? (
              <footer className="shrink-0 border-t border-[#E8DFCA] bg-white px-4 py-3 sm:rounded-b-2xl">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p role="status" className="text-sm">
                    <span className="text-lg font-semibold">{live.score} / {live.maxScore}</span>{" "}
                    <span className={muted}>
                      ({live.percent}%){undecided.length ? ` · provisional, ${undecided.length} to review` : ""}
                    </span>
                  </p>
                  <button type="button" onClick={confirm} disabled={undecided.length > 0 || saving} className={btnPrimary}>
                    {saving
                      ? "Saving…"
                      : undecided.length > 0
                        ? `Review ${undecided.length} more`
                        : isChecked(learner)
                          ? "Replace saved score"
                          : "Confirm score"}
                  </button>
                </div>
              </footer>
            ) : null}
          </div>
        ) : null}
      </dialog>

      <ConfirmDialog
        open={confirmClose}
        title="Close without saving?"
        description="This sheet has not been saved. If you close now, the answers you entered are discarded."
        confirmLabel="Discard sheet"
        cancelLabel="Keep checking"
        destructive
        onConfirm={closePopup}
        onCancel={() => setConfirmClose(false)}
      />
    </div>
  );
}