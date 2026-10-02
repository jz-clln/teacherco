"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AssessmentFormat } from "@/lib/exams/types";
import { deleteAssessmentAction, setAssessmentStatusAction, updateAnswerKeyAction } from "../actions";
import { btnDanger, btnPrimary, btnSecondary, muted } from "../ui";
import { AnswerKeyEditor, type KeyDraft } from "./answer-key-editor";

interface Props {
  assessmentId: string;
  title: string;
  status: string;
  format: AssessmentFormat;
  choices: string[];
  initialItems: KeyDraft[];
  checkedCount: number;
  competencySuggestions: string[];
}

export function EditKeyForm(p: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState(p.initialItems);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const complete = items.every((i) => i.answer !== "");

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateAnswerKeyAction({
        assessmentId: p.assessmentId,
        items: items.map((i) => ({ itemNumber: i.itemNumber, answer: i.answer, competency: i.competency })),
      });
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
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
    <div className="space-y-8">
      {p.checkedCount > 0 ? (
        <p role="note" className="rounded-xl border border-[#E0B14C] bg-[#FFF8E6] p-3 text-sm">
          {p.checkedCount} sheet{p.checkedCount === 1 ? " is" : "s are"} already checked. Saving a changed key re-scores
          them from each learner’s confirmed answers. Nothing is re-read from the photos.
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
          {pending ? "Saving…" : "Save answer key"}
        </button>
        {message ? (
          <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-[#9B2C2C]" : "text-[#1A4D2E]"}`}>
            {message.text}
          </p>
        ) : null}
      </div>

      <section className="rounded-2xl border border-[#E8DFCA] p-4">
        <h3 className="font-semibold">Manage assessment</h3>
        <p className={`mt-1 text-sm ${muted}`}>Closing hides it from checking but keeps every score.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={toggleStatus} disabled={pending} className={btnSecondary}>
            {p.status === "closed" ? "Reopen assessment" : "Close assessment"}
          </button>
          <button type="button" onClick={remove} disabled={pending} className={btnDanger}>
            Delete assessment
          </button>
        </div>
      </section>
    </div>
  );
}
