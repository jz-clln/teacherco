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
  const [ranges, setRanges] = useState(() => {
    const rows: { from: string; to: string; name: string }[] = [];
    for (const item of items) {
      if (!item.competency) continue;
      const last = rows.at(-1);
      if (last && last.name === item.competency && Number(last.to) + 1 === item.itemNumber) last.to = String(item.itemNumber);
      else rows.push({ from: String(item.itemNumber), to: String(item.itemNumber), name: item.competency });
    }
    return rows.length ? rows : [{ from: '1', to: '', name: '' }];
  });
  const [rangeError, setRangeError] = useState('');
  const [rangeNotice, setRangeNotice] = useState('');
  function updateRange(index: number, key: 'from' | 'to' | 'name', value: string) {
    setRanges(rows => rows.map((row, i) => i === index ? { ...row, [key]: value } : row));
    setRangeError(''); setRangeNotice('');
  }

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

  function applyRanges() {
    const parsed = ranges.map(row => ({ from: Number(row.from), to: Number(row.to), name: row.name.trim() }));
    const used = new Set<number>();
    for (const [index, row] of parsed.entries()) {
      if (!Number.isInteger(row.from) || !Number.isInteger(row.to) || row.from < 1 || row.to < row.from || row.to > items.length || !row.name) {
        setRangeError(`Range ${index + 1}: enter a competency and whole item numbers from 1 to ${items.length}.`);
        setRangeNotice(''); return;
      }
      for (let n = row.from; n <= row.to; n++) {
        if (used.has(n)) { setRangeError(`Item ${n} appears in more than one range. Use non-overlapping ranges.`); setRangeNotice(''); return; }
        used.add(n);
      }
    }
    onChange(items.map(item => ({ ...item, competency: parsed.find(row => item.itemNumber >= row.from && item.itemNumber <= row.to)?.name ?? null })));
    setRangeError(''); setRangeNotice('Competency ranges applied. Save the answer key to keep these changes.');
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
          <p className={`text-sm ${muted}`}>Add a competency for each item range, such as 1 to 10 Addition, 11 to 20 Subtraction, 21 to 30 Multiplication, and 31 to 50 Division.</p>
          <div className="mt-3 space-y-3">
            {ranges.map((row, index) => <div key={index} className="grid grid-cols-2 items-end gap-2 rounded-xl border border-[#E8DFCA] bg-white p-3 sm:grid-cols-[5rem_5rem_minmax(0,1fr)_auto]">
              <div><label htmlFor={`range-from-${index}`} className={label}>From</label><input id={`range-from-${index}`} aria-label={`Range ${index + 1} from`} type="number" min="1" max={items.length} step="1" value={row.from} onChange={e => updateRange(index, 'from', e.target.value)} className={field} /></div>
              <div><label htmlFor={`range-to-${index}`} className={label}>To</label><input id={`range-to-${index}`} aria-label={`Range ${index + 1} to`} type="number" min="1" max={items.length} step="1" value={row.to} onChange={e => updateRange(index, 'to', e.target.value)} className={field} /></div>
              <div className="col-span-2 min-w-0 sm:col-span-1"><label htmlFor={`range-name-${index}`} className={label}>Competency</label><input id={`range-name-${index}`} aria-label={`Range ${index + 1} competency`} list="competency-options" value={row.name} onChange={e => updateRange(index, 'name', e.target.value)} placeholder="Addition" className={field} /></div>
              <button type="button" aria-label={`Remove range ${index + 1}`} onClick={() => { setRanges(rows => rows.filter((_, i) => i !== index)); setRangeError(''); setRangeNotice(''); }} className={`${btnQuiet} col-span-2 sm:col-span-1`}>Remove</button>
            </div>)}
          </div>
          <datalist id="competency-options">{competencySuggestions.map(name => <option key={name} value={name} />)}</datalist>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => { setRanges(rows => [...rows, { from: String(Number(rows.at(-1)?.to || 0) + 1), to: '', name: '' }]); setRangeNotice(''); }} className={btnSecondary}>Add range</button>
            <button type="button" onClick={applyRanges} className={btnSecondary}>Apply ranges</button>
          </div>
          <p className={`mt-2 text-xs ${muted}`}>Applying replaces the competency ranges for this key. Items outside these ranges will have no competency. Remove all ranges and apply to clear them.</p>
          {rangeError && <p role="alert" className="mt-2 text-sm text-[#9B2C2C]">{rangeError}</p>}
          {rangeNotice && <p role="status" className="mt-2 text-sm text-[#1A4D2E]">{rangeNotice}</p>}
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
                item.answer === "" ? "border-[#C83C3C] bg-white" : "border-[#E8DFCA] bg-white"
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