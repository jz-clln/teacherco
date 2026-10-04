// src/features/learners/add-student-dialog.tsx

"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addLearner } from "@/features/learners/actions";

const input = "mt-1.5 w-full rounded-xl border border-[#E3E5E1] bg-white px-3 py-3 outline-none focus:border-[#4F6F52]";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Adding…" : "Add learner"}
    </Button>
  );
}

/**
 * "Add a student" button that opens a popup form (a bottom sheet on phones).
 * If the server sends an error back, the popup opens again and shows it.
 */
export function AddStudentDialog({ classId, error }: { classId: string; error?: string }) {
  const [open, setOpen] = useState(Boolean(error));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} className="gap-2">
        <UserPlus size={16} aria-hidden /> Add learner
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <form
            action={addLearner}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-student-title"
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl"
          >
            <input type="hidden" name="classId" value={classId} />

            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="add-student-title" className="flex items-center gap-2 text-xl font-bold">
                  <UserPlus size={20} className="text-[#4F6F52]" aria-hidden /> Add learner
                </h2>
                <p className="mt-1 text-sm text-[#606861]">They will be added to this class.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-[#F5F6F4]">
                <X size={18} />
              </button>
            </div>

            {error ? (
              <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium">
                First name
                <input name="firstName" required autoFocus autoComplete="off" autoCapitalize="words" enterKeyHint="next" className={input} />
              </label>
              <label className="block text-sm font-medium">
                Last name
                <input name="lastName" required autoComplete="off" autoCapitalize="words" enterKeyHint="done" className={input} />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <SubmitButton />
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
