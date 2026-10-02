// src/features/exams/components/answer-key-editor.tsx

"use client";

import { useState } from "react";
import { Mic, Square } from "lucide-react";
import { parseAnswerKeyText } from "@/lib/exams/key-parser";
import { formatItemRange } from "@/lib/exams/analytics";
import type { AssessmentFormat } from "@/lib/exams/types";
import { ChoiceButtons } from "./choice-buttons";
import { useDictation, type DictationLang } from "./use-dictation";
import { Select } from "@/components/ui/select";
import { btnPrimary, btnQuiet, btnSecondary, field, label, muted } from "../ui";

export interface KeyDraft {
  itemNumber: number;
  /** "" = not set yet */
  answer: string;
  competency: string | null;
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

  const setCount = items.filter((i) => i.answer !== "").length;
  const groups = new Map<string, number[]>();
  for (const i of items) if (i.competency) groups.set(i.competency, [...(groups.get(i.competency) ?? []), i.itemNumber]);

  return (
    <div className="space-y-6">
      <section aria-labelledby="dictate-heading" className="rounded-2xl border border-[#E8DFCA] bg-[#F5EFE6] p-4">
        <h3 id="dictate-heading" className="font-semibold">Say or paste the answer key</h3>
        <p className={`mt-1 text-sm ${muted}`}>
          Try “number one B, number two C” or “1B 2C 3A”. Filipino works too. Check the grid below before saving.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
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
            <p className={`text-sm ${muted}`}>Voice input needs Chrome or Edge. You can still paste or tap answers.</p>
          )}
        </div>

        {dictation.listening ? (
          <p role="status" className="mt-3 text-sm text-[#1A4D2E]">
            Listening… {dictation.interim ? <span className={muted}>{dictation.interim}</span> : null}
          </p>
        ) : null}
        {dictation.error ? <p role="alert" className="mt-3 text-sm text-[#9B2C2C]">{dictation.error}</p> : null}
        {heard ? <p className={`mt-3 text-sm ${muted}`}>Heard: {heard}</p> : null}

        <div className="mt-3">
          <label htmlFor="key-text" className={label}>Type or paste</label>
          <textarea
            id="key-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="1 B  2 C  3 A  4 D"
            className={field}
          />
          <button type="button" onClick={() => apply(text)} disabled={!text.trim()} className={`${btnSecondary} mt-2`}>
            Fill the grid
          </button>
        </div>

        {warnings.length ? (
          <ul role="status" className="mt-3 list-disc space-y-1 pl-5 text-sm text-[#8A5A00]">
            {warnings.slice(0, 6).map((w) => <li key={w}>{w}</li>)}
            {warnings.length > 6 ? <li>and {warnings.length - 6} more</li> : null}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="comp-heading" className="rounded-2xl border border-[#E8DFCA] p-4">
        <h3 id="comp-heading" className="font-semibold">What does each part test? <span className={`font-normal ${muted}`}>(optional)</span></h3>
        <p className={`mt-1 text-sm ${muted}`}>
          Name a competency for a range of items, such as items 1 to 5 → Fractions. TeacherCo uses this to find learning gaps.
        </p>
        <div className="mt-3 grid grid-cols-[4.5rem_4.5rem_1fr_auto] items-end gap-2">
          <div>
            <label htmlFor="range-from" className={label}>From</label>
            <input id="range-from" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="range-to" className={label}>To</label>
            <input id="range-to" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} className={field} />
          </div>
          <div>
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
          <button type="button" onClick={applyRange} className={btnSecondary}>Apply</button>
        </div>
        {groups.size ? (
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {[...groups].map(([name, nums]) => (
              <li key={name} className="rounded-full bg-[#E8DFCA] px-3 py-1 text-[#1F2A22]">
                {name}: items {formatItemRange(nums)}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="grid-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 id="grid-heading" className="font-semibold">Answer key</h3>
          <p role="status" className={`text-sm ${setCount === items.length ? "text-[#1A4D2E]" : muted}`}>
            {setCount} of {items.length} set
          </p>
        </div>
        <ul className="gap-x-2 sm:columns-2">
          {items.map((item) => (
            <li
              key={item.itemNumber}
              className={`mb-2 flex break-inside-avoid items-center gap-3 rounded-xl border p-2.5 ${
                item.answer === "" ? "border-[#E0B14C] bg-[#FFF8E6]" : "border-[#E8DFCA] bg-white"
              }`}
            >
              <span className="w-8 shrink-0 text-center text-sm font-semibold text-[#4F6F52]">{item.itemNumber}</span>
              <ChoiceButtons
                groupLabel={`Correct answer for item ${item.itemNumber}`}
                choices={choices}
                format={format}
                value={item.answer || undefined}
                onChange={(v) => onChange(items.map((i) => (i.itemNumber === item.itemNumber ? { ...i, answer: v } : i)))}
              />
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={`${btnQuiet} mt-3`}
          onClick={() => onChange(items.map((i) => ({ ...i, answer: "" })))}
          disabled={setCount === 0}
        >
          Clear all answers
        </button>
      </section>
    </div>
  );
}