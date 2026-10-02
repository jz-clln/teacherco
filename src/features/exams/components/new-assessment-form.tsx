// src/features/exams/components/new-assessment-form.tsx

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { choicesFor, type AssessmentFormat } from "@/lib/exams/types";
import { createAssessmentAction } from "../actions";
import type { ClassOption } from "../queries";
import { DatePicker } from "@/components/ui/date-picker";
import { Select } from "@/components/ui/select";
import { btnPrimary, field, label, muted } from "../ui";
import { AnswerKeyEditor, type KeyDraft } from "./answer-key-editor";

function blankDrafts(count: number, previous: KeyDraft[] = []): KeyDraft[] {
  return Array.from({ length: count }, (_, idx) => previous[idx] ?? { itemNumber: idx + 1, answer: "", competency: null });
}

export function NewAssessmentForm({ classes, initialClassId }: { classes: ClassOption[]; initialClassId?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [classId, setClassId] = useState(
    classes.find((c) => c.id === initialClassId)?.id ?? classes[0]?.id ?? "",
  );
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [format, setFormat] = useState<AssessmentFormat>("multiple_choice");
  const [choiceCount, setChoiceCount] = useState(4);
  const [itemCount, setItemCount] = useState(20);
  const [points, setPoints] = useState(1);
  const [items, setItems] = useState<KeyDraft[]>(() => blankDrafts(20));

  const choices = choicesFor(format, choiceCount);
  const complete = items.every((i) => i.answer !== "") && title.trim() !== "" && classId !== "";
  const suggestions = classes.find((c) => c.id === classId)?.competencies ?? [];
  const missing = items.filter((i) => i.answer === "").length;
  const hint =
    title.trim() === "" ? "Add a title." : missing > 0 ? `${missing} ${missing === 1 ? "answer" : "answers"} left.` : "Ready to save.";

  function changeFormat(next: AssessmentFormat) {
    setFormat(next);
    const allowed = choicesFor(next, choiceCount);
    setItems((prev) => prev.map((i) => (allowed.includes(i.answer) ? i : { ...i, answer: "" })));
  }

  function changeChoiceCount(n: number) {
    setChoiceCount(n);
    const allowed = choicesFor(format, n);
    setItems((prev) => prev.map((i) => (allowed.includes(i.answer) ? i : { ...i, answer: "" })));
  }

  function changeItemCount(raw: string) {
    const n = Math.min(100, Math.max(1, parseInt(raw, 10) || 1));
    setItemCount(n);
    setItems((prev) => blankDrafts(n, prev));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createAssessmentAction({
        classId,
        title,
        format,
        choiceCount,
        assessmentDate: date || null,
        pointsPerItem: points,
        items: items.map((i) => ({ itemNumber: i.itemNumber, answer: i.answer, competency: i.competency })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/check/${result.id}/score`);
    });
  }

  if (!classes.length) {
    return (
      <div className="rounded-2xl border border-[#E8DFCA] bg-white p-6">
        <h2 className="font-semibold">Create a class first</h2>
        <p className={`mt-1 text-sm ${muted}`}>Assessments belong to a class.</p>
        <Link href="/classes/new" className={`${btnPrimary} mt-4`}>Create a class</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section aria-label="Assessment details">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            name="classId"
            label="Class"
            required
            defaultValue={classId}
            onChange={setClassId}
            options={classes.map((c) => ({ value: c.id, label: c.label }))}
          />
          <div>
            <label htmlFor="title" className={label}>Title</label>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quiz 1: Fractions" maxLength={120} className={field} />
          </div>
          <DatePicker name="assessmentDate" label="Date given" hint="(optional)" value={date} onChange={setDate} />
          <div>
            <label htmlFor="items" className={label}>Number of items</label>
            <input id="items" inputMode="numeric" value={itemCount} onChange={(e) => changeItemCount(e.target.value)} className={field} />
          </div>
          <div>
            <span className={label}>Type</span>
            <div role="group" aria-label="Assessment type" className="flex gap-2">
              {(["multiple_choice", "true_false"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={format === f}
                  onClick={() => changeFormat(f)}
                  className={`min-h-11 flex-1 rounded-xl border px-3 py-2.5 text-base font-semibold ${
                    format === f ? "border-[#1A4D2E] bg-[#1A4D2E] text-white" : "border-[#E8DFCA] bg-white hover:bg-[#F5EFE6]"
                  }`}
                >
                  {f === "multiple_choice" ? "Multiple choice" : "True or false"}
                </button>
              ))}
            </div>
          </div>
          {format === "multiple_choice" ? (
            <Select
              name="choiceCount"
              label="Choices per item"
              defaultValue={String(choiceCount)}
              onChange={(v) => changeChoiceCount(Number(v))}
              options={[
                { value: "3", label: "3 (A–C)" },
                { value: "4", label: "4 (A–D)" },
                { value: "5", label: "5 (A–E)" },
              ]}
            />
          ) : null}
          <div>
            <label htmlFor="points" className={label}>Points per item</label>
            <input
              id="points"
              inputMode="decimal"
              value={points}
              onChange={(e) => setPoints(Math.max(0, Number(e.target.value) || 0))}
              className={field}
            />
          </div>
        </div>
      </section>

      <AnswerKeyEditor
        format={format}
        choices={choices}
        items={items}
        onChange={setItems}
        competencySuggestions={suggestions}
      />

      <div className="sticky bottom-0 -mx-4 border-t border-[#E8DFCA] bg-[#F5EFE6]/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        {error ? <p role="alert" className="mb-2 text-sm text-[#9B2C2C]">{error}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className={`text-base ${complete ? "text-[#1A4D2E]" : muted}`}>{hint}</p>
          <button type="button" onClick={submit} disabled={!complete || pending} className={btnPrimary}>
            {pending ? "Saving…" : "Save and start checking"}
          </button>
        </div>
      </div>
    </div>
  );
}