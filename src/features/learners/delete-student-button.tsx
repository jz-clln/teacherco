// src/features/learners/delete-student-button.tsx

"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteLearner } from "@/features/learners/actions";

export function DeleteStudentButton({
  classId,
  learnerId,
  name,
}: {
  classId: string;
  learnerId: string;
  name: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <form ref={form} action={deleteLearner}>
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="learnerId" value={learnerId} />
      <input type="hidden" name="name" value={name} />
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Delete ${name}`}
        className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[#606861] transition hover:bg-red-50 hover:text-red-700"
      >
        <Trash2 size={16} />
      </button>

      <ConfirmDialog
        open={open}
        destructive
        title={`Delete ${name}?`}
        description="This also removes their scores and attendance and cannot be undone. If they are in another of your classes, they are only removed from this one."
        confirmLabel="Delete student"
        onConfirm={() => {
          setOpen(false);
          form.current?.requestSubmit();
        }}
        onCancel={() => setOpen(false)}
      />
    </form>
  );
}