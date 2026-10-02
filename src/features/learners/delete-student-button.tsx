// src/features/learners/delete-student-button.tsx

"use client";

import { Trash2 } from "lucide-react";
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
  return (
    <form
      action={deleteLearner}
      onSubmit={(e) => {
        if (!confirm(`Delete ${name}? This also removes their scores and attendance and cannot be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="learnerId" value={learnerId} />
      <input type="hidden" name="name" value={name} />
      <button
        type="submit"
        aria-label={`Delete ${name}`}
        className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[#606861] transition hover:bg-red-50 hover:text-red-700"
      >
        <Trash2 size={16} />
      </button>
    </form>
  );
}