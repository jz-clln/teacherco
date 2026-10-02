// src/features/classes/edit-class-details.tsx

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateClassDetails } from "@/features/classes/details-actions";
import { GRADES, SUBJECTS, type ClassDetails } from "@/features/classes/details";

const input = "mt-1.5 w-full rounded-xl border border-[#E3E5E1] bg-white px-3 py-3 outline-none focus:border-[#4F6F52]";

export function EditClassDetails({ classId, initial }: { classId: string; initial: ClassDetails }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof ClassDetails>(key: K, value: ClassDetails[K]) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !pending && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  function openDialog() {
    setForm(initial);
    setError(null);
    setOpen(true);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const result = await updateClassDetails({ classId, ...form, benchmark: Number(form.benchmark) });
      if (!result.ok) {
        setError(result.error);
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
        onClick={openDialog}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#E3E5E1] bg-white px-4 py-2 text-sm font-semibold text-[#1A4D2E] hover:bg-[#F5F6F4]"
      >
        <Pencil size={16} /> Edit class details
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onMouseDown={(e) => e.target === e.currentTarget && !pending && setOpen(false)}
        >
          <form
            onSubmit={save}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-class-title"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="edit-class-title" className="text-xl font-bold">
                  Edit class details
                </h2>
                <p className="mt-1 text-sm text-[#606861]">These show on your class page and reports.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-[#F5F6F4]">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium sm:col-span-2">
                School name
                <input className={input} value={form.schoolName} onChange={(e) => set("schoolName", e.target.value)} />
              </label>
              <label className="block text-sm font-medium">
                Adviser / teacher
                <input className={input} value={form.adviser} onChange={(e) => set("adviser", e.target.value)} />
              </label>
              <label className="block text-sm font-medium">
                School ID <span className="font-normal text-[#606861]">(optional)</span>
                <input className={input} value={form.schoolId} onChange={(e) => set("schoolId", e.target.value)} />
              </label>
              <label className="block text-sm font-medium">
                Grade level
                <input required list="tc-grades" className={input} value={form.gradeLevel} onChange={(e) => set("gradeLevel", e.target.value)} />
              </label>
              <label className="block text-sm font-medium">
                Section
                <input className={input} value={form.section} onChange={(e) => set("section", e.target.value)} />
              </label>
              <label className="block text-sm font-medium">
                Subject
                <input required list="tc-subjects" className={input} value={form.subject} onChange={(e) => set("subject", e.target.value)} />
              </label>
              <label className="block text-sm font-medium">
                School year
                <input required className={input} value={form.schoolYear} onChange={(e) => set("schoolYear", e.target.value)} />
              </label>
              <label className="block text-sm font-medium">
                Class name
                <input required className={input} value={form.name} onChange={(e) => set("name", e.target.value)} />
              </label>
              <label className="block text-sm font-medium">
                Passing benchmark (%)
                <input
                  required
                  type="number"
                  min={1}
                  max={100}
                  className={input}
                  value={form.benchmark}
                  onChange={(e) => set("benchmark", Number(e.target.value))}
                />
              </label>
            </div>

            <datalist id="tc-grades">
              {GRADES.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
            <datalist id="tc-subjects">
              {SUBJECTS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>

            {error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}