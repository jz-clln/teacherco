'use client';
import Link from 'next/link';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowLeft,MoreHorizontal,Maximize,Minimize} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {TemplateViewer} from '@/features/report-card-templates/viewer';
import {cellAddress,parseMerge,type CellSelection,type Template} from '@/features/report-card-templates/model';
import {reviewMapping,saveMapping,resetMapping} from './actions';
import {assignments,emptyDefinition,FIELD_KEYS,PERIOD_KEYS,OUTPUT_KEYS,locationSchema,type Location,type MappingDefinition,type MappingRecord} from './model';
import {AssignmentControls,MappingFields} from './controls';
import {MappingPanel,useCompactMapping} from './panel';

type Confirmation={kind:'reset'|'reload'}|{kind:'subject'|'period';key:string};
export function MappingWorkspace({template,initial,compatibility,draft}:{template:Template;initial:MappingRecord|null;compatibility?:ReactNode;draft?:MappingDefinition}){
  const [definition,setDefinition]=useState<MappingDefinition>(draft??initial?.mapping_definition??emptyDefinition(template.file_sha256));
  const [record,setRecord]=useState(initial),[baseline,setBaseline]=useState(JSON.stringify(initial?.mapping_definition??emptyDefinition(template.file_sha256)));
  const [selected,setSelected]=useState<Location|null>(null),[rangeMode,setRangeMode]=useState(false),[anchor,setAnchor]=useState<Location|null>(null),[target,setTarget]=useState('field:learner_name');
  const [review,setReview]=useState<{definition:MappingDefinition;warnings:string[]}|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[pending,setPending]=useState(false),[confirm,setConfirm]=useState<Confirmation|null>(null);
  const [panelOpen,setPanelOpen]=useState(false),[panelView,setPanelView]=useState<'map'|'mapped'|'review'>('map');
  const [fullscreen,setFullscreen]=useState(false),workspace=useRef<HTMLDivElement>(null),fullscreenButton=useRef<HTMLButtonElement>(null),fullscreenLock=useRef(false);
  useEffect(()=>{const changed=()=>{setFullscreen(document.fullscreenElement===workspace.current);fullscreenButton.current?.focus();};document.addEventListener('fullscreenchange',changed);return()=>document.removeEventListener('fullscreenchange',changed);},[]);
  useEffect(()=>{if(!fullscreen)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented&&!document.fullscreenElement&&!document.querySelector('dialog[open]')){setFullscreen(false);fullscreenButton.current?.focus();}};document.addEventListener('keydown',escape);return()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',escape);};},[fullscreen]);
  async function toggleFullscreen(){
    if(fullscreenLock.current)return;fullscreenLock.current=true;
    try{if(fullscreen){if(document.fullscreenElement===workspace.current)await document.exitFullscreen();setFullscreen(false);}else{setFullscreen(true);try{await workspace.current?.requestFullscreen?.();}catch{/* Keep the expanded in-app view when browser fullscreen is unavailable. */}}}
    catch{setError('Press Esc to exit full screen.');}finally{fullscreenLock.current=false;}
  }
  const compact=useCompactMapping(),more=useRef<HTMLDetailsElement>(null),allowNavigation=useRef(false),lock=useRef(false);
  const dirty=JSON.stringify(definition)!==baseline,archived=template.status==='archived',mapped=assignments(definition);
  useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{if(allowNavigation.current)return;event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  function edit(next:MappingDefinition){setDefinition(next);setReview(null);setError('');setMessage('');}
  function openPanel(view:typeof panelView){setPanelView(view);setPanelOpen(true);}
  function closeMore(){more.current?.removeAttribute('open');}
  const identity=()=>({templateId:template.id,expectedId:record?.id??null,revision:record?.revision??0});
  async function run(work:()=>Promise<void>){if(lock.current)return;lock.current=true;setPending(true);setError('');setMessage('');closeMore();try{await work();}catch{setError('Could not finish. Check your connection and retry.');}finally{lock.current=false;setPending(false);}}
  function select(selection:CellSelection){
    const location={sheet:selection.sheetName,address:selection.mergedRange??selection.address};
    if(rangeMode&&anchor&&anchor.sheet===location.sheet){const a=parseMerge(anchor.address),b=parseMerge(location.address);setSelected({sheet:location.sheet,address:`${cellAddress(Math.min(a.top,b.top),Math.min(a.left,b.left))}:${cellAddress(Math.max(a.bottom,b.bottom),Math.max(a.right,b.right))}`});setAnchor(null);openPanel('map');}
    else{setSelected(location);setAnchor(rangeMode?location:null);if(!rangeMode)openPanel('map');}
  }
  function assign(){
    if(!selected||!locationSchema.safeParse(selected).success){setError('Select a cell or enter a valid A1 range.');return;}
    try{parseMerge(selected.address);}catch{setError('Choose a valid cell or rectangular range.');return;}
    const next=structuredClone(definition),[kind,key,output]=target.split(':');
    if(kind==='field'&&FIELD_KEYS.includes(key as typeof FIELD_KEYS[number]))next.fields[key as typeof FIELD_KEYS[number]]={...selected};
    else{const subject=next.subjects.find(s=>s.key===key);if(!subject){setError('Add a subject first.');return;}if(output==='label')subject.labelLocation={...selected};else if(OUTPUT_KEYS.includes(output as typeof OUTPUT_KEYS[number]))subject.outputs[output as typeof OUTPUT_KEYS[number]]={...selected};else return;}
    edit(next);setPanelOpen(false);
  }
  async function reviewNow(){await run(async()=>{const result=await reviewMapping({...identity(),definition});if(!result.ok){setError(result.error);return;}setDefinition(result.data.definition);setReview(result.data);openPanel('review');});}
  async function save(status:'draft'|'reviewed'){
    await run(async()=>{
      // Same validation and revision checks; Save no longer requires a wizard step.
      const checked=review??await reviewMapping({...identity(),definition}).then(result=>{if(!result.ok){setError(result.error);return null;}return result.data;});
      if(!checked)return;setDefinition(checked.definition);setReview(checked);
      const result=await saveMapping({...identity(),definition:checked.definition,status});if(!result.ok){setError(result.error);return;}
      try{sessionStorage.removeItem(`mapping-proposal:${template.id}`);}catch{}setRecord(result.data);setDefinition(result.data.mapping_definition);setBaseline(JSON.stringify(result.data.mapping_definition));setMessage(status==='draft'?'Draft saved.':'Mapping saved.');
    });
  }
  async function confirmAction(){if(!confirm)return;
    if(confirm.kind==='reload'){allowNavigation.current=true;window.location.reload();return;}
    if(confirm.kind==='reset'){await run(async()=>{const result=await resetMapping({...identity(),confirmed:true});if(!result.ok){setError(result.error);return;}const empty=emptyDefinition(template.file_sha256);setDefinition(empty);setBaseline(JSON.stringify(empty));setRecord(null);try{sessionStorage.removeItem(`mapping-proposal:${template.id}`);}catch{}setReview(null);setMessage('Mapping reset.');});}
    else if('key' in confirm){const {key,kind}=confirm,next=structuredClone(definition);if(kind==='subject')next.subjects=next.subjects.filter(s=>s.key!==key);else{next.periods=next.periods.filter(p=>p.key!==key);for(const s of next.subjects)delete s.outputs[key as typeof PERIOD_KEYS[number]];}edit(next);}
    setConfirm(null);
  }
  return <div ref={workspace} className="flex min-h-0 flex-1 flex-col gap-3" data-mapping-workspace data-mapping-fullscreen={fullscreen?'true':undefined}>
    <header className="relative z-20 flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-[#E3E5E1] bg-white p-3">
      <Link href={`/report-cards/templates/${template.id}`} className="tc-button tc-quiet px-2" aria-label="Back to workbook"><ArrowLeft size={18}/></Link>
      <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-0"><h1 className="truncate !text-lg" title={template.name}>{template.name}</h1><p role="status" className="text-xs text-[#606861]">{mapped.length} mapped · {dirty?'Unsaved changes':record?`${record.status==='draft'?'Draft':'Reviewed'} · Revision ${record.revision}`:'Not saved'}</p></div>
      <Button loading={Boolean(pending)} className="ml-auto" disabled={pending||archived} onClick={()=>void save('reviewed')}>{pending?'Saving…':'Save mapping'}</Button>
      <button type="button" ref={fullscreenButton} className="tc-button tc-secondary" aria-pressed={fullscreen} onClick={()=>void toggleFullscreen()}>{fullscreen?<Minimize size={17} aria-hidden/>:<Maximize size={17} aria-hidden/>}{fullscreen?'Exit full screen':'Full screen'}</button>
      <details ref={more} className="relative" onKeyDown={e=>{if(e.key==='Escape')closeMore();}}><summary aria-label="More mapping actions" className="tc-button tc-quiet list-none px-2"><MoreHorizontal size={20}/></summary>
        <div className="tc-floating absolute right-0 top-full z-40 mt-2 max-h-[65dvh] w-64 overflow-auto bg-white p-2">
          <Button className="w-full justify-start" variant="ghost" disabled={pending||archived} onClick={()=>void reviewNow()}>Review</Button>
          <Button className="w-full justify-start" variant="ghost" disabled={pending||archived} onClick={()=>void save('draft')}>Save draft</Button>
          <Button className="w-full justify-start" variant="ghost" disabled={pending} onClick={()=>{closeMore();setConfirm({kind:'reload'});}}>Reopen saved mapping</Button>
          {record&&<Button className="w-full justify-start text-red-800" variant="ghost" disabled={pending||archived} onClick={()=>{closeMore();setConfirm({kind:'reset'});}}>Reset mapping</Button>}
          {compatibility&&<details className="px-2"><summary className="flex cursor-pointer items-center text-sm">Template details</summary>{compatibility}</details>}
        </div>
      </details>
    </header>
    {archived&&<p className="shrink-0 text-sm">Archived template · Read-only</p>}
    {error&&!(compact&&panelOpen)&&<p role="alert" className="max-h-24 shrink-0 overflow-auto rounded-lg bg-white p-3 text-sm text-red-800">{error}</p>}
    {message&&<p role="status" className="shrink-0 text-sm text-[#1A4D2E]">{message}</p>}
    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-label="Workbook" className="flex min-h-0 min-w-0 flex-col gap-2 rounded-xl border border-[#E3E5E1] bg-white p-3">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs"><span>{anchor?'Select range end':selected?`${selected.sheet}!${selected.address}`:'Select a cell'}</span><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={rangeMode} onChange={e=>{setRangeMode(e.target.checked);setAnchor(null);}}/>Select range with two clicks</label></div>
        <TemplateViewer workspace id={template.id} metadata={template.workbook_metadata} onSelection={select} markers={[...mapped.map(m=>({...m.location,label:m.label})),...(selected?[{...selected,label:'Selected location'}]:[])]}/>
        <div className="flex shrink-0 gap-2 lg:hidden"><Button variant="secondary" className="flex-1" onClick={()=>openPanel('map')}>Map</Button><Button variant="ghost" className="flex-1" onClick={()=>openPanel('mapped')}>View mappings</Button></div>
      </section>
      <MappingPanel compact={compact} open={panelOpen} onClose={()=>setPanelOpen(false)}>
        {compact&&error&&<p role="alert" className="max-h-24 shrink-0 overflow-auto p-3 text-sm text-red-800">{error}</p>}
        {(!compact||panelView==='map')&&<AssignmentControls template={template} definition={definition} selected={selected} onLocation={location=>{setSelected(location);setAnchor(null);}} target={target} onTarget={setTarget} onAssign={assign} disabled={pending||archived}/>}
        {compact&&panelView==='map'?<Button variant="ghost" onClick={()=>setPanelView('mapped')}>View mappings</Button>:<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3" tabIndex={0} aria-label="Mapped fields" role="region">
          {review&&panelView==='review'&&<section className="mb-4 space-y-2 rounded-lg bg-[#F4F7F4] p-3 text-sm"><h2 className="!text-base">Review</h2><p>{mapped.length} mapped · {definition.periods.length} periods · {definition.subjects.length} subjects</p>{review.warnings.length?<details><summary className="cursor-pointer py-2">{review.warnings.length} optional omissions</summary><ul className="space-y-2">{review.warnings.map(w=><li key={w}>{w}</li>)}</ul></details>:<p>Ready to save</p>}</section>}
          <MappingFields definition={definition} disabled={pending||archived} onEdit={edit} onPick={(id,location)=>{setTarget(id);if(location)setSelected(location);openPanel('map');}} onRemove={(kind,key)=>setConfirm({kind,key})}/>
        </div>}
      </MappingPanel>
    </div>
    <ConfirmDialog open={confirm!==null} title={confirm?.kind==='reload'?'Reopen saved mapping?':confirm?.kind==='reset'?'Reset entire mapping?':'Remove this mapping item?'} description={confirm?.kind==='reload'?'Discard unsaved changes?':confirm?.kind==='reset'?'Delete this mapping? The original workbook stays unchanged.':'Remove this item and its mapped locations? Save to keep the change.'} confirmLabel={confirm?.kind==='reload'?'Reopen':confirm?.kind==='reset'?'Reset mapping':'Remove item'} destructive={confirm?.kind!=='reload'} pending={pending} onCancel={()=>setConfirm(null)} onConfirm={()=>void confirmAction()}/>
  </div>;
}
