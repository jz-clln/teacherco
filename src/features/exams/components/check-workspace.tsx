// src/features/exams/components/check-workspace.tsx

"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Camera, Check, ImageIcon, PencilLine, X } from "lucide-react";
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
  const [saving, startSaving] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const learner = merged.find((r) => r.learnerId === learnerId) ?? null;
  const checkedCount = merged.filter(isChecked).length;

  function resetSheet() {
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

    const prepared = await compressImage(file);
    setPreview(URL.createObjectURL(prepared));

    try {
      const body = new FormData();
      body.set("assessmentId", assessment.id);
      body.set("image", prepared);
      const res = await fetch("/api/exams/read-sheet", { method: "POST", body });
      const json = (await res.json()) as { imagePath?: string; detections?: Detection[] | null; error?: string };

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
  const flaggedCount = order.filter((n) => cells[n]?.flagged).length;

  // Keyboard: tap a letter to answer the highlighted item. 0, X or Backspace = no answer.
  useEffect(() => {
    if (phase !== "review" || active === null) return;
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
  }, [phase, active, cells, assessment.choices, order]);

  useEffect(() => {
    if (active !== null) document.getElementById(`item-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

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
      resetSheet();
      setLearnerId(following?.learnerId ?? null);
    });
  }

  const visible = showAll || flaggedCount === 0 ? order : order.filter((n) => cells[n]?.flagged);
  const filteredRoster = merged.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      {/* Learner queue */}
      <aside aria-label="Learners" className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-2xl border border-[#E8DFCA] bg-white p-3">
          <p role="status" className="px-1 pb-2 text-sm font-medium">
            {checkedCount} of {merged.length} checked
          </p>
          <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-[#E8DFCA]">
            <div
              className="h-full bg-[#1A4D2E] transition-[width]"
              style={{ width: `${merged.length ? (checkedCount / merged.length) * 100 : 0}%` }}
            />
          </div>
          <label htmlFor="learner-search" className="sr-only">Find a learner</label>
          <input
            id="learner-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a learner"
            className={`${field} mb-2`}
          />
          <ul className="max-h-[50vh] space-y-0.5 overflow-y-auto">
            {filteredRoster.map((r) => (
              <li key={r.learnerId}>
                <button
                  type="button"
                  onClick={() => pick(r.learnerId)}
                  aria-current={r.learnerId === learnerId ? "true" : undefined}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-[#1A4D2E] ${
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
            {!filteredRoster.length ? <li className={`px-2.5 py-2 text-sm ${muted}`}>No learner found.</li> : null}
          </ul>
        </div>
      </aside>

      <section aria-label="Check answer sheet" className="min-w-0 space-y-4">
        {notice ? (
          <p role="status" className="rounded-xl border border-[#4F6F52]/40 bg-[#EAF2EC] p-3 text-sm text-[#1A4D2E]">{notice}</p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-xl border border-[#E5B4B4] bg-[#FBEAEA] p-3 text-sm text-[#9B2C2C]">{error}</p>
        ) : null}

        {!merged.length ? (
          <div className="rounded-2xl border border-[#E8DFCA] bg-white p-6">
            <h2 className="font-semibold">No learners in this class yet</h2>
            <p className={`mt-1 text-sm ${muted}`}>Import a class record first so scores can land on the right learner.</p>
          </div>
        ) : !learner ? (
          <div className="rounded-2xl border border-[#E8DFCA] bg-white p-6">
            <h2 className="font-semibold">All sheets are checked</h2>
            <p className={`mt-1 text-sm ${muted}`}>See the class results, learning gaps and item analysis.</p>
            <Link href={`/check/${assessment.id}`} className={`${btnPrimary} mt-4`}>View results</Link>
          </div>
        ) : phase !== "review" ? (
          <div className="rounded-2xl border border-[#E8DFCA] bg-white p-5">
            <h2 className="text-lg font-semibold">{learner.name}</h2>
            {isChecked(learner) ? (
              <p className="mt-1 text-sm text-[#8A5A00]">
                Already scored {learner.score} / {learner.maxScore}. Confirming a new sheet replaces it.
              </p>
            ) : (
              <p className={`mt-1 text-sm ${muted}`}>Photograph or upload this learner’s answer sheet.</p>
            )}

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
              <div role="status" className="mt-5 flex items-center gap-4 rounded-xl bg-[#F5EFE6] p-4">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Answer sheet being read" className="h-24 w-20 rounded-lg object-cover" />
                ) : null}
                <div>
                  <p className="font-medium">Reading the sheet…</p>
                  <p className={`text-sm ${muted}`}>This takes a few seconds. You review everything next.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button type="button" onClick={() => fileRef.current?.click()} className={btnPrimary}>
                    <Camera className="h-4 w-4" aria-hidden /> Take or upload photo
                  </button>
                  <button type="button" onClick={startManual} className={btnSecondary}>
                    <PencilLine className="h-4 w-4" aria-hidden /> Enter answers by hand
                  </button>
                </div>
                <ul className={`mt-5 list-disc space-y-1 pl-5 text-sm ${muted}`}>
                  <li>Lay the sheet flat, in good light, with all four edges in view.</li>
                  <li>The photo goes to the AI service that reads the marks. Fold or cover the name area to keep the learner’s name out of it.</li>
                  <li>You confirm every uncertain answer. Nothing is guessed.</li>
                </ul>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{learner.name}</h2>
              <button type="button" onClick={resetSheet} className={btnQuiet}>Start over</button>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              {preview ? (
                <figure className="xl:sticky xl:top-4 xl:self-start">
                  <div className={`overflow-auto rounded-2xl border border-[#E8DFCA] bg-white ${zoom ? "max-h-[75vh]" : "max-h-[60vh]"}`}>
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
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    {flaggedCount === 0
                      ? "Every answer was read clearly. Check anything that looks off."
                      : mode === "manual"
                        ? "Enter each answer. Tap a choice, or press its letter key."
                        : `${flaggedCount} answer${flaggedCount === 1 ? "" : "s"} need your review.`}
                  </p>
                  {flaggedCount > 0 ? (
                    <button type="button" onClick={() => setShowAll((s) => !s)} className={btnQuiet} aria-pressed={showAll}>
                      {showAll ? "Show uncertain only" : "Show all items"}
                    </button>
                  ) : null}
                </div>
                <p className={`mb-3 text-xs ${muted}`}>
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
              </div>
            </div>

            <div className="sticky bottom-0 -mx-4 border-t border-[#E8DFCA] bg-[#F5EFE6]/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
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
            </div>
          </div>
        )}
      </section>
    </div>
  );
}