'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/loading-state';
import { TemplateViewer } from '@/features/report-card-templates/viewer';
import { previewReportCard } from './actions';

export function ReportCardPreview({sectionId,templateId,learnerId,learnerName,digest,lrn,onClose}:{sectionId:string;templateId:string;learnerId:string;learnerName:string;digest:string;lrn?:string;onClose:()=>void}){
  const [controlsTarget,setControlsTarget]=useState<HTMLDivElement|null>(null);
  const ref=useRef<HTMLDialogElement>(null),title=useId();
  const [result,setResult]=useState<Awaited<ReturnType<typeof previewReportCard>>|null>(null),[attempt,setAttempt]=useState(0);
  const request=useCallback(async(sheet=0,row=1,column=1)=>previewReportCard({sectionId,templateId,learnerId,digest,...(lrn?{lrns:{[learnerId]:lrn}}:{}),sheet,row,column}),[sectionId,templateId,learnerId,digest,lrn]);
  useEffect(()=>{const element=ref.current;element?.showModal();return()=>element?.close();},[]);
  useEffect(()=>{let active=true;request().then(value=>{if(active)setResult(value);}).catch(()=>{if(active)setResult({ok:false,error:'Could not load this preview. Please retry.'});});return()=>{active=false;};},[request,attempt]);
  const loadSheet=useCallback(async(input:unknown)=>{const p=input as {sheet:number;row:number;column:number};if(result?.ok&&p.sheet===0&&p.row===1&&p.column===1)return {ok:true as const,data:result.data.preview};const response=await request(p.sheet,p.row,p.column);return response.ok?{ok:true as const,data:response.data.preview}:response;},[request,result]);
  return <dialog ref={ref} aria-labelledby={title} onCancel={event=>{event.preventDefault();onClose();}} style={{width:'100vw',height:'100dvh',maxWidth:'none',maxHeight:'none',margin:0,borderRadius:0}} className="fixed inset-0 border-0 bg-white p-0 text-[#1F2A22]">
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(160px,28%)]">
      <section aria-label="Report card worksheet" className="flex min-h-0 min-w-0 p-1">
        {!result?<LoadingState page label="Preparing preview..."/>:!result.ok?<div role="alert"><p>{result.error}</p><Button variant="secondary" onClick={()=>{setResult(null);setAttempt(n=>n+1);}}>Retry preview</Button></div>:<TemplateViewer id={templateId} metadata={result.data.metadata} loadSheet={loadSheet} controlsTarget={controlsTarget} workspace/>}
      </section>
      <aside aria-label="Report card controls" className="min-h-0 min-w-0 space-y-4 overflow-y-auto border-l border-[#E3E5E1] p-3">
        <Button variant="secondary" onClick={onClose}>Close preview</Button>
        <div><h2 id={title}>Report card preview</h2><p className="text-sm break-words">{learnerName}</p></div>
        <Link className="tc-button tc-secondary" href={`/report-cards/templates/${templateId}/mapping`}>Map missing fields</Link>
        <div ref={setControlsTarget}/>
        <details className="text-xs text-[#606861]"><summary className="cursor-pointer py-2">About this preview</summary><p>Read-only preview of the filled workbook. Missing data stays blank. Poppins is used here; embedded images and charts are not displayed. Excel formulas are not recalculated. Formula replacements shown here still require confirmation before download.</p></details>
      </aside>
    </div>
  </dialog>;
}
