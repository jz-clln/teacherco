'use client';
import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { GRADES } from '@/features/classes/details';
import type { Section } from '@/types/domain';
import { createSection, updateSection, type SectionFields } from './actions';
import { sectionInputClass } from './model';

export function SectionForm({ section }: { section?: Section }) {
  const router = useRouter(), request = useRef(''), lock = useRef(false);
  const [pending, start] = useTransition(), [error, setError] = useState('');
  const [form, setForm] = useState<SectionFields>({ name: section?.name ?? '', grade_level: section?.grade_level ?? '', school_year: section?.school_year ?? '', school_name: section?.school_name ?? '', school_id: section?.school_id ?? '', is_adviser: section?.is_adviser ?? false });
  const fields = [['name', 'Section name', 120, true], ['grade_level', 'Grade level', 50, true], ['school_year', 'School year', 30, true], ['school_name', 'School name (optional)', 160, false], ['school_id', 'School ID (optional)', 30, false]] as const;
  function save(event: React.FormEvent) {
    event.preventDefault(); if (lock.current) return; lock.current = true;
    request.current ||= crypto.randomUUID(); setError('');
    start(async () => {
      try {
        const result = section ? await updateSection({ ...form, sectionId: section.id }) : await createSection({ ...form, requestId: request.current });
        if (!result.ok) { setError(result.error); return; }
        router.push(`/sections/${result.id}`); router.refresh();
      } catch { setError('Could not save this Section. Please try again.'); }
      finally { lock.current = false; }
    });
  }
  return <form onSubmit={save} className="tc-group w-full min-w-0 space-y-5 p-5">
    <fieldset disabled={pending} className="grid min-w-0 gap-4 sm:grid-cols-2">
      {fields.map(([key, label, max, required]) => <label key={key} className={`min-w-0 text-sm font-medium ${key === 'name' ? 'sm:col-span-2' : ''}`}>{label}<input className={sectionInputClass} required={required} maxLength={max} value={form[key]} list={key === 'grade_level' ? 'section-grades' : undefined} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} /></label>)}
      <datalist id="section-grades">{GRADES.map(grade => <option key={grade} value={grade} />)}</datalist>
      <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2"><input type="checkbox" checked={form.is_adviser} onChange={e => setForm(f => ({ ...f, is_adviser: e.target.checked }))} className="size-5 accent-[#1A4D2E]" />I am the adviser of this Section</label>
    </fieldset>
    {error && <p role="alert" className="text-sm text-[#9B2C2C]">{error}</p>}
    <div className="flex flex-wrap gap-2"><Button disabled={pending}>{pending ? 'Saving Section…' : section ? 'Save changes' : 'Create Section'}</Button><Link className="tc-button tc-quiet" href={section ? `/sections/${section.id}` : '/sections'}>Cancel</Link></div>
  </form>;
}
