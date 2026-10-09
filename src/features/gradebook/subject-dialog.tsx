'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { sectionInputClass } from '@/features/sections/model';
import type { Subject } from './model';

export function SubjectDialog({ subject, options, isNew, onSave, onCancel }: {
  subject: Subject; options: string[]; isNew: boolean;
  onSave: (subject: Subject) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(subject);
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onCancel(); }} className="m-auto max-h-[90dvh] w-[min(32rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-[#E3E5E1] bg-white p-5 text-[#1F2A22] shadow-xl backdrop:bg-black/40">
    <form className="space-y-5" onSubmit={event => { event.preventDefault(); if(draft.name.trim())onSave({...draft,name:draft.name.trim()}); }}>
      <div><h2 id={titleId}>{isNew ? 'Add subject' : 'Edit subject'}</h2><p className="mt-2 text-sm text-[#606861]">Choose a saved subject or type your own. Changes apply when you save setup.</p></div>
      <Select name="subject-name" label="Subject name" required allowCustom customPlaceholder="Type a custom subject" options={options} value={draft.name} onChange={name => setDraft({...draft,name})}/>
      <details><summary className="cursor-pointer py-2 text-sm font-medium">Optional details</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{(['code','category'] as const).map(field => <label key={field} className="block text-sm">{field==='code'?'Code':'Category'} (optional)<input maxLength={field==='code'?40:80} className={`${sectionInputClass} mt-1 w-full`} value={draft[field]??''} onChange={event=>setDraft({...draft,[field]:event.target.value||null})}/></label>)}</div></details>
      <div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={!draft.name.trim() || draft.name.trim().length>120}>{isNew?'Add subject':'Apply changes'}</Button></div>
    </form>
  </dialog>;
}
