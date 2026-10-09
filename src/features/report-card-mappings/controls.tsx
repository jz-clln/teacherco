'use client';
import {useState} from 'react';
import {ChevronDown,X,School,CalendarDays,BookOpen} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Select} from '@/components/ui/select';
import {assignments,clearAssignment,FIELD_KEYS,FIELD_LABELS,PERIOD_KEYS,OUTPUT_KEYS,type Location,type MappingDefinition} from './model';
import type {Template} from '@/features/report-card-templates/model';

const categoryTone={classroom:'!border-blue-200 !bg-blue-50 !text-blue-900',period:'!border-amber-200 !bg-amber-50 !text-amber-900',subject:'!border-violet-200 !bg-violet-50 !text-violet-900'};
function categoryFor(id:string){return id.startsWith('field:')?'classroom':id.split(':')[2]?.startsWith('period_')?'period':'subject';}
const inputClass='min-h-11 w-full min-w-0 rounded-lg border border-[#E3E5E1] bg-white px-3 py-2 text-sm';
type Props={pickingId?:string;onStartPick?:(id:string,label:string)=>void;definition:MappingDefinition;disabled:boolean;onEdit:(definition:MappingDefinition)=>void;onPick:(id:string,location?:Location)=>void;onRemove:(kind:'subject'|'period',key:string)=>void};

