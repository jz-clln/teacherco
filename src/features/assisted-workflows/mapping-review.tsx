'use client';
import { useEffect,useRef,useState,useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { analyzeTemplate } from './mapping-actions';
import { saveMapping } from '@/features/report-card-mappings/actions';
import { FIELD_LABELS,type MappingRecord } from '@/features/report-card-mappings/model';
import { columnLetter } from '@/features/report-card-templates/model';
type Analysis=Extract<Awaited<ReturnType<typeof analyzeTemplate>>,{ok:true}>['data'];
export function MappingReview({id,name,initial,auto=false}:{id:string;name:string;initial:MappingRecord|null;auto?:boolean}){
  const [showIssues,setShowIssues]=useState(false);
  const [analysis,setAnalysis]=useState<Analysis|null>(null),[confirmed,setConfirmed]=useState<string[]>([]),[error,setError]=useState(''),[pending,start]=useTransition(),lock=useRef(false),router=useRouter();
  const [autoBusy,setAutoBusy]=useState(auto),automatic=useRef<ReturnType<typeof analyzeTemplate>|null>(null);
  useEffect(()=>{if(!auto)return;let alive=true;automatic.current??=analyzeTemplate(id);void automatic.current.then(r=>{if(!alive)return;if(r.ok)setAnalysis(r.data);else setError(r.error);setAutoBusy(false);}).catch(()=>{if(alive){setError('Analysis unavailable. Edit manually or retry.');setAutoBusy(false);}});return()=>{alive=false;};},[auto,id]);
  function run(work:()=>Promise<void>){if(lock.current)return;lock.current=true;start(async()=>{try{setError('');await work();}catch{setError('Could not complete this action. Please retry.');}finally{lock.current=false;}});}
  function handoff(){try{if(analysis)sessionStorage.setItem(`mapping-proposal:${id}`,JSON.stringify({definition:analysis.definition,expectedId:initial?.id??null,revision:initial?.revision??0}));}catch{setError('Could not retain the proposal in this browser.');}}
  const remaining=analysis?.issues.filter(i=>!confirmed.includes(i))??[];
  return <div className="min-w-0 w-full space-y-5"><header><h1>{name}</h1><p className="mt-2 text-sm">{initial?'Reviewed mapping available':'Find report-card fields'}</p></header>
    {error&&<p role="alert" className="text-red-800">{error}</p>}
    {!analysis?<Button disabled={pending||autoBusy} onClick={()=>run(async()=>{const r=await analyzeTemplate(id);if(r.ok){setAnalysis(r.data);setConfirmed([]);}else setError(r.error);})}>{pending||autoBusy?'Analyzing…':'Analyze template'}</Button>:<>
      <section className="tc-group p-4 space-y-2"><h2>Template analyzed</h2><p>{Object.keys(analysis.definition.fields).length} learner fields · {analysis.definition.subjects.length} subjects · {analysis.definition.periods.length} periods</p>{analysis.source==='local'&&<p className="text-sm">Local suggestions · review before saving</p>}<p role="status">{remaining.length?`${remaining.length} things need attention`:'Template ready'}</p></section>
      {remaining.length>0&&<Button variant="secondary" onClick={()=>setShowIssues(!showIssues)}>Review {remaining.length} {remaining.length===1?'issue':'issues'}</Button>}
      {showIssues&&remaining.length>0&&<section className="tc-group divide-y divide-[#E3E5E1]">{analysis.issues.map(issue=>{const [kind,key]=issue.split(':');if(confirmed.includes(issue))return null;const field=analysis.definition.fields[key as keyof typeof FIELD_LABELS];return <div key={issue} className="p-3 space-y-2"><h3>{kind==='field'?FIELD_LABELS[key as keyof typeof FIELD_LABELS]:issue==='table'?'Grade table':`Choose ${FIELD_LABELS[key as keyof typeof FIELD_LABELS]??'grade table'}`}</h3>{field&&<p>{field.sheet}!{field.address}</p>}{issue==='table'&&analysis.proposal.tables.map((t,i)=><div key={i} className="text-sm space-y-1"><p>Rows {t.startRow}–{t.endRow} · Subjects: column {columnLetter(t.subjectColumn)}</p>{t.outputs.map(o=><p key={o.key}>{analysis.definition.periods.find(p=>p.key===o.key)?.label??o.key.replace('_',' ')}: column {columnLetter(o.column)}</p>)}</div>)}<div className="flex flex-wrap gap-2">{kind!=='missing'&&<Button variant="secondary" onClick={()=>setConfirmed([...confirmed,issue])}>Looks right</Button>}<Link className="tc-button tc-quiet" onClick={handoff} href={`/report-cards/templates/${id}/mapping`}>Choose another cell</Link>{kind==='missing'&&<Button variant="ghost" onClick={()=>setConfirmed([...confirmed,issue])}>Leave unmapped</Button>}</div></div>;})}</section>}
      <Button disabled={pending||remaining.length>0||(!analysis.definition.subjects.length&&!Object.keys(analysis.definition.fields).length)} onClick={()=>run(async()=>{const r=await saveMapping({templateId:id,expectedId:initial?.id??null,revision:initial?.revision??0,definition:analysis.definition,status:'reviewed'});if(r.ok){router.push(`/report-cards/templates/${id}`);router.refresh();}else setError(r.error);})}>{pending?'Saving…':'Save mapping'}</Button>
    </>}
    <details><summary className="tc-button tc-quiet cursor-pointer">More</summary><Link className="tc-button tc-quiet" onClick={handoff} href={`/report-cards/templates/${id}/mapping`}>Edit manually</Link></details>
  </div>;
}
