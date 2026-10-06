'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {TemplateViewer} from '@/features/report-card-templates/viewer';
import {cellAddress,parseMerge,type CellSelection,type Template} from '@/features/report-card-templates/model';
import {reviewMapping,saveMapping,resetMapping} from './actions';
import {assignments,clearAssignment,emptyDefinition,FIELD_KEYS,FIELD_LABELS,PERIOD_KEYS,OUTPUT_KEYS,locationSchema,type Location,type MappingDefinition,type MappingRecord} from './model';

const inputClass='mt-1 min-h-11 w-full min-w-0 rounded-lg border border-[#E3E5E1] bg-white px-3 py-2 text-sm';
const steps=['Learner / school','Grade table','Optional fields','Review'];
type Confirmation={kind:'reset'|'reload'}|{kind:'subject'|'period';key:string};
export function MappingWorkspace({template,initial}:{template:Template;initial:MappingRecord|null}){
  const [definition,setDefinition]=useState<MappingDefinition>(initial?.mapping_definition??emptyDefinition(template.file_sha256));
  const [record,setRecord]=useState(initial),[baseline,setBaseline]=useState(JSON.stringify(definition)),[step,setStep]=useState(0);
  const [selected,setSelected]=useState<Location|null>(null),[rangeMode,setRangeMode]=useState(false),[anchor,setAnchor]=useState<Location|null>(null);
  const [target,setTarget]=useState('field:learner_name'),[subjectName,setSubjectName]=useState('');
  const [review,setReview]=useState<{definition:MappingDefinition;warnings:string[]}|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[pending,setPending]=useState(false),[confirm,setConfirm]=useState<Confirmation|null>(null);
  const allowNavigation=useRef(false),lock=useRef(false),dirty=JSON.stringify(definition)!==baseline,archived=template.status==='archived',mapped=assignments(definition);
  useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{if(allowNavigation.current)return;event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  function edit(next:MappingDefinition){setDefinition(next);setReview(null);setError('');setMessage('');}
  const identity=()=>({templateId:template.id,expectedId:record?.id??null,revision:record?.revision??0});
  async function run(work:()=>Promise<void>){if(lock.current)return;lock.current=true;setPending(true);setError('');setMessage('');try{await work();}catch{setError('This action could not finish. Check your connection and retry.');}finally{lock.current=false;setPending(false);}}
  function select(selection:CellSelection){
    const location={sheet:selection.sheetName,address:selection.mergedRange??selection.address};
    if(rangeMode&&anchor&&anchor.sheet===location.sheet){const a=parseMerge(anchor.address),b=parseMerge(location.address);setSelected({sheet:location.sheet,address:`${cellAddress(Math.min(a.top,b.top),Math.min(a.left,b.left))}:${cellAddress(Math.max(a.bottom,b.bottom),Math.max(a.right,b.right))}`});setAnchor(null);}
    else {setSelected(location);setAnchor(rangeMode?location:null);}
  }
  function assign(){
    if(!selected||!locationSchema.safeParse(selected).success){setError('Select a cell or enter a valid uppercase A1 range first.');return;}
    try{parseMerge(selected.address);}catch{setError('Choose a valid cell or rectangular range.');return;}
    const next=structuredClone(definition),[kind,key,output]=target.split(':');
    if(kind==='field'&&FIELD_KEYS.includes(key as typeof FIELD_KEYS[number]))next.fields[key as typeof FIELD_KEYS[number]]={...selected};
    else {const subject=next.subjects.find(s=>s.key===key);if(!subject){setError('Add and select a subject row first.');return;}if(output==='label')subject.labelLocation={...selected};else if(OUTPUT_KEYS.includes(output as typeof OUTPUT_KEYS[number]))subject.outputs[output as typeof OUTPUT_KEYS[number]]={...selected};else return;}
    edit(next);setMessage('Location assigned locally. Review and save to keep it.');
  }
  async function reviewNow(){await run(async()=>{const result=await reviewMapping({...identity(),definition});if(!result.ok){setError(result.error);return;}setDefinition(result.data.definition);setReview(result.data);setStep(3);});}
  async function save(status:'draft'|'reviewed'){if(!review)return;await run(async()=>{const result=await saveMapping({...identity(),definition:review.definition,status});if(!result.ok){setError(result.error);return;}setRecord(result.data);setDefinition(result.data.mapping_definition);setBaseline(JSON.stringify(result.data.mapping_definition));setMessage(status==='draft'?'Draft saved. Reopen this template to continue later.':'Mapping saved. The source workbook is unchanged.');});}
  async function confirmAction(){if(!confirm)return;
    if(confirm.kind==='reload'){allowNavigation.current=true;window.location.reload();return;}
    if(confirm.kind==='reset'){await run(async()=>{const result=await resetMapping({...identity(),confirmed:true});if(!result.ok){setError(result.error);return;}const empty=emptyDefinition(template.file_sha256);setDefinition(empty);setBaseline(JSON.stringify(empty));setRecord(null);setReview(null);setStep(0);setMessage('Mapping reset. The source workbook is unchanged.');});}
    else if('key' in confirm){const {key,kind}=confirm,next=structuredClone(definition);if(kind==='subject')next.subjects=next.subjects.filter(s=>s.key!==key);else{next.periods=next.periods.filter(p=>p.key!==key);for(const s of next.subjects)delete s.outputs[key as typeof PERIOD_KEYS[number]];}edit(next);}
    setConfirm(null);
  }
  const optional=step===2,fields=FIELD_KEYS.filter(k=>optional?['final_average','general_remarks'].includes(k):!['final_average','general_remarks'].includes(k));
  return <div className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center gap-3 text-sm"><span role="status">{dirty?'Unsaved changes':record?`${record.status==='draft'?'Draft':'Reviewed mapping'} · Revision ${record.revision}`:'No saved mapping'}</span><Button variant="secondary" disabled={pending} onClick={()=>setConfirm({kind:'reload'})}>Reopen saved mapping</Button>{record&&<Button variant="ghost" disabled={pending||archived} onClick={()=>setConfirm({kind:'reset'})}>Reset mapping</Button>}</div>
    {archived&&<p className="tc-group p-4 text-sm">This template is archived. Reactivate it from the workbook page to edit its mapping.</p>}
    {error&&<p role="alert" className="break-words rounded-lg border border-red-200 bg-white p-4 text-sm text-red-800">{error}</p>}{message&&<p role="status" className="text-sm text-[#1A4D2E]">{message}</p>}
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-2"><TemplateViewer id={template.id} metadata={template.workbook_metadata} onSelection={select} markers={[...mapped.map(m=>({...m.location,label:m.label})),...(selected?[{...selected,label:'Selected location'}]:[])]}/><p className="text-xs text-[#606861]">Outlined locations are mapped or selected. Hover a mapped cell to see its meaning. Workbook colors are preserved.</p></div>
      <section aria-label="Mapping controls" className="min-w-0 space-y-4">
        <nav aria-label="Mapping steps" className="flex flex-wrap gap-1">{steps.map((label,index)=><Button key={label} variant={step===index?'primary':'ghost'} disabled={pending} onClick={()=>{if(index===3){void reviewNow();return;}setStep(index);}}>{index+1}. {label}</Button>)}</nav>
        <fieldset disabled={pending||archived} className="min-w-0 space-y-4">
          {step===1&&<div className="tc-group space-y-4 p-4"><h2 className="font-semibold">Output periods</h2><p className="text-xs text-[#606861]">Add only the periods printed on this template. Slot identities stay stable when labels change.</p>
            {definition.periods.map(p=><div key={p.key} className="flex min-w-0 items-end gap-2"><label className="min-w-0 flex-1 text-sm">{p.key}<input aria-label={`${p.key} label`} className={inputClass} maxLength={120} value={p.label} onChange={e=>edit({...definition,periods:definition.periods.map(x=>x.key===p.key?{...x,label:e.target.value}:x)})}/></label><Button variant="ghost" aria-label={`Remove ${p.key}`} onClick={()=>setConfirm({kind:'period',key:p.key})}>Remove</Button></div>)}
            <Button variant="secondary" disabled={definition.periods.length>=8} onClick={()=>{const key=PERIOD_KEYS.find(k=>!definition.periods.some(p=>p.key===k));if(key)edit({...definition,periods:[...definition.periods,{key,label:`Period ${key.slice(-1)}`}]});}}>Add period</Button>
            <h2 className="border-t border-[#E3E5E1] pt-4 font-semibold">Subject rows</h2><p className="text-xs text-[#606861]">Use the labels your report card needs. These rows are reusable across Sections.</p>
            {definition.subjects.map(s=><div key={s.key} className="space-y-2 rounded-lg border border-[#E3E5E1] p-3"><label className="block text-sm">Subject label<input aria-label={`Subject label ${s.key}`} className={inputClass} maxLength={120} value={s.label} onChange={e=>edit({...definition,subjects:definition.subjects.map(x=>x.key===s.key?{...x,label:e.target.value}:x)})}/></label><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={()=>setTarget(`subject:${s.key}:label`)}>Map this row</Button><Button variant="ghost" aria-label={`Remove subject ${s.label}`} onClick={()=>setConfirm({kind:'subject',key:s.key})}>Remove</Button></div></div>)}
            <label className="block text-sm">New subject label<input className={inputClass} maxLength={120} value={subjectName} onChange={e=>setSubjectName(e.target.value)}/></label><Button variant="secondary" disabled={!subjectName.trim()||definition.subjects.length>=60} onClick={()=>{const key=crypto.randomUUID();edit({...definition,subjects:[...definition.subjects,{key,label:subjectName.trim(),outputs:{}}]});setSubjectName('');setTarget(`subject:${key}:label`);}}>Add subject row</Button>
          </div>}
          {step!==3&&<div className="tc-group space-y-3 p-4"><h2 className="font-semibold">Assign field</h2><p className="text-xs leading-5 text-[#606861]">Select a location in the workbook, then choose its meaning. Enter locations and labels only; never enter actual learner or LRN values here.</p>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={rangeMode} onChange={e=>{setRangeMode(e.target.checked);setAnchor(null);}}/>Select range with two clicks</label>{anchor&&<p className="text-xs">Range starts at {anchor.sheet}!{anchor.address}. Select the opposite corner on the same sheet.</p>}
            <label className="block text-sm">Selected worksheet<select aria-label="Selected worksheet" className={inputClass} value={selected?.sheet??''} onChange={e=>{setSelected({sheet:e.target.value,address:selected?.address??'A1'});setAnchor(null);}}><option value="" disabled>Select from viewer</option>{template.workbook_metadata.sheets.map(s=><option key={s.index} value={s.name}>{s.name}{s.state!=='visible'?` (${s.state})`:''}</option>)}</select></label>
            <label className="block text-sm">Cell or range<input className={inputClass} placeholder="C8 or C8:F8" maxLength={24} value={selected?.address??''} onChange={e=>{setSelected({sheet:selected?.sheet??'',address:e.target.value.toUpperCase()});setAnchor(null);}}/></label>
            <label className="block text-sm">Meaning<select aria-label="Meaning" className={inputClass} value={target} onChange={e=>setTarget(e.target.value)}><optgroup label="Learner and school">{FIELD_KEYS.map(k=><option key={k} value={`field:${k}`}>{FIELD_LABELS[k]}</option>)}</optgroup>{definition.subjects.map(s=><optgroup key={s.key} label={s.label||'Unnamed subject'}><option value={`subject:${s.key}:label`}>{s.label} · Subject label</option>{[...definition.periods.map(p=>({key:p.key,label:p.label})),{key:'final_grade',label:'Final Grade'},{key:'remarks',label:'Remarks'}].map(p=><option key={p.key} value={`subject:${s.key}:${p.key}`}>{s.label} · {p.label}</option>)}</optgroup>)}</select></label>
            <Button disabled={!selected} onClick={assign}>Assign location</Button><p className="text-xs text-[#606861]">A range reserves one output area anchored at its top-left cell. No workbook values are written.</p>
          </div>}
          {(step===0||step===2)&&<div className="tc-group space-y-3 p-4"><h2 className="font-semibold">{optional?'Optional fields':'Learner / school fields'}</h2>{fields.map(key=><div key={key} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{FIELD_LABELS[key]}</span><Button variant="ghost" onClick={()=>setTarget(`field:${key}`)}>{definition.fields[key]?`${definition.fields[key]!.sheet}!${definition.fields[key]!.address}`:'Choose location'}</Button></div>)}<p className="text-xs text-[#606861]">Every field is optional. Map only what this template contains.</p></div>}
          <div className="tc-group space-y-3 p-4"><h2 className="font-semibold">{step===3?'Review mapping':'Assigned locations'} ({mapped.length})</h2>{!mapped.length&&<p className="text-sm text-[#606861]">No locations assigned yet.</p>}{mapped.map(m=><div key={m.id} className="border-b border-[#E3E5E1] pb-2 text-sm last:border-0"><p className="break-words font-medium">{m.label}</p><p className="break-all text-[#606861]">{m.location.sheet}!{m.location.address}</p><Button variant="ghost" aria-label={`Clear ${m.label}`} onClick={()=>edit(clearAssignment(definition,m.id))}>Clear</Button></div>)}</div>
          {step===3&&review&&<div className="tc-group space-y-3 p-4"><h2 className="font-semibold">Periods and subjects</h2><p className="break-words text-sm">{definition.periods.map(p=>p.label).join(' · ')||'No periods defined'}</p><p className="break-words text-sm">{definition.subjects.map(s=>s.label).join(' · ')||'No subjects defined'}</p>{review.warnings.length>0&&<div className="space-y-2 text-sm text-[#606861]"><h3 className="font-medium">Optional omissions</h3>{review.warnings.map(w=><p key={w}>{w}</p>)}</div>}<p className="text-xs text-[#606861]">Validation checks locations and consistency. Section compatibility and report-card generation come later.</p><div className="flex flex-wrap gap-2"><Button onClick={()=>void save('reviewed')}>Save mapping</Button><Button variant="secondary" onClick={()=>void save('draft')}>Save draft</Button></div></div>}
          {(step!==3||!review)&&<Button onClick={()=>void reviewNow()}>Review mapping</Button>}
        </fieldset>{pending&&<p role="status" className="text-sm text-[#4F6F52]">Checking mapping…</p>}
      </section>
    </div>
    <ConfirmDialog open={confirm!==null} title={confirm?.kind==='reload'?'Reopen saved mapping?':confirm?.kind==='reset'?'Reset entire mapping?':'Remove this mapping item?'} description={confirm?.kind==='reload'?'Unsaved changes will be discarded.':confirm?.kind==='reset'?'This deletes the saved mapping and discards local changes. The original workbook is preserved.':'This clears this item and its assigned output locations from your local draft. Save explicitly to keep the change.'} confirmLabel={confirm?.kind==='reload'?'Reopen':confirm?.kind==='reset'?'Reset mapping':'Remove item'} destructive={confirm?.kind!=='reload'} pending={pending} onCancel={()=>setConfirm(null)} onConfirm={()=>void confirmAction()}/>
  </div>;
}
