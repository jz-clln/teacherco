// src/features/exams/components/answer-key-editor.tsx

"use client";

import { useState } from "react";
import { ChevronDown, Mic, Square } from "lucide-react";
import { parseAnswerKeyText } from "@/lib/exams/key-parser";
import { formatItemRange } from "@/lib/exams/analytics";
import { choiceLabel, type AssessmentFormat } from "@/lib/exams/types";
import { useDictation, type DictationLang } from "./use-dictation";
import { Select } from "@/components/ui/select";
import { btnPrimary, btnQuiet, btnSecondary, field, label, muted } from "../ui";

export interface KeyDraft {
  itemNumber: number;
  /** "" = not set yet */
  answer: string;
  competency: string | null;
  points: number;
}

interface Props {
  format: AssessmentFormat;
  choices: string[];
  items: KeyDraft[];
  onChange: (items: KeyDraft[]) => void;
  competencySuggestions: string[];
}

export function AnswerKeyEditor({ format, choices, items, onChange, competencySuggestions }: Props) {
  const [text, setText] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [heard, setHeard] = useState<string | null>(null);
  const [lang, setLang] = useState<DictationLang>("en-PH");
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("");
  const [rangeName, setRangeName] = useState("");
  const [pointsFrom, setPointsFrom] = useState("1");
  const [pointsTo, setPointsTo] = useState("");
  const [rangePoints, setRangePoints] = useState("1");
  const [pointsError, setPointsError] = useState<string | null>(null);

  function apply(source: string) {
    const parsed = parseAnswerKeyText(source, choices, items.length);
    onChange(items.map((i) => ({ ...i, answer: parsed.answers[i.itemNumber] ?? i.answer })));
    setWarnings(parsed.warnings);
    return Object.keys(parsed.answers).length;
  }

  const dictation = useDictation(lang, (chunk) => {
    setHeard((h) => `${h ?? ""} ${chunk}`.trim());
    apply(chunk);
  });

  function applyRange() {
    const a = Math.max(1, parseInt(from, 10) || 1);
    const b = Math.min(items.length, parseInt(to, 10) || a);
    const name = rangeName.trim() || null;
    onChange(items.map((i) => (i.itemNumber >= a && i.itemNumber <= b ? { ...i, competency: name } : i)));
  }

  function applyPointsRange() {
    const a = Number.parseInt(pointsFrom, 10);
    const b = pointsTo.trim() ? Number.parseInt(pointsTo, 10) : a;
    const points = Number(rangePoints);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a || b > items.length) {
      setPointsError(`Choose an item range from 1 to ${items.length}.`);
      return;
    }
    if (!Number.isFinite(points) || points < 0.25 || points > 100) {
      setPointsError("Points must be between 0.25 and 100.");
      return;
    }
    setPointsError(null);
    onChange(items.map((i) => (i.itemNumber >= a && i.itemNumber <= b ? { ...i, points } : i)));
  }

  const setCount = items.filter((i) => i.answer !== "").length;
  const groups = new Map<string, number[]>();
  for (const i of items) if (i.competency) groups.set(i.competency, [...(groups.get(i.competency) ?? []), i.itemNumber]);

  const summaryClass =
    "flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#1A4D2E] [&::-webkit-details-marker]:hidden";
  const chevron = "h-5 w-5 shrink-0 text-[#606861] transition-transform [details[open]_&]:rotate-180";

  return (
    <div className="space-y-4">
      <details className="rounded-2xl border border-[#E8DFCA] bg-[#F5EFE6]">
        <summary className={summaryClass}>
          Fill faster: speak or paste the key
          <ChevronDown className={chevron} aria-hidden />
        </summary>
        <div className="space-y-3 border-t border-[#E8DFCA] p-4">
          <div className="flex flex-wrap items-center gap-2">
            {dictation.supported ? (
              <>
                <button
                  type="button"
                  onClick={dictation.listening ? dictation.stop : dictation.start}
                  aria-pressed={dictation.listening}
                  className={dictation.listening ? btnPrimary : btnSecondary}
                >
                  {dictation.listening ? <Square className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
                  {dictation.listening ? "Stop listening" : "Speak the key"}
                </button>
                <Select
                  name="dictationLang"
                  label="Speaking language"
                  hideLabel
                  compact
                  className="min-w-32"
                  value={lang}
                  disabled={dictation.listening}
                  onChange={(v) => setLang(v as DictationLang)}
                  options={[
                    { value: "en-PH", label: "English" },
                    { value: "fil-PH", label: "Filipino" },
                  ]}
                />
              </>
            ) : (
              <p className={`text-sm ${muted}`}>Voice input needs Chrome or Edge.</p>
            )}
          </div>

          {dictation.listening ? (
            <p role="status" className="text-sm text-[#1A4D2E]">
              Listening… {dictation.interim ? <span className={muted}>{dictation.interim}</span> : null}
            </p>
          ) : null}
          {dictation.error ? <p role="alert" className="text-sm text-[#9B2C2C]">{dictation.error}</p> : null}
          {heard ? <p className={`text-sm ${muted}`}>Heard: {heard}</p> : null}

          <div>
            <label htmlFor="key-text" className={label}>Type or paste</label>
            <textarea
              id="key-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder="1B 2C 3A 4D"
              className={field}
            />
            <button type="button" onClick={() => apply(text)} disabled={!text.trim()} className={`${btnSecondary} mt-2`}>
              Fill the grid
            </button>
          </div>

          {warnings.length ? (
            <ul role="status" className="list-disc space-y-1 pl-5 text-sm text-[#8A5A00]">
              {warnings.slice(0, 6).map((w) => <li key={w}>{w}</li>)}
              {warnings.length > 6 ? <li>and {warnings.length - 6} more</li> : null}
            </ul>
          ) : null}
        </div>
      </details>

      <details className="rounded-2xl border border-[#E8DFCA]">
        <summary className={summaryClass}>
          <span>
            What does each part test? <span className={`whitespace-nowrap font-normal ${muted}`}>(optional)</span>
          </span>
          <ChevronDown className={chevron} aria-hidden />
        </summary>
        <div className="border-t border-[#E8DFCA] p-4">
          <p className={`text-sm ${muted}`}>Name a competency for a range of items, for example items 1 to 5 → Fractions.</p>
          {/* Phones: From and To side by side, then Competency and Apply full width. Wider screens: one row. */}
          <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-[5rem_5rem_minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0">
              <label htmlFor="range-from" className={label}>From</label>
              <input id="range-from" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
            </div>
            <div className="min-w-0">
              <label htmlFor="range-to" className={label}>To</label>
              <input id="range-to" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} className={field} />
            </div>
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <label htmlFor="range-name" className={label}>Competency</label>
              <input
                id="range-name"
                list="competency-options"
                value={rangeName}
                onChange={(e) => setRangeName(e.target.value)}
                placeholder="Fractions"
                className={field}
              />
              <datalist id="competency-options">
                {competencySuggestions.map((n) => <option key={n} value={n} />)}
              </datalist>
            </div>
            <button type="button" onClick={applyRange} className={`${btnSecondary} col-span-2 w-full sm:col-span-1 sm:w-auto`}>
              Apply
            </button>
          </div>
        </div>
      </details>

      <details className="rounded-2xl border border-[#E8DFCA]">
        <summary className={summaryClass}>
          Set points for an item range
          <ChevronDown className={chevron} aria-hidden />
        </summary>
        <div className="border-t border-[#E8DFCA] p-4">
          <p className={`text-sm ${muted}`}>Apply the same points to every item in the range, such as items 46 to 50.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[5rem_5rem_7rem_auto] sm:items-end">
            <div className="min-w-0">
              <label htmlFor="points-from" className={label}>From</label>
              <input id="points-from" type="number" min="1" max={items.length} step="1" value={pointsFrom} onChange={(e) => setPointsFrom(e.target.value)} className={field} />
            </div>
            <div className="min-w-0">
              <label htmlFor="points-to" className={label}>To</label>
              <input id="points-to" type="number" min="1" max={items.length} step="1" placeholder={pointsFrom} value={pointsTo} onChange={(e) => setPointsTo(e.target.value)} className={field} />
            </div>
            <div className="min-w-0">
              <label htmlFor="range-points" className={label}>Points each</label>
              <input id="range-points" type="number" min="0.25" max="100" step="0.25" value={rangePoints} onChange={(e) => setRangePoints(e.target.value)} className={field} />
            </div>
            <button type="button" onClick={applyPointsRange} className={`${btnSecondary} col-span-2 w-full sm:col-span-1 sm:w-auto`}>
              Apply points
            </button>
          </div>
          {pointsError ? <p role="alert" className="mt-2 text-sm text-[#9B2C2C]">{pointsError}</p> : null}
        </div>
      </details>

      {groups.size ? (
        <ul className="flex flex-wrap gap-2 text-sm">
          {[...groups].map(([name, nums]) => (
            <li key={name} className="rounded-full bg-[#E8DFCA] px-3 py-1 text-[#1F2A22]">
              {name}: items {formatItemRange(nums)}
            </li>
          ))}
        </ul>
      ) : null}

      <section aria-labelledby="grid-heading">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 id="grid-heading" className="font-semibold">Answer key</h3>
          <p role="status" className={`text-base ${setCount === items.length ? "text-[#1A4D2E]" : muted}`}>
            {setCount} of {items.length} set
          </p>
        </div>
        <ul className="gap-x-2 sm:columns-2">
          {items.map((item) => (
            <li
              key={item.itemNumber}
              className={`mb-2 flex break-inside-avoid flex-nowrap items-center gap-2 rounded-xl border p-2 sm:gap-3 ${
                item.answer === "" ? "border-[#E0B14C] bg-[#FFF8E6]" : "border-[#E8DFCA] bg-white"
              }`}
            >
              <span className="w-6 shrink-0 text-center text-base font-semibold text-[#4F6F52] sm:w-8">{item.itemNumber}</span>
              {/* One row on every screen: equal-width buttons share the space, so they shrink to fit and never wrap. */}
              <div
                role="group"
                aria-label={`Correct answer for item ${item.itemNumber}`}
                className="grid min-w-0 flex-1 gap-1 sm:gap-1.5"
                style={{
                  gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))`,
                  maxWidth: `${choices.length * 3.5}rem`,
                }}
              >
                {choices.map((c) => {
                  const selected = item.answer === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onChange(items.map((i) => (i.itemNumber === item.itemNumber ? { ...i, answer: c } : i)))}
                      className={`min-h-10 min-w-0 rounded-lg border text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A4D2E] ${
                        selected
                          ? "border-[#1A4D2E] bg-[#1A4D2E] text-white"
                          : "border-[#E8DFCA] bg-white text-[#1F2A22] hover:bg-[#F5EFE6]"
                      }`}
                    >
                      {choiceLabel(c, format)}
                    </button>
                  );
                })}
              </div>
              <label className="ml-auto flex shrink-0 items-center gap-1 text-xs text-[#606861]">
                <input
                  type="number"
                  min="0.25"
                  max="100"
                  step="0.25"
                  aria-label={`Points for item ${item.itemNumber}`}
                  value={item.points}
                  onChange={(e) => {
                    const points = Number(e.target.value);
                    if (Number.isFinite(points) && points >= 0.25 && points <= 100) {
                      onChange(items.map((i) => (i.itemNumber === item.itemNumber ? { ...i, points } : i)));
                    }
                  }}
                  className="h-9 w-12 rounded-lg border border-[#E8DFCA] bg-white px-1 text-center text-sm text-[#1F2A22] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="hidden sm:inline">pts</span>
              </label>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={`${btnQuiet} mt-2`}
          onClick={() => onChange(items.map((i) => ({ ...i, answer: "" })))}
          disabled={setCount === 0}
        >
          Clear all answers
        </button>
      </section>
    </div>
  );
}