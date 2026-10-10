'use client';
import {Search,ChevronDown,ChevronUp} from 'lucide-react';
import {Spinner} from '@/components/ui/loading-state';
import { Select } from '@/components/ui/select';
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
  const [search,setSearch]=useState(''),[expanded,setExpanded]=useState<Record<string,boolean>>({});
  const searchName=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/\s+/g,' ').trim();
  const [subjectId,setSubjectId]=useState(book.subjects.find(s=>s.status==='active')?.id??book.subjects[0]?.id??'');
  const [periodId,setPeriodId]=useState(book.periods.find(p=>p.status==='active')?.id??book.periods[0]?.id??'');
  const [inactive,setInactive]=useState(false),[mode,setMode]=useState<'view'|'edit'|'setup'|'import'>('view');
  const [draft,setDraft]=useState<Record<string,string>>({}),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(false);
  const [pending,start]=useTransition(),lock=useRef(false),router=useRouter();
  const byCell=new Map(book.entries.map(e=>[cellKey(e.learner_id,e.section_subject_id,e.period_id),e]));
  const subject=book.subjects.find(s=>s.id===subjectId),period=book.periods.find(p=>p.id===periodId);
  const activeLearners=book.learners.filter(l=>l.status==='active');
  const learners=inactive?book.learners:activeLearners;
  const visibleLearners=learners.filter(l=>searchName(l.display_name).includes(searchName(search)));
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
  if(mode==='import')return <ClassGradeImport book={book} onClose={()=>setMode('view')} onSaved={()=>start(()=>{router.refresh();setMode('view');setNotice('Grades saved.');})}/>;
  if(pending&&mode==='view')return <section aria-busy="true" className="space-y-3"><h2>Grade Book</h2><p role="status"><Spinner className="mr-2"/>Refreshing reviewed grades…</p></section>;
  return <div className="space-y-5 min-w-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2>Grade Book</h2><p className="mt-2 text-sm text-[#606861]">Each learner has separate grades for every subject and term.</p></div>{book.section.status==='active'&&mode==='view'&&<Button variant="secondary" onClick={()=>setMode('setup')}>Manage periods & subjects</Button>}</div>
    {book.section.status==='archived'&&<p role="status" className="tc-group p-4">This Section is archived. Its Grade Book is read-only until you reactivate it.</p>}
    {error&&<p role="alert" className="text-red-800">{error}</p>}{notice&&<p role="status" className="text-[#1A4D2E]">{notice}</p>}
    {!book.periods.length?<p>No Grade Book has been set up.</p>:!book.subjects.length?<div className="tc-group p-5">Add a subject in Manage periods & subjects to start entering grades.</div>:<>
      {mode==='edit'&&<div className="grid gap-4 sm:grid-cols-2"><Select name={"Subject"} label={"Subject"} value={String(subjectId)} disabled={pending||Object.keys(draft).length>0} onChange={value => { setSubjectId(value); setNotice(''); }} placeholder={"Choose subject"} options={subjects.map(s => ({ value: String(s.id), label: `${s.name}${s.code ? ` (${s.code})` : ''}${s.status === 'inactive' ? ' · Inactive' : ''}` }))}/><Select name={"Period for manual entry"} label={"Period for manual entry"} value={String(periodId)} disabled={pending||Object.keys(draft).length>0} onChange={value => setPeriodId(value)} placeholder={"Choose period"} options={periods.map(p => ({ value: String(p.id), label: `${p.label}${p.status === 'inactive' ? ' · Inactive' : ''}` }))}/></div>}
      {mode==='view'&&<><label className="flex min-h-11 gap-3 items-center text-sm"><input type="checkbox" checked={inactive} onChange={e=>{setInactive(e.target.checked);if(!e.target.checked){setSubjectId(book.subjects.find(s=>s.status==='active')?.id??'');setPeriodId(book.periods.find(p=>p.status==='active')?.id??'');}}}/>Show inactive learners, subjects and periods</label>
        <div className="flex flex-wrap items-center gap-3">
          {editable&&<><Button onClick={()=>{setDraft({});setError('');setNotice('');setMode('edit');}}>Enter grades</Button><Button variant="secondary" disabled={!book.classes.length} onClick={()=>setMode('import')}>Import / Refresh from Class</Button></>}
          <label className="relative w-full min-w-0 sm:ml-auto sm:w-72"><span className="sr-only">Search learners</span><Search size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#606861]"/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search learners..." className="min-h-11 w-full rounded-lg border border-[#B8CDBA] bg-white py-2 pl-10 pr-3 text-sm"/></label>
        </div>
        {!learners.length?<p className="tc-group p-5">Add learners to the Section roster to enter grades.</p>:!visibleLearners.length?<p role="status" className="tc-group p-5">No learners match your search. <Button variant="ghost" onClick={()=>setSearch('')}>Clear search</Button></p>:<>
          <div className="tc-group overflow-hidden !border-2 !border-[#A9BDB0]"><div role="region" aria-label="All subjects and term grades" tabIndex={0} className="overflow-x-auto"><table className="w-full min-w-[560px] border-collapse text-left text-sm"><thead><tr className="bg-[#EAF0EA]"><th scope="col" className="p-3">Learner</th><th scope="col" className="p-3">Subject</th>{periods.map(p=><th scope="col" className="p-3" key={p.id}>{p.label}</th>)}{subjects.length>2&&<th scope="col" className="relative p-3"><span className="sr-only">More subjects</span></th>}</tr></thead>{visibleLearners.map(l=>{
            const shown=expanded[l.id]?subjects:subjects.slice(0,2);
            return <tbody key={l.id} id={`learner-grades-${l.id}`} className="border-t-2 border-[#A9BDB0]">{shown.map((s,i)=><tr key={s.id} className="border-t border-[#E3E5E1]">{i===0&&<th scope="rowgroup" rowSpan={shown.length} className="p-3 align-top font-semibold">{l.display_name}{l.status==='inactive'?' (Inactive)':''}</th>}<th scope="row" className="p-3 font-medium">{s.name}{s.status==='inactive'?' (Inactive)':''}</th>{periods.map(p=>{const e=byCell.get(cellKey(l.id,s.id,p.id));return <td key={p.id} className="p-3"><span className="font-semibold tabular-nums">{gradeText(e?.grade)}</span></td>;})}{i===0&&subjects.length>2&&<td rowSpan={shown.length} className="p-3 text-right align-top"><Button variant="secondary" className="whitespace-nowrap !px-2 !text-xs" aria-label={`${expanded[l.id]?'Show fewer':'Show more'} subjects for ${l.display_name}`} aria-expanded={!!expanded[l.id]} aria-controls={`learner-grades-${l.id}`} onClick={()=>setExpanded(previous=>({...previous,[l.id]:!previous[l.id]}))}>{expanded[l.id]?<ChevronUp size={16} aria-hidden/>:<ChevronDown size={16} aria-hidden/>}{expanded[l.id]?'Show less':`Show more (${subjects.length-2})`}</Button></td>}</tr>)}</tbody>;
          })}</table></div></div>
        </>}
      </>}
      {mode==='edit'&&<form onSubmit={e=>{e.preventDefault();review();}} className="space-y-4"><p className="text-sm">Grades: 0–100. Leave missing values blank.</p><fieldset disabled={pending} className="tc-group tc-rows min-w-0">{activeLearners.map(l=>{const old=byCell.get(cellKey(l.id,subjectId,periodId));return <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-4 p-4"><label htmlFor={`grade-${l.id}`} className="min-w-0 break-words text-sm">{l.display_name}<span className="block text-xs text-[#606861]">Current: {gradeText(old?.grade)}{old?.source_type==='manual'?' · Manual':old?.source_reference?` · ${old.source_reference}`:''}</span></label><input id={`grade-${l.id}`} className={`${sectionInputClass} w-full tabular-nums`} inputMode="decimal" aria-label={`${l.display_name} grade`} value={draft[l.id]??(old?.grade==null?'':String(old.grade))} onChange={e=>setDraft({...draft,[l.id]:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();const inputs=Array.from(e.currentTarget.form?.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]')??[]);inputs[inputs.indexOf(e.currentTarget)+1]?.focus();}}}/></div>;})}</fieldset><div className="flex flex-wrap gap-3"><Button loading={Boolean(pending)} type="submit" disabled={pending||!activeLearners.length}>{pending?'Saving…':'Review & save'}</Button><Button type="button" variant="secondary" disabled={pending} onClick={()=>{setMode('view');setDraft({});setError('');}}>Cancel edits</Button></div></form>}
    </>}
    <ConfirmDialog open={confirm} title="Save reviewed grades?" description="Apply all changed cells for this subject and period. Replaced values become manual grades, including cleared cells. Check the entries above before saving." pending={pending} confirmLabel="Save grades" onCancel={()=>setConfirm(false)} onConfirm={save}/>
  </div>;
}
