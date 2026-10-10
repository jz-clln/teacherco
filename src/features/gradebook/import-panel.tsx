'use client';
import { Select } from '@/components/ui/select';
import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { GradebookData } from './data';
import { importSubjectId,importPeriodId,gradeText, type ImportPreview, type ImportSelection } from './model';
import { previewClassGrades, importClassGrades } from './actions';
export function ClassGradeImport({ book, onClose, onSaved }: { book:GradebookData;onClose:()=>void;onSaved:()=>void }) {
  const [subjectId,setSubjectId]=useState(''),[periodId,setPeriodId]=useState(importPeriodId(1,book.periods)),[destinationConfirmed,setDestinationConfirmed]=useState(false);
  const [classId,setClassId]=useState(''),[term,setTerm]=useState(1),[calculation,setCalculation]=useState<''|'printed'|'calculated'>('');
  const [preview,setPreview]=useState<ImportPreview|null>(null),[replace,setReplace]=useState<string[]>([]),[error,setError]=useState(''),[confirm,setConfirm]=useState(false);
  const [pending,start]=useTransition(),lock=useRef(false);
  const selection={sectionId:book.section.id,subjectId,periodId,classId,term,calculation,destinationConfirmed} as ImportSelection;
  const matchedSubject=importSubjectId(book.classes.find(c=>c.id===classId)?.subject??'',book.subjects);
  function resetPreview(){setPreview(null);setReplace([]);setConfirm(false);setError('');}
  const changed=preview?.rows.filter(r => (r.status==='add'||r.status==='change') && (r.current?.source_type!=='manual'||replace.includes(r.learnerId)))??[];
  function run(apply:boolean) {
    if(!subjectId||!periodId||(!matchedSubject&&!destinationConfirmed)){setError('Choose and confirm where these grades belong first.');return;}
    if(lock.current)return;lock.current=true;setError('');
    start(async()=>{try {
      if(apply&&preview){const result=await importClassGrades({...selection,digest:preview.digest,replaceManual:replace,confirmed:true});if(!result.ok)setError(result.error);else onSaved();}
      else {const result=await previewClassGrades(selection);if(!result.ok)setError(result.error);else{setPreview(result.data);setReplace([]);}}
    } catch {setError('Connection interrupted. Review a fresh preview before retrying.');} finally {lock.current=false;setConfirm(false);} });
  }
  return <section aria-label="Import from Class" className="space-y-5"><div><h2>Import / Refresh from Class</h2><p className="mt-2 text-sm text-[#606861]">Choose the source class. Grades will be saved under its matching subject.</p></div>
    {error&&<p role="alert" className="text-red-800">{error}</p>}
    <form onSubmit={e=>{e.preventDefault();run(false);}} className="tc-group p-4 space-y-4"><fieldset disabled={pending} className="space-y-4 min-w-0">
      <Select name={"Linked class"} label={"Linked class"} value={String(classId)} required={true} onChange={value => { setClassId(value);setSubjectId(importSubjectId(book.classes.find(c=>c.id===value)?.subject??'',book.subjects));setDestinationConfirmed(false);resetPreview(); }} emptyLabel={"Choose class"} options={book.classes.map(c => ({ value: String(c.id), label: `${c.subject} \u00B7 ${c.name}` }))}/>
      <Select name={"Source class term"} label={"Source class term"} value={String(term)} onChange={value => { setTerm(Number(value));setPeriodId(importPeriodId(Number(value),book.periods));resetPreview(); }} options={[1, 2, 3].map(t => ({ value: String(t), label: `Term ${t}` }))}/>
      {classId&&!matchedSubject&&<><Select name="Destination subject" label="Save under Section subject" value={subjectId} emptyLabel="Choose the matching subject" options={book.subjects.filter(s=>s.status==='active').map(s=>({value:s.id,label:s.name}))} onChange={value=>{setSubjectId(value);setDestinationConfirmed(false);resetPreview();}}/><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={destinationConfirmed} onChange={e=>{setDestinationConfirmed(e.target.checked);resetPreview();}}/>This class belongs to the selected subject.</label></>}
      {classId&&<details open={!importPeriodId(term,book.periods)}><summary className="cursor-pointer text-sm">Change destination period</summary><Select name="Destination period" label="Save under Section period" value={periodId} emptyLabel="Choose grading period" options={book.periods.filter(p=>p.status==='active').map(p=>({value:p.id,label:p.label}))} onChange={value=>{setPeriodId(value);resetPreview();}}/></details>}
      {classId&&<p role="status" className="rounded-lg bg-[#EAF0EA] p-3 text-sm">Save to: <strong>{book.subjects.find(s=>s.id===subjectId)?.name??'Choose subject'} / {book.periods.find(p=>p.id===periodId)?.label??'Choose period'}</strong>. Other subjects and terms stay unchanged.</p>}
      <Select name={"Grade source"} label={"Grade source"} value={String(calculation)} required={true} onChange={value => { setCalculation(value as typeof calculation);resetPreview(); }} emptyLabel={"Choose source explicitly"} options={[{ value: "printed", label: "Printed / imported class-record grade" }, { value: "calculated", label: "TeacherCo calculated term grade" }]}/>
      <p className="text-sm text-[#606861]">Both sources appear in the preview. Missing values never erase reviewed grades.</p><div className="flex flex-wrap items-center gap-2"><Button loading={Boolean(pending)} type="submit" disabled={pending||!classId||!subjectId||!periodId||!calculation||(!matchedSubject&&!destinationConfirmed)}>{pending?'Loading…':'Review grades'}</Button>
      {preview&&<><Link className="tc-button tc-secondary" href={`/sections/${book.section.id}/learners`}>Manage roster</Link><Button type="button" disabled={pending||!changed.length||changed.length>500} onClick={()=>setConfirm(true)}>Import {changed.length} grades</Button></>}
      <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>Cancel import</Button>
      </div>
      {preview&&changed.length>500&&<p role="alert">Import up to 500 changed learners at once.</p>}
    </fieldset></form>
    {preview&&<><div className="tc-group p-4 text-sm space-y-2"><h3 className="font-semibold">Review changes</h3><p>{preview.rows.filter(r=>r.status==='add').length} new · {preview.rows.filter(r=>r.status==='change').length} changed · {preview.rows.filter(r=>r.status==='unchanged').length} unchanged · {preview.rows.filter(r=>r.status==='missing').length} missing · {preview.rows.filter(r=>r.status==='outside').length} outside active Section roster</p><p>{changed.length} selected changes. Manual values are kept unless you explicitly select replacement.</p></div>
      <div className="tc-group tc-rows">{preview.rows.map(r=><div key={r.learnerId} className="p-4 space-y-2"><p className="font-medium break-words">{r.name}</p><dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><div><dt className="text-[#606861]">Current</dt><dd>{gradeText(r.current?.grade)} {r.current?.source_type==='manual'?'· Manual':''}</dd></div><div><dt className="text-[#606861]">Printed</dt><dd>{gradeText(r.printed)}</dd></div><div><dt className="text-[#606861]">Calculated</dt><dd>{gradeText(r.calculated)}</dd></div><div><dt className="text-[#606861]">Result</dt><dd>{r.status==='outside'?'Not in active Section roster':r.status==='missing'?'Missing — keep current':r.status==='unchanged'?'No change':`${r.status==='add'?'Add':'Change to'} ${gradeText(r.incoming)}`}</dd></div></dl>
        {r.printed!=null&&r.calculated!=null&&r.printed!==r.calculated&&<p className="text-sm text-amber-900">Printed and calculated grades differ. Using {calculation} grade.</p>}
        {r.current?.source_type==='manual'&&(r.status==='change'||r.status==='add')&&<label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" disabled={pending} checked={replace.includes(r.learnerId)} onChange={e=>setReplace(e.target.checked?[...replace,r.learnerId]:replace.filter(id=>id!==r.learnerId))}/>Manual value differs from class. Replace this manual value.</label>}
        {calculation==='calculated'&&r.warnings.length>0&&<details className="text-sm"><summary className="min-h-11 cursor-pointer py-3">Calculation notes</summary><ul className="list-disc pl-5">{r.warnings.map(w=><li key={w}>{w}</li>)}</ul></details>}
      </div>)}</div>
    </>}
    <ConfirmDialog open={confirm} title="Apply reviewed class grades?" description={`Save to ${book.subjects.find(s=>s.id===subjectId)?.name} / ${book.periods.find(p=>p.id===periodId)?.label}. ${changed.length} cells will be saved. ${changed.filter(r=>r.current?.grade!=null).length} existing values will change, including ${changed.filter(r=>r.current?.source_type==='manual').length} manual values. Unselected manual values stay as they are.`} pending={pending} confirmLabel="Import grades" onCancel={()=>setConfirm(false)} onConfirm={()=>run(true)}/>
  </section>;
}
