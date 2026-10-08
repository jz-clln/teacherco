// src/features/scores/score-sheet.tsx

"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronUp, CircleAlert, LoaderCircle, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteManualAssessment, saveManualScores, type ScoreState } from "./actions";

export type ScoreRow = { id: string; name: string; score: number | null };

type RowState = "dirty" | "saving" | "error";

/** Wait this long after the last entry before saving, so a quick run down the list is one save. */
const SAVE_DELAY_MS = 500;

/** "" -> blank (fine), "17,5" -> 17.5, "25" with a total of 20 -> error. */
function parseScore(text: string, total: number): { value: number | null; error: string | null } {
  const t = text.trim().replace(",", ".");
  if (t === "") return { value: null, error: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > total) return { value: null, error: `0 to ${total}` };
  return { value: n, error: null };
}

function sameScore(a: string, b: string, total: number) {
  const x = parseScore(a, total);
  const y = parseScore(b, total);
  return !x.error && !y.error && x.value === y.value;
}

export function ScoreSheet({
  assessmentId,
  title,
  total,
  learners,
}: {
  assessmentId: string;
  title: string;
  total: number;
  learners: ScoreRow[];
}) {
  // The text in each box. It starts from what is saved, then belongs to the sheet.
  const [seed] = useState<Record<string, string>>(() =>
    Object.fromEntries(learners.map((l) => [l.id, l.score == null ? "" : String(l.score)])),
  );
  const [values, setValues] = useState(seed);
  const valuesRef = useRef(seed);
  const lastSaved = useRef<Record<string, string>>({ ...seed });

  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [savedOnce, setSavedOnce] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const pending = useRef(new Set<string>());
  const failed = useRef(new Set<string>());
  const flushing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startTransition] = useTransition();

  const inputs = useRef(new Map<string, HTMLInputElement>());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [blankOnly, setBlankOnly] = useState<Set<string> | null>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const [confirming, setConfirming] = useState(false);
  const [deleting, startDelete] = useTransition();

  const visible = blankOnly ? learners.filter((l) => blankOnly.has(l.id)) : learners;

  // ------------------------------------------------------------------ saving

  const setRows = (ids: string[], state: RowState | null) =>
    setRowState((current) => {
      const next = { ...current };
      for (const id of ids) {
        if (state) next[id] = state;
        else delete next[id];
      }
      return next;
    });

  /** Sends every queued row in one request. Rows edited again meanwhile are queued again. */
  const runFlush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      while (pending.current.size > 0) {
        const ids = [...pending.current];
        pending.current.clear();
        const sent = Object.fromEntries(ids.map((id) => [id, (valuesRef.current[id] ?? "").trim()]));
        setRows(ids, "saving");

        const data = new FormData();
        data.set("assessmentId", assessmentId);
        for (const id of ids) data.set(`score_${id}`, sent[id]);

        let result: ScoreState;
        try {
          result = await saveManualScores({}, data);
        } catch {
          result = { error: "TeacherCo could not reach the server." };
        }

        if (result.error) {
          for (const id of ids) failed.current.add(id);
          setRows(ids, "error");
          setLastError(result.error);
          continue;
        }

        for (const id of ids) {
          lastSaved.current[id] = sent[id];
          // Typed again while this was saving? Send that too.
          if (!sameScore(valuesRef.current[id] ?? "", sent[id], total)) pending.current.add(id);
        }
        setRows(ids, null);
        setLastError(null);
        setSavedOnce(true);
      }
    } finally {
      flushing.current = false;
    }
  }, [assessmentId, total]);

  const scheduleFlush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => startTransition(() => runFlush()), SAVE_DELAY_MS);
  }, [runFlush]);

  /** Called when the teacher leaves a box. Queues the score if it changed and is valid. */
  function commit(id: string) {
    const text = (valuesRef.current[id] ?? "").trim();
    if (sameScore(text, lastSaved.current[id] ?? "", total)) {
      pending.current.delete(id);
      setRows([id], null);
      return;
    }
    if (parseScore(text, total).error) return; // shown in red, never sent
    pending.current.add(id);
    setRows([id], "dirty");
    scheduleFlush();
  }

  function retry() {
    for (const id of failed.current) pending.current.add(id);
    failed.current.clear();
    setLastError(null);
    startTransition(() => runFlush());
  }

  // Save what is waiting when the teacher leaves the page, and warn if a save is still unfinished.
  useEffect(() => {
    const queue = pending;
    const waiting = timer;
    return () => {
      if (waiting.current) clearTimeout(waiting.current);
      if (queue.current.size > 0) void runFlush();
    };
  }, [runFlush]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pending.current.size > 0 || flushing.current || failed.current.size > 0) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // ------------------------------------------------------------------ keyboard

  // Keep the Prev / Next bar just above the phone keyboard.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setKeyboardOffset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  function focusRow(id: string) {
    const el = inputs.current.get(id);
    if (!el) return;
    el.focus({ preventScroll: true });
    requestAnimationFrame(() => el.select());
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView?.({ block: "center", behavior: calm ? "auto" : "smooth" });
  }

  /** Move to the learner above (-1) or below (+1). Past the last learner, the keyboard closes. */
  function go(fromId: string, delta: 1 | -1) {
    commit(fromId);
    const index = visible.findIndex((l) => l.id === fromId);
    const next = visible[index + delta];
    if (next) focusRow(next.id);
    else if (delta > 0) inputs.current.get(fromId)?.blur();
  }

  function startScoring() {
    const firstBlank = visible.find((l) => (valuesRef.current[l.id] ?? "").trim() === "");
    const target = firstBlank ?? visible[0];
    if (target) focusRow(target.id);
  }

  function setValue(id: string, text: string) {
    valuesRef.current = { ...valuesRef.current, [id]: text };
    setValues(valuesRef.current);
  }

  function toggleBlankOnly() {
    if (blankOnly) {
      setBlankOnly(null);
      return;
    }
    setBlankOnly(new Set(learners.filter((l) => (valuesRef.current[l.id] ?? "").trim() === "").map((l) => l.id)));
  }

  function confirmDelete() {
    const data = new FormData();
    data.set("assessmentId", assessmentId);
    startDelete(async () => {
      await deleteManualAssessment(data);
    });
  }

  // ------------------------------------------------------------------ numbers for the screen

  const errorOf = (id: string) => parseScore(values[id] ?? "", total).error;
  const scored = learners.filter((l) => (values[l.id] ?? "").trim() !== "" && !errorOf(l.id)).length;
  const invalid = learners.filter((l) => errorOf(l.id)).length;
  const states = Object.values(rowState);
  const nSaving = states.filter((s) => s === "saving" || s === "dirty").length;
  const nFailed = states.filter((s) => s === "error").length;
  const blankLeft = learners.length - scored - invalid;

  const statusText =
    nFailed > 0
      ? `${nFailed} not saved`
      : invalid > 0
        ? `Fix ${invalid} highlighted ${invalid === 1 ? "score" : "scores"}`
        : nSaving > 0
          ? "Saving…"
          : savedOnce
            ? "All changes saved"
            : "Scores save by themselves";
  const statusTone = nFailed > 0 || invalid > 0 ? "text-red-700" : "text-[#606861]";

  const activeIndex = activeId ? visible.findIndex((l) => l.id === activeId) : -1;
  const activeLearner = activeIndex >= 0 ? visible[activeIndex] : null;

  // ------------------------------------------------------------------ screen

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-[#E3E5E1] px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-[#1E2420]">{title}</h2>
            <p className="mt-0.5 text-sm text-[#606861]">Highest possible score: {total}</p>
          </div>
          <Button type="button" variant="ghost" className="gap-2" onClick={() => setConfirming(true)} disabled={deleting}>
            <Trash2 size={16} /> Delete activity
          </Button>
        </div>

        {learners.length > 0 ? (
          <>
            <div className="mt-4 flex items-center gap-3">
              <div
                role="progressbar"
                aria-label="Learners scored"
                aria-valuemin={0}
                aria-valuemax={learners.length}
                aria-valuenow={scored}
                className="h-2 flex-1 overflow-hidden rounded-full bg-[#E8DFCA]"
              >
                <div className="h-full rounded-full bg-[#1A4D2E] transition-all" style={{ width: `${(scored / learners.length) * 100}%` }} />
              </div>
              <p className="shrink-0 text-sm font-medium text-[#28332B]">
                {scored} of {learners.length} scored
              </p>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={startScoring}
                disabled={blankLeft === 0 && !blankOnly}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A4D2E] px-4 text-sm font-semibold text-white transition hover:bg-[#123820] disabled:cursor-not-allowed disabled:bg-[#C5D0C6]"
              >
                <Play size={15} aria-hidden="true" />
                {scored === 0 ? "Start scoring" : blankLeft > 0 ? "Continue with next blank" : "All scored"}
              </button>
              <button
                type="button"
                aria-pressed={Boolean(blankOnly)}
                onClick={toggleBlankOnly}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition ${
                  blankOnly
                    ? "border-[#1A4D2E] bg-[#EAF0EA] text-[#1A4D2E]"
                    : "border-[#E3E5E1] bg-white text-[#28332B] hover:bg-[#F5F6F4]"
                }`}
              >
                Show only learners without a score
              </button>
              <p role="status" className={`ml-auto flex items-center gap-2 text-sm font-medium ${statusTone}`}>
                {nSaving > 0 && nFailed === 0 ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : null}
                {statusText}
                {nFailed > 0 ? (
                  <button type="button" onClick={retry} className="tc-button tc-quiet font-semibold text-[#1A4D2E]">
                    Retry
                  </button>
                ) : null}
              </p>
            </div>
            {lastError && nFailed > 0 ? <p className="mt-2 text-sm text-red-700">{lastError}</p> : null}
          </>
        ) : null}
      </div>

      {learners.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-[#606861]">There are no active learners in this class yet.</p>
      ) : (
        <>
          {visible.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-[#606861]">Everyone has a score. Nice work.</p>
          ) : (
            <ul className="divide-y divide-[#E3E5E1]">
              {visible.map((learner) => {
                const number = learners.findIndex((l) => l.id === learner.id) + 1;
                const error = errorOf(learner.id);
                const state = rowState[learner.id];
                const hasSaved = (values[learner.id] ?? "").trim() !== "" && !error && !state;
                return (
                  <li key={learner.id} className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-5 sm:py-2.5">
                    {/* Status icon: left of the name on a phone (saves room for the name), right of the box on larger screens. */}
                    <span className="order-first flex size-5 shrink-0 items-center justify-center sm:order-last" aria-hidden="true">
                      {state === "saving" || state === "dirty" ? (
                        <LoaderCircle size={16} className="animate-spin text-[#8B928C]" />
                      ) : state === "error" || error ? (
                        <CircleAlert size={16} className="text-red-600" />
                      ) : hasSaved ? (
                        <Check size={16} className="text-[#1A4D2E]" />
                      ) : null}
                    </span>
                    <span className="hidden w-6 shrink-0 text-right text-xs tabular-nums text-[#8B928C] sm:block">{number}</span>
                    {/* One line. A long name is cut with "…", and the full name shows on hover or long press. */}
                    <label
                      htmlFor={`score_${learner.id}`}
                      title={learner.name}
                      className="min-w-0 flex-1 truncate text-[15px] leading-6 font-medium sm:text-base"
                    >
                      {learner.name}
                    </label>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <input
                        id={`score_${learner.id}`}
                        ref={(el) => {
                          if (el) inputs.current.set(learner.id, el);
                          else inputs.current.delete(learner.id);
                        }}
                        data-score
                        value={values[learner.id] ?? ""}
                        onChange={(e) => setValue(learner.id, e.target.value)}
                        onFocus={() => {
                          setActiveId(learner.id);
                          const el = inputs.current.get(learner.id);
                          requestAnimationFrame(() => el?.select());
                        }}
                        onBlur={() => {
                          commit(learner.id);
                          setTimeout(() => {
                            if (!document.activeElement?.hasAttribute("data-score")) setActiveId(null);
                          }, 100);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "ArrowDown") {
                            e.preventDefault();
                            go(learner.id, 1);
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            go(learner.id, -1);
                          }
                        }}
                        inputMode="decimal"
                        enterKeyHint="next"
                        autoComplete="off"
                        aria-invalid={error ? true : undefined}
                        aria-label={`Score for ${learner.name}`}
                        className={`h-12 w-22 rounded-xl border bg-white px-2 text-center text-lg font-semibold tabular-nums outline-none transition focus:ring-4 ${
                          error
                            ? "border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-500/10"
                            : "border-[#E3E5E1] focus:border-[#4F6F52] focus:ring-[#4F6F52]/10"
                        }`}
                      />
                      <span className="shrink-0 text-sm whitespace-nowrap text-[#8B928C]">/ {total}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="border-t border-[#E3E5E1] px-4 py-3 text-xs text-[#8B928C] sm:px-5">
            Scores save by themselves when you move to the next learner. A blank box means no score yet. It is never saved as zero.
          </p>
        </>
      )}

      {activeLearner
        ? createPortal(
            <div
              role="toolbar"
              aria-label="Score entry"
              style={{ bottom: keyboardOffset }}
              className="fixed inset-x-0 z-50 border-t border-[#E3E5E1] bg-white px-3 py-2 shadow-lg md:hidden"
            >
              <div className="mx-auto flex max-w-xl items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#1E2420]">{activeLearner.name}</p>
                  <p className="text-xs text-[#606861]">
                    {activeIndex + 1} of {visible.length} · {statusText}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Previous learner"
                  disabled={activeIndex === 0}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(activeLearner.id, -1)}
                  className="flex size-11 items-center justify-center rounded-xl border border-[#E3E5E1] text-[#1A4D2E] disabled:opacity-40"
                >
                  <ChevronUp size={20} />
                </button>
                <button
                  type="button"
                  aria-label="Next learner"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(activeLearner.id, 1)}
                  className="flex h-11 min-w-20 items-center justify-center gap-1 rounded-xl bg-[#1A4D2E] px-3 text-sm font-semibold text-white"
                >
                  Next <ChevronDown size={18} />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    commit(activeLearner.id);
                    inputs.current.get(activeLearner.id)?.blur();
                  }}
                  className="h-11 rounded-xl px-3 text-sm font-semibold text-[#1A4D2E]"
                >
                  Done
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}

      <ConfirmDialog
        open={confirming}
        title="Delete this activity?"
        description="The activity and every score typed into it will be removed. Your other records are not affected."
        confirmLabel="Yes, delete activity"
        destructive
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          confirmDelete();
        }}
      />
    </Card>
  );
}