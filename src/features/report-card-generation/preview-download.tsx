'use client';
import {useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {receiveDownload} from './download-response';
export type PreviewDownloadDetails={sectionId:string;templateId:string;learnerId:string;digest:string;profileId:string;profileRevision:number;lrn?:string;formulaTargets:string[]};
export function PreviewDownload({details,disabled}:{details:PreviewDownloadDetails;disabled:boolean}){
  const [open,setOpen]=useState(false),[confirmed,setConfirmed]=useState(false),[formulas,setFormulas]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const lock=useRef(false);
  async function download(){
    if(lock.current||!confirmed||(details.formulaTargets.length&&!formulas))return;
    lock.current=true;setBusy(true);setError('');
    try{
      const {lrn,formulaTargets:_,...identity}=details;void _;
      const response=await fetch(`/api/sections/${details.sectionId}/report-cards/generate`,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({...identity,...(lrn?{lrns:{[details.learnerId]:lrn}}:{}),confirmed:true,replaceFormulas:formulas})});
      if(!response.ok){const body=await response.json();throw new Error(body.error||'Could not download the report card.');}
      const {blob,filename}=await receiveDownload(response,`/api/sections/${details.sectionId}/report-cards/cleanup`);
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setOpen(false);setConfirmed(false);setFormulas(false);
    }catch(error){setError(error instanceof Error?error.message:'Could not download the report card.');}
    finally{lock.current=false;setBusy(false);}
  }
  return <>
    <Button variant="secondary" disabled={disabled||busy} aria-expanded={open} onClick={()=>{setOpen(v=>!v);setError('');}}>Download</Button>
    {open&&<div className="order-last w-full space-y-3 rounded-lg border border-[#E3E5E1] bg-[#F7F9F6] p-3 text-sm">
      <p>Download this learner&apos;s filled report card as an Excel file.</p>
      <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed the grades and accept any missing values shown.</label>
      {details.formulaTargets.length>0&&<><p>Mapped formulas will be replaced: {details.formulaTargets.join(', ')}</p><label className="flex items-start gap-2"><input type="checkbox" className="mt-1" disabled={busy} checked={formulas} onChange={e=>setFormulas(e.target.checked)}/>I confirm replacing these mapped formulas.</label></>}
      {error&&<p role="alert" className="text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={disabled||busy||!confirmed||!!details.formulaTargets.length&&!formulas} onClick={()=>void download()}>Download Excel</Button><Button variant="secondary" disabled={busy} onClick={()=>setOpen(false)}>Cancel</Button></div>
    </div>}
  </>;
}