export function AssignmentControls({template,definition,selected,onLocation,target,onTarget,onAssign,disabled}:{template:Template;definition:MappingDefinition;selected:Location|null;onLocation:(location:Location)=>void;target:string;onTarget:(id:string)=>void;onAssign:()=>void;disabled:boolean}){
  const options=[...FIELD_KEYS.map(key=>({value:`field:${key}`,label:FIELD_LABELS[key]})),...definition.subjects.flatMap(s=>[{value:`subject:${s.key}:label`,label:`${s.label} · Subject label`},...[...definition.periods,{key:'final_grade',label:'Final Grade'},{key:'remarks',label:'Remarks'}].map(p=>({value:`subject:${s.key}:${p.key}`,label:`${s.label} · ${p.label}`}))])];
  return <fieldset data-mapping-category={categoryFor(target)} disabled={disabled} className="min-w-0 shrink-0 space-y-2 border-b border-[#E3E5E1] p-3">
    <div className="flex items-center justify-between gap-2"><div className="min-w-0"><p className="text-xs text-[#606861]">Selected</p><p className="font-mono font-semibold">{selected?.address??'Select a cell'}</p>{selected&&<p className="truncate text-xs text-[#606861]">{selected.sheet}</p>}</div>
      <details className="relative"><summary className="tc-button tc-quiet cursor-pointer text-sm">Edit location</summary><div className="tc-floating absolute right-0 top-full z-30 w-64 space-y-3 bg-white p-3">
        <Select name="selectedWorksheet" label="Selected worksheet" value={selected?.sheet??''} placeholder="Choose worksheet" disabled={disabled} options={template.workbook_metadata.sheets.map(s=>({value:s.name,label:`${s.name}${s.state!=='visible'?' (hidden)':''}`}))} onChange={sheet=>onLocation({sheet,address:selected?.address??'A1'})}/>
        <label className="block text-sm">Cell or range<input className={inputClass} maxLength={24} placeholder="C8:F8" value={selected?.address??''} onChange={e=>onLocation({sheet:selected?.sheet??'',address:e.target.value.toUpperCase()})}/></label>
      </div></details>
    </div>
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${categoryTone[categoryFor(target)]}`}>{categoryFor(target)==='classroom'?'Classroom / learner':categoryFor(target)==='period'?'Period grade':'Subject'}</span>
    <Select name="meaning" label="Assign as" value={target} options={options} onChange={onTarget} disabled={disabled}/>
    <Button variant="secondary" className="w-full" disabled={!selected||disabled} onClick={onAssign}>Assign</Button>
  </fieldset>;
}

export function MappingFields({definition,disabled,onEdit,onPick,onRemove,pickingId,onStartPick}:Props){
  const [expanded,setExpanded]=useState<string|null>(null),[editPeriods,setEditPeriods]=useState(false),[adding,setAdding]=useState(false),[name,setName]=useState('');
  const mapped=assignments(definition);
  function row(id:string,label:string,location?:Location){
    const fullLabel=mapped.find(m=>m.id===id)?.label??(id.startsWith('subject:')?`${definition.subjects.find(s=>s.key===id.split(':')[1])?.label} - ${label}`:label);
    const tone=categoryTone[categoryFor(id)];
    return <div key={id} className="flex min-w-0 items-center gap-1 border-b border-[#E3E5E1] last:border-0">
      <button type="button" disabled={disabled} aria-label={`Map ${label}`} className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-[#F4F7F4]" onClick={()=>onPick(id,location)}>
        <span className="flex min-w-0 items-center gap-2 break-words"><span aria-hidden className={`h-3 w-1 shrink-0 rounded-full border ${tone}`}/>{label}</span><span className="shrink-0 text-right text-xs text-[#606861]" title={location?`${location.sheet}!${location.address}`:undefined}>{location?<><span className="block font-mono text-[#1A4D2E]">{location.address}</span><span className="block max-w-28 truncate">{location.sheet}</span></>:'Not mapped'}</span>
      </button>{!location&&onStartPick&&<Button variant="secondary" className={`shrink-0 !px-2 !text-xs ${tone}`} aria-label={`Select location for ${fullLabel}`} aria-pressed={pickingId===id} disabled={disabled} onClick={()=>onStartPick(id,fullLabel)}>{pickingId===id?'Selecting...':'Map'}</Button>}{location&&<Button variant="ghost" aria-label={`Clear ${fullLabel}`} disabled={disabled} onClick={()=>onEdit(clearAssignment(definition,id))}><X size={14}/></Button>}
    </div>;
  }
  return <>
    <section data-mapping-category="classroom"><h2 className="mb-2 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2 py-2 !text-sm text-blue-900"><School size={16} className="shrink-0" aria-hidden/>Classroom &amp; learner info</h2>{FIELD_KEYS.filter(k=>!['final_average','general_remarks'].includes(k)).map(k=>row(`field:${k}`,FIELD_LABELS[k],definition.fields[k]))}</section>
    <section data-mapping-category="period" className="mt-4 border-t border-[#E3E5E1] pt-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2"><h2 className="flex items-center gap-2 py-2 !text-sm text-amber-900"><CalendarDays size={16} className="shrink-0" aria-hidden/>Periods</h2><Button variant="ghost" className="!px-2 !text-xs !text-amber-900" disabled={disabled} onClick={()=>setEditPeriods(!editPeriods)}>{editPeriods?'Done':'Edit periods'}</Button></div>
      {editPeriods?<fieldset disabled={disabled} className="space-y-2">{definition.periods.map(p=><div key={p.key} className="flex items-center gap-1"><input aria-label={`${p.key} label`} className={inputClass} maxLength={120} value={p.label} onChange={e=>onEdit({...definition,periods:definition.periods.map(x=>x.key===p.key?{...x,label:e.target.value}:x)})}/><Button variant="ghost" aria-label={`Remove ${p.key}`} onClick={()=>onRemove('period',p.key)}><X size={16}/></Button></div>)}<Button variant="secondary" disabled={definition.periods.length>=8} onClick={()=>{const key=PERIOD_KEYS.find(k=>!definition.periods.some(p=>p.key===k));if(key)onEdit({...definition,periods:[...definition.periods,{key,label:`Period ${key.slice(-1)}`}]});}}>Add period</Button></fieldset>:<ol className="space-y-1 text-sm text-[#606861]">{definition.periods.map((p,i)=><li key={p.key}>{i+1} · {p.label}</li>)}{!definition.periods.length&&<li>No periods</li>}</ol>}
    </section>
    <section data-mapping-category="subject" className="mt-4 border-t border-[#E3E5E1] pt-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2"><h2 className="flex items-center gap-2 py-2 !text-sm text-violet-900"><BookOpen size={16} className="shrink-0" aria-hidden/>Subjects</h2><Button variant="ghost" className="!px-2 !text-xs !text-violet-900" disabled={disabled} onClick={()=>setAdding(!adding)}>Add subject</Button></div>
      {adding&&<form className="mb-2 flex gap-2" onSubmit={e=>{e.preventDefault();if(!name.trim()||definition.subjects.length>=60||disabled)return;const key=crypto.randomUUID();onEdit({...definition,subjects:[...definition.subjects,{key,label:name.trim(),outputs:{}}]});setName('');setExpanded(key);setAdding(false);}}><input aria-label="New subject label" placeholder="Subject name" className={inputClass} maxLength={120} value={name} onChange={e=>setName(e.target.value)}/><Button variant="secondary" type="submit" disabled={!name.trim()||definition.subjects.length>=60||disabled}>Add</Button></form>}
      {definition.subjects.map(s=><div key={s.key} className="border-b border-[#E3E5E1] last:border-0"><button type="button" aria-label={`${s.label} ${mapped.filter(m=>m.id.startsWith(`subject:${s.key}:`)).length} mapped`} aria-expanded={expanded===s.key} className="flex w-full items-center gap-2 py-2 text-left text-sm" onClick={()=>setExpanded(expanded===s.key?null:s.key)}><span className="min-w-0 flex-1 break-words">{s.label||'Unnamed subject'}</span><span className="text-xs text-[#606861]">{mapped.filter(m=>m.id.startsWith(`subject:${s.key}:`)).length} mapped</span><ChevronDown size={16} className={expanded===s.key?'rotate-180':''}/></button>
        {expanded===s.key&&<div className="pb-3"><fieldset disabled={disabled}><label className="block text-xs text-[#606861]">Subject label<input aria-label={`Subject label ${s.key}`} className={inputClass} maxLength={120} value={s.label} onChange={e=>onEdit({...definition,subjects:definition.subjects.map(x=>x.key===s.key?{...x,label:e.target.value}:x)})}/></label></fieldset>{row(`subject:${s.key}:label`,'Label',s.labelLocation)}{[...definition.periods,{key:'final_grade',label:'Final'},{key:'remarks',label:'Remarks'}].map(p=>row(`subject:${s.key}:${p.key}`,p.label,s.outputs[p.key as typeof OUTPUT_KEYS[number]]))}<Button variant="ghost" className="text-red-800" disabled={disabled} aria-label={`Remove subject ${s.label}`} onClick={()=>onRemove('subject',s.key)}>Remove subject</Button></div>}
      </div>)}
    </section>
    <details className="mt-4 border-t border-[#E3E5E1] pt-2"><summary className="cursor-pointer py-2 text-sm font-semibold">Optional fields</summary>{(['final_average','general_remarks'] as const).map(k=>row(`field:${k}`,FIELD_LABELS[k],definition.fields[k]))}</details>
  </>;
}
