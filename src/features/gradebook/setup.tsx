'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SubjectDialog } from './subject-dialog';
import { SUBJECTS } from '@/features/classes/details';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { sectionInputClass } from '@/features/sections/model';
import type { GradebookData } from './data';
import { presetPeriods, type Period, type Subject } from './model';
import { saveGradebookSetup } from './actions';
export function GradebookSetup({ book, onClose, onSaved, subjectOptions=book.subjectOptions??[] }: { book: GradebookData; onClose?: () => void; onSaved?: () => void; subjectOptions?:string[] }) {
  const [editing, setEditing] = useState<Subject|null>(null);
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
    <div><h2>{book.periods.length ? 'Manage Grade Book' : 'Set up Grade Book'}</h2><p className="mt-2 text-sm text-[#606861]">Add your subjects below. Your grading periods are shown in the summary; edit them only if needed.</p></div>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {!periods.length ? <div className="tc-group p-5 space-y-4"><fieldset><legend className="font-medium">Grading periods</legend>{([['quarters','4 Quarters'],['terms','3 Terms'],['semesters','2 Semesters'],['custom','Custom']] as const).map(([value,label]) => <label key={value} className="flex min-h-11 items-center gap-3"><input type="radio" name="preset" value={value} checked={preset===value} onChange={() => setPreset(value)} />{label}</label>)}</fieldset><Button onClick={() => setPeriods(presetPeriods(preset))}>Continue</Button></div> : <form onSubmit={e => { e.preventDefault(); setConfirm(true); }} className="space-y-6">
      <fieldset disabled={pending} className="space-y-5 min-w-0">
        <details className="tc-group p-4 space-y-4"><summary className="cursor-pointer font-semibold">Grading periods: {periods.filter(p=>p.status==='active').map(p=>p.label).join(', ')} <span className="text-sm font-normal text-[#4F6F52]">(Edit periods)</span></summary><p className="text-sm text-[#606861]">Rename or reorder safely. Periods containing grades can be made inactive; their values remain available.</p>
          {periods.map((p,i) => <div key={p.id} className="border-t border-[#E3E5E1] pt-4 space-y-2">
            <label className="block text-sm">Period {i+1}<input required maxLength={60} className={`${sectionInputClass} mt-1 w-full`} value={p.label} onChange={e => setPeriods(periods.map(r => r.id===p.id ? {...r,label:e.target.value} : r))} /></label>
            <div className="flex flex-wrap gap-2"><Button variant="secondary" type="button" disabled={i===0} aria-label={`Move ${p.label} up`} onClick={() => setPeriods(move(periods,i,-1))}>Up</Button><Button variant="secondary" type="button" disabled={i===periods.length-1} aria-label={`Move ${p.label} down`} onClick={() => setPeriods(move(periods,i,1))}>Down</Button>
              <Button variant="secondary" type="button" onClick={() => setPeriods(periods.map(r => r.id===p.id ? {...r,status:r.status==='active'?'inactive':'active'} : r))}>{p.status==='active'?'Make inactive':'Reactivate'}</Button>
              <Button variant="ghost" type="button" disabled={withGrades.has(p.id) || periods.length===1} onClick={() => setPeriods(periods.filter(r => r.id!==p.id))}>Remove</Button></div>
          </div>)}
          <Button type="button" variant="secondary" disabled={periods.length>=8} onClick={() => setPeriods([...periods,{id:crypto.randomUUID(),key:`period_${crypto.randomUUID()}`,label:`Period ${periods.length+1}`,position:periods.length+1,status:'active'}])}>Add period</Button>
        </details>
        <section className="tc-group p-4 space-y-4"><h3 className="font-semibold">Section subjects</h3>
          {!subjects.length&&<p className="rounded-xl bg-[#EAF0EA] p-3 text-sm text-[#1A4D2E]">Add the subjects that appear on your report card. Start with your linked classes below, or add one yourself.</p>}
          <ul className="divide-y divide-[#E3E5E1]">{subjects.map((s,i) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0"><p className="break-words font-medium">{s.name}</p><p className="text-xs text-[#606861]">{s.status==='inactive'?'Inactive':`Subject ${i+1}`}{s.code?` / ${s.code}`:''}</p></div>
            <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={()=>setEditing({...s})} aria-label={`Edit ${s.name}`}>Edit</Button>
              {!book.subjects.some(row=>row.id===s.id)?<Button type="button" variant="secondary" className="border-red-200 bg-red-50 text-red-800 hover:bg-red-100" aria-label={`Remove ${s.name}`} onClick={()=>setSubjects(subjects.filter(row=>row.id!==s.id))}>Remove</Button>:<Button type="button" variant="ghost" onClick={()=>setSubjects(subjects.map(row=>row.id===s.id?{...row,status:row.status==='active'?'inactive':'active'}:row))}>{s.status==='active'?'Make inactive':'Reactivate'}</Button>}
              <details><summary className="cursor-pointer px-3 py-2 text-sm">Order</summary><div className="flex gap-2"><Button type="button" variant="secondary" disabled={i===0} aria-label={`Move ${s.name} up`} onClick={()=>setSubjects(move(subjects,i,-1))}>Up</Button><Button type="button" variant="secondary" disabled={i===subjects.length-1} aria-label={`Move ${s.name} down`} onClick={()=>setSubjects(move(subjects,i,1))}>Down</Button></div></details>
            </div>
          </li>)}</ul>
          <Button type="button" disabled={subjects.length>=100} onClick={()=>setEditing({id:crypto.randomUUID(),name:'',code:null,category:null,position:subjects.length+1,status:'active'})}>Add subject manually</Button>
          {book.subjects.length>0&&<p className="text-xs text-[#606861]">Saved subjects can be made inactive to keep their previous grades. New subjects can be removed before saving.</p>}
          {book.classes.length>0 && <fieldset className="border-t border-[#E3E5E1] pt-4"><legend className="font-medium">Add from linked classes</legend><p className="text-sm text-[#606861]">Creates independent subjects using class labels. Grades are imported separately.</p>{book.classes.map(c => { const exists=names.includes(c.subject.trim().toLowerCase().replace(/\s+/g,' ')); return <label key={c.id} className="flex min-h-11 gap-3 items-center text-sm"><input type="checkbox" disabled={exists} checked={chosen.includes(c.id)} onChange={e => setChosen(e.target.checked?[...chosen,c.id]:chosen.filter(id => id!==c.id))}/><span className="break-words">{c.subject} · {c.name}{exists?' — subject already listed':''}</span></label>; })}<Button type="button" variant="secondary" disabled={!chosen.length || subjects.length+chosen.length>100} onClick={() => { const selected=book.classes.filter(c => chosen.includes(c.id)); const unique=[...new Set(selected.map(c => c.subject))]; setSubjects([...subjects,...unique.map((name,i):Subject => ({id:crypto.randomUUID(),name,code:null,category:null,position:subjects.length+i+1,status:'active'}))]);setChosen([]); }}>Add selected subjects</Button></fieldset>}
          {duplicateNames && <label className="flex min-h-11 items-center gap-3 text-sm text-amber-900"><input type="checkbox" checked={duplicates} onChange={e => setDuplicates(e.target.checked)}/>Duplicate subject names: keep these as separate subjects.</label>}
        </section>
        <div className="flex flex-wrap gap-3"><Button type="submit" disabled={duplicateNames&&!duplicates}>Save setup</Button>{onClose&&<Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>}</div>
      </fieldset>
    </form>}
    {editing&&<SubjectDialog key={editing.id} subject={editing} isNew={!subjects.some(s=>s.id===editing.id)} options={[...new Set([...SUBJECTS,...subjectOptions,...book.classes.map(c=>c.subject),...subjects.map(s=>s.name)].filter(Boolean))]} onCancel={()=>setEditing(null)} onSave={subject=>{setSubjects(rows=>rows.some(s=>s.id===subject.id)?rows.map(s=>s.id===subject.id?subject:s):[...rows,subject]);setEditing(null);}}/>}
    <ConfirmDialog open={confirm} title="Save Grade Book setup?" description="Apply the period labels, order and subject details shown above. Existing grades stay attached to their original period and subject." pending={pending} confirmLabel="Save setup" onCancel={() => setConfirm(false)} onConfirm={save}/>
  </section>;
}
