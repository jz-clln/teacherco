// src/features/exams/components/delete-assessment-button.tsx

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { deleteAssessmentAction } from "@/features/exams/actions";

/**
 * Small trash button for an assessment card. It sits next to the card's link, not inside it,
 * so tapping it never opens the assessment.
 */
export function DeleteAssessmentButton({
  assessmentId,
  title,
  checked,
  className,
}: {
  assessmentId: string;
  title: string;
  /** How many learners already have a score. Shown in the warning. */
  checked: number;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scores =
    checked > 0 ? `It has ${checked} saved ${checked === 1 ? "score" : "scores"}, and they will be deleted too. ` : "";

  function remove() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteAssessmentAction({ assessmentId });
      if (!result.ok) {
        setError(result.error); // the dialog stays open and shows what went wrong
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        aria-label={`Delete ${title}`}
        title="Delete assessment"
        className={cn(
          "inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#9B2C2C] transition-colors hover:bg-[#FBEAEA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A4D2E]",
          className,
        )}
      >
        <Trash2 size={18} aria-hidden />
      </button>

      <ConfirmDialog
        open={open}
        destructive
        title={`Delete "${title}"?`}
        description={error ?? `${scores}This cannot be undone.`}
        confirmLabel={pending ? "Deleting…" : error ? "Try again" : "Delete assessment"}
        onConfirm={remove}
        onCancel={() => {
          if (!pending) setOpen(false);
        }}
      />
    </>
  );
}