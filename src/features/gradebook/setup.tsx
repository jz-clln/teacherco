'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';
import { SUBJECTS } from '@/features/classes/details';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { sectionInputClass } from '@/features/sections/model';
import type { GradebookData } from './data';
import { presetPeriods, type Period, type Subject } from './model';
import { saveGradebookSetup } from './actions';
export function GradebookSetup({ book, onClose, onSaved, subjectOptions=book.subjectOptions??[] }: { book: GradebookData; onClose?: () => void; onSaved?: () => void; subjectOptions?:string[] }) {
  const [periods, setPeriods] = useState<Period[]>(book.periods);
  const [subjects, setSubjects] = useState<Subject[]>(book.subjects);
  const [preset, setPreset] = useState<'quarters' | 'terms' | 'semesters' | 'custom'>('terms');
  const [chosen, setChosen] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [pending, start] = useTransition(); const lock = useRef(false); const router = useRouter();
  const withGrades = new Set(book.entries.map(e => e.period_id));
  const names = subjects.map(s => s.name.trim().toLowerCase().replace(/\s+/g,' '));
  const duplicateNames = new Set(names).size !== names.length;
  function move<T>(rows: T[], index: number, direction: number): T[] { const copy = [...rows]; [copy[index],copy[index+direction]] = [copy[index+direction],copy[index]]; return copy; }
  function save() {
    if (lock.current) return; lock.current = true;
    start(async () => {
      try {
        const result = await saveGradebookSetup({ sectionId:book.section.id, periods:periods.map((p,i) => ({ ...p,position:i+1 })), subjects:subjects.map((s,i) => ({ ...s,position:i+1 })), expected:[...book.periods,...book.subjects].map(r => ({ id:r.id,updated_at:r.updated_at })), duplicatesConfirmed:duplicates });
        if (!result.ok) setError(result.error); else { router.refresh(); if(onSaved)onSaved();else onClose?.(); }
      } catch { setError('Connection interrupted. Refresh before retrying.'); }
      finally { lock.current = false; setConfirm(false); }
    });
  }
  return <section className="space-y-5" aria-label="Grade Book setup">
    <div><h2>{book.periods.length ? 'Manage Grade Book' : 'Set up Grade Book'}</h2><p className="mt-2 text-sm text-[#606861]">Choose how grades are organized. Periods and subjects belong to this Section.</p></div>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {!periods.length ? <div className="tc-group p-5 space-y-4"><fieldset><legend className="font-medium">Grading periods</legend>{([['quarters','4 Quarters'],['terms','3 Terms'],['semesters','2 Semesters'],['custom','Custom']] as const).map(([value,label]) => <label key={value} className="flex min-h-11 items-center gap-3"><input type="radio" name="preset" value={value} checked={preset===value} onChange={() => setPreset(value)} />{label}</label>)}</fieldset><Button onClick={() => setPeriods(presetPeriods(preset))}>Continue</Button></div> : <form onSubmit={e => { e.preventDefault(); setConfirm(true); }} className="space-y-6">
      <fieldset disabled={pending} className="space-y-5 min-w-0">
        <section className="tc-group p-4 space-y-4"><h3 className="font-semibold">Grading periods</h3><p className="text-sm text-[#606861]">Rename or reorder safely. Periods containing grades can be made inactive; their values remain available.</p>
          {periods.map((p,i) => <div key={p.id} className="border-t border-[#E3E5E1] pt-4 space-y-2">
            <label className="block text-sm">Period {i+1}<input required maxLength={60} className={`${sectionInputClass} mt-1 w-full`} value={p.label} onChange={e => setPeriods(periods.map(r => r.id===p.id ? {...r,label:e.target.value} : r))} /></label>
            <div className="flex flex-wrap gap-2"><Button variant="secondary" type="button" disabled={i===0} aria-label={`Move ${p.label} up`} onClick={() => setPeriods(move(periods,i,-1))}>Up</Button><Button variant="secondary" type="button" disabled={i===periods.length-1} aria-label={`Move ${p.label} down`} onClick={() => setPeriods(move(periods,i,1))}>Down</Button>
              <Button variant="secondary" type="button" onClick={() => setPeriods(periods.map(r => r.id===p.id ? {...r,status:r.status==='active'?'inactive':'active'} : r))}>{p.status==='active'?'Make inactive':'Reactivate'}</Button>
              <Button variant="ghost" type="button" disabled={withGrades.has(p.id) || periods.length===1} onClick={() => setPeriods(periods.filter(r => r.id!==p.id))}>Remove</Button></div>
          </div>)}
          <Button type="button" variant="secondary" disabled={periods.length>=8} onClick={() => setPeriods([...periods,{id:crypto.randomUUID(),key:`period_${crypto.randomUUID()}`,label:`Period ${periods.length+1}`,position:periods.length+1,status:'active'}])}>Add period</Button>
        </section>
        <section className="tc-group p-4 space-y-4"><h3 className="font-semibold">Section subjects</h3>
          {subjects.map((s,i) => <div key={s.id} className="border-t border-[#E3E5E1] pt-4 space-y-3">
            <Select name={`subject-${s.id}`} label="Subject name" required allowCustom customPlaceholder="Type a custom subject" options={[...new Set([...SUBJECTS,...subjectOptions,...book.classes.map(c=>c.subject),...subjects.map(s=>s.name)].filter(Boolean))]} value={s.name} onChange={name=>setSubjects(subjects.map(r=>r.id===s.id?{...r,name}:r))}/>
            <div className="grid gap-3 sm:grid-cols-2">{(['code','category'] as const).map(field => <label key={field} className="block text-sm">{field==='code'?'Code':'Category'} (optional)<input maxLength={field==='code'?40:80} className={`${sectionInputClass} mt-1 w-full`} value={s[field]??''} onChange={e => setSubjects(subjects.map(r => r.id===s.id ? {...r,[field]:e.target.value||null} : r))} /></label>)}</div>
            <div className="flex flex-wrap gap-2"><Button variant="secondary" type="button" disabled={i===0} aria-label={`Move ${s.name || 'subject'} up`} onClick={() => setSubjects(move(subjects,i,-1))}>Up</Button><Button variant="secondary" type="button" disabled={i===subjects.length-1} aria-label={`Move ${s.name || 'subject'} down`} onClick={() => setSubjects(move(subjects,i,1))}>Down</Button><Button variant="secondary" type="button" onClick={() => setSubjects(subjects.map(r => r.id===s.id ? {...r,status:r.status==='active'?'inactive':'active'} : r))}>{s.status==='active'?'Make inactive':'Reactivate'}</Button></div>
          </div>)}
          <Button type="button" variant="secondary" disabled={subjects.length>=100} onClick={() => setSubjects([...subjects,{id:crypto.randomUUID(),name:'',code:null,category:null,position:subjects.length+1,status:'active'}])}>Add subject manually</Button>
          {book.classes.length>0 && <fieldset className="border-t border-[#E3E5E1] pt-4"><legend className="font-medium">Add from linked classes</legend><p className="text-sm text-[#606861]">Creates independent subjects using class labels. Grades are imported separately.</p>{book.classes.map(c => { const exists=names.includes(c.subject.trim().toLowerCase().replace(/\s+/g,' ')); return <label key={c.id} className="flex min-h-11 gap-3 items-center text-sm"><input type="checkbox" disabled={exists} checked={chosen.includes(c.id)} onChange={e => setChosen(e.target.checked?[...chosen,c.id]:chosen.filter(id => id!==c.id))}/><span className="break-words">{c.subject} · {c.name}{exists?' — subject already listed':''}</span></label>; })}<Button type="button" variant="secondary" disabled={!chosen.length || subjects.length+chosen.length>100} onClick={() => { const selected=book.classes.filter(c => chosen.includes(c.id)); const unique=[...new Set(selected.map(c => c.subject))]; setSubjects([...subjects,...unique.map((name,i):Subject => ({id:crypto.randomUUID(),name,code:null,category:null,position:subjects.length+i+1,status:'active'}))]);setChosen([]); }}>Add selected subjects</Button></fieldset>}
          {duplicateNames && <label className="flex min-h-11 items-center gap-3 text-sm text-amber-900"><input type="checkbox" checked={duplicates} onChange={e => setDuplicates(e.target.checked)}/>Duplicate subject names: keep these as separate subjects.</label>}
        </section>
        <div className="flex flex-wrap gap-3"><Button type="submit" disabled={duplicateNames&&!duplicates}>Save setup</Button>{onClose&&<Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>}</div>
      </fieldset>
    </form>}
    <ConfirmDialog open={confirm} title="Save Grade Book setup?" description="Apply the period labels, order and subject details shown above. Existing grades stay attached to their original period and subject." pending={pending} confirmLabel="Save setup" onCancel={() => setConfirm(false)} onConfirm={save}/>
  </section>;
}
