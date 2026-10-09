'use client';
import {useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Select} from '@/components/ui/select';
import type {Template} from '@/features/report-card-templates/model';
import {gradeTableDraft,type GradeColumn} from './grade-table';
import type {MappingDefinition} from './model';
import {periodCode} from '@/features/assisted-workflows/labels';

const inputClass='w-full min-w-0 rounded-lg border border-[#E3E5E1] bg-white px-3 py-2 text-sm';
export function GradeTableControls({template,definition,disabled,onReview,onApply}:{template:Template;definition:MappingDefinition;disabled:boolean;onReview:(draft:MappingDefinition)=>Promise<MappingDefinition>;onApply:(draft:MappingDefinition)=>void}){
  const [open,setOpen]=useState(false),[sheet,setSheet]=useState(template.workbook_metadata.sheets[0]?.name??''),[columns,setColumns]=useState<GradeColumn[]>([1,2,3].map(n=>({label:`Term ${n}`,column:''}))),[rows,setRows]=useState(definition.subjects.map(s=>s.label).join('\n')),[start,setStart]=useState('30'),[subjectColumn,setSubjectColumn]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[proposal,setProposal]=useState<{base:string;definition:MappingDefinition}|null>(null),lock=useRef(false);
  const layout=columns.length===3&&columns.every((c,i)=>periodCode(c.label)===11+i)?'terms':columns.length===4&&columns.every((c,i)=>periodCode(c.label)===1+i)?'quarters':'detected';
  function invalidate(){setProposal(null);setError('');}
  async function run(work:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Could not prepare mappings. Try again.');}finally{lock.current=false;setBusy(false);}}
  return <section data-mapping-category="subject" className="shrink-0 border-b border-[#E3E5E1] bg-[#F4F7F4] p-3 space-y-3">
    <Button variant="secondary" className="w-full" aria-expanded={open} disabled={disabled||busy} onClick={()=>setOpen(!open)}>Map grade table</Button>
    {open&&<>
      <p className="text-sm">Set the columns once for every subject. This template can then be reused for all learners.</p>
      <fieldset disabled={disabled||busy} className="space-y-3 min-w-0">
        <Select name="gradeTableSheet" label="Grade table worksheet" value={sheet} disabled={disabled||busy} options={template.workbook_metadata.sheets.map(s=>({value:s.name,label:s.name}))} onChange={value=>{setSheet(value);invalidate();}}/>
        <Button variant="secondary" disabled={disabled||busy} onClick={()=>void run(async()=>{invalidate();const {detectGradeColumns}=await import('./grade-table-actions');const result=await detectGradeColumns(template.id,sheet);if(!result.ok)throw new Error(result.error);setColumns(result.columns);})}>{busy?'Preparing...':'Find term / quarter columns'}</Button>
        <div data-mapping-category="period"><Select name="gradeTablePeriods" label="Grading layout" value={layout} disabled={disabled||busy} options={[...(layout==='detected'?[{value:'detected',label:'Detected periods'}]:[]),{value:'terms',label:'3 terms (T1, T2, T3)'},{value:'quarters',label:'4 quarters (Q1, Q2, Q3, Q4)'}]} onChange={value=>{setColumns(Array.from({length:value==='quarters'?4:3},(_,i)=>({label:`${value==='quarters'?'Quarter':'Term'} ${i+1}`,column:''})));invalidate();}}/></div>
        <div data-mapping-category="period" className="grid grid-cols-2 gap-2">{columns.map((c,i)=><label key={i} className="text-sm">{c.label} column<input className={inputClass} placeholder="G" maxLength={3} value={c.column} onChange={e=>{setColumns(columns.map((x,j)=>j===i?{...x,column:e.target.value.toUpperCase()}:x));invalidate();}}/></label>)}</div>
        <label className="block text-sm">Subject name column (optional)<input className={inputClass} placeholder="C" maxLength={3} value={subjectColumn} onChange={e=>{setSubjectColumn(e.target.value.toUpperCase());invalidate();}}/></label>
        <p className="text-xs text-[#606861]">For blank subject labels, choose their column too. Leave empty to keep existing workbook labels.</p>
        <label className="block text-sm">First subject row<input className={inputClass} type="number" min={1} max={2000} value={start} onChange={e=>{setStart(e.target.value);invalidate();}}/></label>
        <label className="block text-sm">Subjects in worksheet order<textarea aria-label="Subjects in worksheet order" className={inputClass} rows={5} placeholder={'Calculus\nLanguage'} value={rows} maxLength={9000} onChange={e=>{setRows(e.target.value);invalidate();}}/></label>
        <p className="text-xs text-[#606861]">One name per line. To skip category or empty rows, enter a row with each name, for example: 30, Calculus and 32, Language on separate lines. Blank template rows need your subject names.</p>
        <Button disabled={disabled||busy||!rows.trim()} onClick={()=>void run(async()=>{const base=JSON.stringify(definition),draft=gradeTableDraft(definition,sheet,columns,rows,Number(start),subjectColumn);setProposal({base,definition:await onReview(draft)});})}>Review grade mappings</Button>
      </fieldset>
      {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}
      {proposal&&<div className="space-y-2 text-sm" aria-label="Grade table proposal">
        <p>Check every subject and cell below. For matching subject names, these period cells replace their previous locations. Other mappings stay unchanged.</p>
        {proposal.definition.subjects.map(s=><p key={s.key}><strong>{s.label}</strong>{s.labelLocation&&` (name: ${s.labelLocation.sheet}!${s.labelLocation.address})`}: {Object.entries(s.outputs).map(([key,loc])=>`${proposal.definition.periods.find(p=>p.key===key)?.label??key}: ${loc.sheet}!${loc.address}`).join(' · ')}</p>)}
        <Button disabled={disabled||busy||proposal.base!==JSON.stringify(definition)} onClick={()=>{onApply(proposal.definition);setProposal(null);setOpen(false);}}>Apply to mapping</Button>
        <Button variant="ghost" onClick={()=>setProposal(null)}>Cancel</Button>
        {proposal.base!==JSON.stringify(definition)&&<p>Mapping changed. Review the grade table again.</p>}
        <p>Apply updates this draft only. Use Save mapping to keep it.</p>
      </div>}
    </>}
  </section>;
}
