'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { sectionInputClass } from '@/features/sections/model';
import type { GradebookData } from './data';
import { cellKey, gradeText, parseGrade } from './model';
import { saveManualGrades } from './actions';
import { GradebookSetup } from './setup';
import { ClassGradeImport } from './import-panel';
export function SectionGradebook({ book }: { book:GradebookData }) {
  const [subjectId,setSubjectId]=useState(book.subjects.find(s=>s.status==='active')?.id??book.subjects[0]?.id??'');
  const [periodId,setPeriodId]=useState(book.periods.find(p=>p.status==='active')?.id??book.periods[0]?.id??'');
  const [inactive,setInactive]=useState(false),[mode,setMode]=useState<'view'|'edit'|'setup'|'import'>('view');
  const [draft,setDraft]=useState<Record<string,string>>({}),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(false);
  const [pending,start]=useTransition(),lock=useRef(false),router=useRouter();
  const byCell=new Map(book.entries.map(e=>[cellKey(e.learner_id,e.section_subject_id,e.period_id),e]));
  const subject=book.subjects.find(s=>s.id===subjectId),period=book.periods.find(p=>p.id===periodId);
  const activeLearners=book.learners.filter(l=>l.status==='active');
  const learners=inactive?book.learners:activeLearners;
  const periods=inactive?book.periods:book.periods.filter(p=>p.status==='active');
  const subjects=inactive?book.subjects:book.subjects.filter(s=>s.status==='active');
  const editable=book.section.status==='active'&&subject?.status==='active'&&period?.status==='active';
  function changes(){return activeLearners.flatMap(l=>{
    const old=byCell.get(cellKey(l.id,subjectId,periodId));
    if(!(l.id in draft))return [];
    const grade=parseGrade(draft[l.id]);
    return grade===(old?.grade??null)?[]:[{learner_id:l.id,grade,expected_updated_at:old?.updated_at??null}];
  });}
  function review(){try{const rows=changes();if(!rows.length){setNotice('No changed grades to save.');return;}if(rows.length>500)throw new Error('Save up to 500 changed learners at once.');setError('');setConfirm(true);}catch(e){setError(e instanceof Error?e.message:'Check the grades.');}}
  function save(){if(lock.current)return;lock.current=true;start(async()=>{try{const result=await saveManualGrades({sectionId:book.section.id,subjectId,periodId,rows:changes(),confirmed:true});if(!result.ok)setError(result.error);else{setDraft({});setMode('view');setNotice('Grades saved.');router.refresh();}}catch{setError('Could not save. Refresh to verify the latest values before retrying.');}finally{lock.current=false;setConfirm(false);}});}
  if((!book.periods.length||mode==='setup')&&book.section.status==='active')return <GradebookSetup book={book} onClose={book.periods.length?()=>setMode('view'):undefined}/>;
  if(mode==='import')return <ClassGradeImport book={book} subjectId={subjectId} periodId={periodId} onClose={()=>setMode('view')} onSaved={()=>start(()=>{router.refresh();setMode('view');setNotice('Grades saved.');})}/>;
  if(pending&&mode==='view')return <section aria-busy="true" className="space-y-3"><h2>Grade Book</h2><p role="status">Refreshing reviewed grades…</p></section>;
  return <div className="space-y-5 min-w-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2>Grade Book</h2><p className="mt-2 text-sm text-[#606861]">Reviewed Section grades. Class changes are copied only after you review and confirm.</p></div>{book.section.status==='active'&&mode==='view'&&<Button variant="secondary" onClick={()=>setMode('setup')}>Manage periods & subjects</Button>}</div>
    {book.section.status==='archived'&&<p role="status" className="tc-group p-4">This Section is archived. Its Grade Book is read-only until you reactivate it.</p>}
    {error&&<p role="alert" className="text-red-800">{error}</p>}{notice&&<p role="status" className="text-[#1A4D2E]">{notice}</p>}
    {!book.periods.length?<p>No Grade Book has been set up.</p>:!book.subjects.length?<div className="tc-group p-5">Add a subject in Manage periods & subjects to start entering grades.</div>:<>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm">Subject<select aria-label="Subject" disabled={mode==='edit'} className={`${sectionInputClass} w-full mt-1`} value={subjectId} onChange={e=>{setSubjectId(e.target.value);setNotice('');}}><option value="" disabled>Choose subject</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}{s.code?` (${s.code})`:''}{s.status==='inactive'?' · Inactive':''}</option>)}</select></label><label className="block text-sm">Period for entry or import<select aria-label="Period for entry or import" disabled={mode==='edit'} className={`${sectionInputClass} w-full mt-1`} value={periodId} onChange={e=>setPeriodId(e.target.value)}><option value="" disabled>Choose period</option>{periods.map(p=><option key={p.id} value={p.id}>{p.label}{p.status==='inactive'?' · Inactive':''}</option>)}</select></label></div>
      {mode==='view'&&<><label className="flex min-h-11 gap-3 items-center text-sm"><input type="checkbox" checked={inactive} onChange={e=>{setInactive(e.target.checked);if(!e.target.checked){setSubjectId(book.subjects.find(s=>s.status==='active')?.id??'');setPeriodId(book.periods.find(p=>p.status==='active')?.id??'');}}}/>Show inactive learners, subjects and periods</label>
        <section className="tc-group p-4"><h3 className="font-semibold">Grade completeness</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{periods.map(p=><p key={p.id} className="text-sm">{p.label}: {activeLearners.filter(l=>byCell.get(cellKey(l.id,subjectId,p.id))?.grade!=null).length} / {activeLearners.length} grades</p>)}</div></section>
        {editable&&<div className="flex flex-wrap gap-3"><Button onClick={()=>{setDraft({});setError('');setNotice('');setMode('edit');}}>Enter grades</Button><Button variant="secondary" disabled={!book.classes.length} onClick={()=>setMode('import')}>Import / Refresh from Class</Button></div>}
        {!learners.length?<p className="tc-group p-5">Add learners to the Section roster to enter grades.</p>:<>
          <div className="hidden md:block tc-group overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr><th className="p-4">Learner</th>{periods.map(p=><th className="p-4" key={p.id}>{p.label}</th>)}</tr></thead><tbody>{learners.map(l=><tr key={l.id} className="border-t border-[#E3E5E1]"><th scope="row" className="p-4 font-medium">{l.display_name}{l.status==='inactive'?' · Inactive':''}</th>{periods.map(p=>{const e=byCell.get(cellKey(l.id,subjectId,p.id));return <td key={p.id} className="p-4"><span className="font-semibold tabular-nums">{gradeText(e?.grade)}</span>{e&&<p className="mt-1 text-xs text-[#606861]">{e.source_type==='manual'?'Manual':e.source_reference??'External import'}<br/>{new Date(e.updated_at).toLocaleDateString('en-PH',{timeZone:'Asia/Manila'})}</p>}</td>;})}</tr>)}</tbody></table></div>
          <div className="md:hidden tc-group tc-rows">{learners.map(l=><div key={l.id} className="p-4"><p className="font-medium break-words">{l.display_name}{l.status==='inactive'?' · Inactive':''}</p><dl className="mt-3 space-y-3">{periods.map(p=>{const e=byCell.get(cellKey(l.id,subjectId,p.id));return <div key={p.id} className="grid grid-cols-2 gap-3 text-sm"><dt className="break-words">{p.label}</dt><dd><span className="font-semibold">{gradeText(e?.grade)}</span>{e&&<span className="block text-xs text-[#606861] break-words">{e.source_type==='manual'?'Manual':e.source_reference??'External import'} · {new Date(e.updated_at).toLocaleDateString('en-PH',{timeZone:'Asia/Manila'})}</span>}</dd></div>;})}</dl></div>)}</div>
        </>}
      </>}
      {mode==='edit'&&<form onSubmit={e=>{e.preventDefault();review();}} className="space-y-4"><p className="text-sm">Enter 0–100, including decimals. A blank cell means missing. Save applies all changed values together.</p><fieldset disabled={pending} className="tc-group tc-rows min-w-0">{activeLearners.map(l=>{const old=byCell.get(cellKey(l.id,subjectId,periodId));return <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-4 p-4"><label htmlFor={`grade-${l.id}`} className="min-w-0 break-words text-sm">{l.display_name}<span className="block text-xs text-[#606861]">Current: {gradeText(old?.grade)}{old?.source_type==='manual'?' · Manual':old?.source_reference?` · ${old.source_reference}`:''}</span></label><input id={`grade-${l.id}`} className={`${sectionInputClass} w-full tabular-nums`} inputMode="decimal" aria-label={`${l.display_name} grade`} value={draft[l.id]??(old?.grade==null?'':String(old.grade))} onChange={e=>setDraft({...draft,[l.id]:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();const inputs=Array.from(e.currentTarget.form?.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]')??[]);inputs[inputs.indexOf(e.currentTarget)+1]?.focus();}}}/></div>;})}</fieldset><div className="flex flex-wrap gap-3"><Button type="submit" disabled={pending||!activeLearners.length}>{pending?'Saving…':'Review & save'}</Button><Button type="button" variant="secondary" disabled={pending} onClick={()=>{setMode('view');setDraft({});setError('');}}>Cancel edits</Button></div></form>}
    </>}
    <ConfirmDialog open={confirm} title="Save reviewed grades?" description="Apply all changed cells for this subject and period. Replaced values become manual grades, including cleared cells. Check the entries above before saving." pending={pending} confirmLabel="Save grades" onCancel={()=>setConfirm(false)} onConfirm={save}/>
  </div>;
}
