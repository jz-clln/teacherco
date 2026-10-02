"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AssessmentFormat } from "@/lib/exams/types";
import { deleteAssessmentAction, setAssessmentStatusAction, updateAnswerKeyAction } from "../actions";
import { btnDanger, btnPrimary, btnSecondary, field, label, muted } from "../ui";
import { AnswerKeyEditor, type KeyDraft } from "./answer-key-editor";

interface Props {
  assessmentId: string;
  title: string;
  status: string;
  format: AssessmentFormat;
  choices: string[];
  pointsPerItem: number;
  initialItems: KeyDraft[];
  checkedCount: number;
  competencySuggestions: string[];
}

function blankDrafts(count: number, previous: KeyDraft[] = [], points = 1): KeyDraft[] {
  return Array.from({ length: count }, (_, idx) => previous[idx] ?? { itemNumber: idx + 1, answer: "", competency: null, points });
}

export function EditKeyForm(p: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // An assessment can exist without any answer key items. Then the teacher sets the key for the first time.
  const firstKey = p.initialItems.length === 0;
  const [itemCount, setItemCount] = useState(20);
  const [items, setItems] = useState(firstKey ? blankDrafts(20, [], p.pointsPerItem) : p.initialItems);

  function changeItemCount(raw: string) {
    const n = Math.min(100, Math.max(1, parseInt(raw, 10) || 1));
    setItemCount(n);
    setItems((prev) => blankDrafts(n, prev, p.pointsPerItem));
  }
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const complete = items.every((i) => i.answer !== "");

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateAnswerKeyAction({
        assessmentId: p.assessmentId,
        items: items.map((i) => ({ itemNumber: i.itemNumber, answer: i.answer, competency: i.competency, points: i.points })),
      });
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      if (firstKey) {
        router.push(`/check/${p.assessmentId}/score`);
        return;
      }
      setMessage({
        kind: "ok",
        text: result.rescored
          ? `Saved. ${result.rescored} checked sheet${result.rescored === 1 ? "" : "s"} re-scored with the new key.`
          : "Saved.",
      });
      router.refresh();
    });
  }

  function toggleStatus() {
    startTransition(async () => {
      const result = await setAssessmentStatusAction({
        assessmentId: p.assessmentId,
        status: p.status === "closed" ? "active" : "closed",
      });
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      router.refresh();
    });
  }

  function remove() {
    if (!window.confirm(`Delete "${p.title}" with all its scores and photos? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteAssessmentAction({ assessmentId: p.assessmentId });
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      router.push("/check");
    });
  }

  return (
    <div className="space-y-5">
      {firstKey ? (
        <div className="max-w-40">
          <label htmlFor="key-item-count" className={label}>Number of items</label>
          <input
            id="key-item-count"
            inputMode="numeric"
            value={itemCount}
            onChange={(e) => changeItemCount(e.target.value)}
            className={field}
          />
        </div>
      ) : null}

      {!firstKey && p.checkedCount > 0 ? (
        <p role="note" className="rounded-xl border border-[#E0B14C] bg-[#FFF8E6] p-3 text-sm">
          {p.checkedCount} sheet{p.checkedCount === 1 ? " is" : "s are"} already checked. Saving a changed key re-scores them.
        </p>
      ) : null}

      <AnswerKeyEditor
        format={p.format}
        choices={p.choices}
        items={items}
        onChange={setItems}
        competencySuggestions={p.competencySuggestions}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={!complete || pending} className={btnPrimary}>
          {pending ? "Saving…" : firstKey ? "Save and start checking" : "Save answer key"}
        </button>
        {message ? (
          <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-[#9B2C2C]" : "text-[#1A4D2E]"}`}>
            {message.text}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[#E8DFCA] pt-4">
        <button type="button" onClick={toggleStatus} disabled={pending} className={btnSecondary}>
          {p.status === "closed" ? "Reopen assessment" : "Close assessment"}
        </button>
        <button type="button" onClick={remove} disabled={pending} className={btnDanger}>
          Delete assessment
        </button>
        <span className={`text-sm ${muted}`}>Closing keeps every score.</span>
      </div>
    </div>
  );
}