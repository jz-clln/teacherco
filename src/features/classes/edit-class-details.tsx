// src/features/classes/edit-class-details.tsx

"use client";
import Link from 'next/link';
import { sectionLabel } from '@/features/sections/model';

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { updateClassDetails, loadClassSubjectOptions } from "@/features/classes/details-actions";
import { GRADES, SUBJECTS, type ClassDetails } from "@/features/classes/details";

const input = "mt-1.5 w-full rounded-xl border border-[#E3E5E1] bg-white px-3 py-3 outline-none focus:border-[#4F6F52]";

export function EditClassDetails({ classId, initial, triggerClassName, triggerLabel = "Edit class details" }: { classId: string; initial: ClassDetails; triggerClassName?: string; triggerLabel?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [saved,setSaved]=useState<{source:ClassDetails;value:ClassDetails}|null>(null);
  const current=saved?.source===initial?saved.value:initial;
  const [error, setError] = useState<string | null>(null);
  const [subjects,setSubjects]=useState<string[]>(SUBJECTS);
  const [loadingSubjects,setLoadingSubjects]=useState(false);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const set = <K extends keyof ClassDetails>(key: K, value: ClassDetails[K]) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(()=>{
    if(!open)return;
    let active=true;
    loadClassSubjectOptions().then(result=>{if(!active)return;if(result.ok)setSubjects(result.data);else setError(result.error);setLoadingSubjects(false);}).catch(()=>{if(active){setError('Could not load saved subjects. Close and reopen this form to retry.');setLoadingSubjects(false);}});
    return()=>{active=false;};
  },[open]);
  useEffect(() => {
    if (!open) return;
    formRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !pending) { setOpen(false); triggerRef.current?.focus(); }
      if (e.key === "Tab") {
        const items = formRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not([type=hidden]):not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]');
        if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  function openDialog() {
    setForm(current);
    setError(null);
    setLoadingSubjects(true);
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    triggerRef.current?.focus();
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
      setSaved({source:initial,value:form});
      closeDialog();
      router.refresh();
    });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDialog}
        className={triggerClassName ?? "inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#E3E5E1] bg-white px-4 py-2 text-sm font-semibold text-[#1A4D2E] hover:bg-[#F5F6F4]"}
      >
        <Pencil size={16} aria-hidden /> {triggerLabel}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onMouseDown={(e) => e.target === e.currentTarget && !pending && closeDialog()}
        >
          <form
            ref={formRef}
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
              <button type="button" aria-label="Close" disabled={pending} onClick={closeDialog} className="rounded-lg p-2 hover:bg-[#F5F6F4]">
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 border-b border-[#E3E5E1] pb-3 text-sm"><p>Section: {initial.sectionLink ? sectionLabel(initial.sectionLink) : 'Not linked'}</p><Link className="tc-button tc-quiet" href={`/classes/${classId}/section`}>{initial.sectionLink ? 'Change or unlink Section' : 'Link to Section'}</Link></div>
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
              <Select name="gradeLevel" label="Grade level" required allowCustom disabled={pending} options={[...new Set([...GRADES,current.gradeLevel].filter(Boolean))]} value={form.gradeLevel} onChange={value=>set('gradeLevel',value)} customPlaceholder="Type a grade level"/>
              <label className="block text-sm font-medium">
                Section label in record
                <input className={input} value={form.section} onChange={(e) => set("section", e.target.value)} />
              </label>
              <div><Select name="subject" label="Subject" required allowCustom disabled={pending||loadingSubjects} options={[...new Set([...subjects,current.subject].filter(Boolean))]} value={form.subject} onChange={value=>set('subject',value)} customPlaceholder="Type a custom subject"/>{loadingSubjects&&<p role="status" className="mt-1 text-xs text-[#606861]">Loading saved subjects...</p>}</div>
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

            {error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button type="button" variant="ghost" onClick={closeDialog} disabled={pending}>
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
