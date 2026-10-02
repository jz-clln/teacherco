// src/features/scores/score-sheet.tsx

"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusMessage } from "@/features/settings/settings-ui";
import { deleteManualAssessment, saveManualScores, type ScoreState } from "./actions";

const initialState: ScoreState = {};

export type ScoreRow = { id: string; name: string; score: number | null };

const scoreInput =
  "w-24 rounded-xl border border-[#E3E5E1] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#4F6F52] focus:ring-4 focus:ring-[#4F6F52]/10";

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
  const [state, formAction, pending] = useActionState(saveManualScores, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, startDelete] = useTransition();

  // Enter moves to the next learner, so a whole class can be typed without the mouse.
  function onEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const inputs = Array.from(formRef.current?.querySelectorAll<HTMLInputElement>("input[data-score]") ?? []);
    const next = inputs[inputs.indexOf(e.currentTarget) + 1];
    next?.focus();
    next?.select();
  }

  function confirmDelete() {
    const data = new FormData();
    data.set("assessmentId", assessmentId);
    startDelete(async () => {
      await deleteManualAssessment(data);
    });
  }

  const scored = learners.filter((l) => l.score != null).length;

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E3E5E1] px-5 py-4">
        <div>
          <h2 className="font-semibold text-[#1E2420]">{title}</h2>
          <p className="mt-0.5 text-sm text-[#606861]">
            Highest possible score: {total} · {scored} of {learners.length} scored
          </p>
        </div>
        <Button type="button" variant="ghost" className="gap-2" onClick={() => setConfirming(true)} disabled={deleting}>
          <Trash2 size={16} /> Delete activity
        </Button>
      </div>

      {learners.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-[#606861]">There are no active learners in this class yet.</p>
      ) : (
        <form ref={formRef} action={formAction}>
          <input type="hidden" name="assessmentId" value={assessmentId} />

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#F5F6F4] text-xs uppercase tracking-wide text-[#606861]">
                <tr>
                  <th className="px-5 py-2.5 font-medium">#</th>
                  <th className="px-5 py-2.5 font-medium">Name</th>
                  <th className="px-5 py-2.5 font-medium">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E5E1]">
                {learners.map((learner, index) => (
                  <tr key={learner.id}>
                    <td className="px-5 py-2 text-[#606861]">{index + 1}</td>
                    <td className="px-5 py-2 font-medium">{learner.name}</td>
                    <td className="px-5 py-2">
                      <div className="flex items-center gap-2">
                        <input
                          name={`score_${learner.id}`}
                          data-score
                          defaultValue={learner.score == null ? "" : String(learner.score)}
                          inputMode="decimal"
                          autoComplete="off"
                          aria-label={`Score for ${learner.name}`}
                          onKeyDown={onEnter}
                          className={scoreInput}
                        />
                        <span className="text-[#8B928C]">/ {total}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-[#E3E5E1] px-5 py-4">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save scores"}
            </Button>
            <p className="text-xs text-[#8B928C]">A blank box means no score yet. It is never saved as zero.</p>
            <StatusMessage state={state} />
          </div>
        </form>
      )}

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