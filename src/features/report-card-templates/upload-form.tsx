'use client';
import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { prepareTemplateUpload, finishTemplateUpload, cancelTemplateUpload } from './actions';
import { fileValidation, TEMPLATE_BUCKET, XLSX_MIME } from './model';
export const templateInput='mt-1 w-full min-h-11 rounded-lg border border-[#E3E5E1] bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#1A4D2E]';
export function TemplateUploadForm(){
  const [name,setName]=useState(''),[file,setFile]=useState<File|null>(null),[error,setError]=useState(''),[phase,setPhase]=useState(''),[existing,setExisting]=useState<{id:string;name:string}|null>(null);
  const [pending,start]=useTransition(),lock=useRef(false),attempt=useRef<{id:string;path:string;uploaded:boolean}|null>(null),router=useRouter();
  function upload(){
    if(lock.current)return;if(!file){setError('Choose a blank Excel workbook.');return;}
    const invalid=fileValidation(file.name,file.size,file.type);if(invalid){setError(invalid);return;}
    lock.current=true;setError('');setExisting(null);
    start(async()=>{try{
      if(!attempt.current){setPhase('Preparing upload…');const prepared=await prepareTemplateUpload({filename:file.name,size:file.size,mime:file.type});if(!prepared.ok){setError(prepared.error);return;}attempt.current={...prepared.data,uploaded:false};}
      const current=attempt.current;
      if(!current.uploaded){setPhase('Uploading template…');const uploaded=await createClient().storage.from(TEMPLATE_BUCKET).upload(current.path,file,{contentType:XLSX_MIME,cacheControl:'0',upsert:false});
        // A response lost after a successful upload can be safely finalized at
        // the same immutable path. The server reads and validates actual bytes.
        if(uploaded.error&&!['409','Duplicate'].includes(String(uploaded.error.statusCode))){setError('The upload was interrupted. Check your connection and try again.');return;}current.uploaded=true;}
      setPhase('Checking workbook…');const saved=await finishTemplateUpload({id:current.id,name,filename:file.name});
      if(!saved.ok){setError(saved.error);setExisting(saved.existing??null);if(saved.existing)attempt.current=null;else current.uploaded=false;return;}
      attempt.current=null;router.push(`/report-cards/templates/${saved.data.id}`);router.refresh();
    }catch{setError('The upload could not finish. Please try again.');}finally{lock.current=false;setPhase('');}});
  }
  async function clearAttempt(){const current=attempt.current;if(current){try{const result=await cancelTemplateUpload(current.id);if(!result.ok){setError(result.error);return false;}}catch{setError('Temporary-file cleanup could not finish. Please retry cancellation.');return false;}}attempt.current=null;return true;}
  return <form onSubmit={e=>{e.preventDefault();upload();}} className="max-w-2xl space-y-5">
    <p className="text-sm leading-6 text-[#606861]">Upload a blank Excel report-card template from your school. Do not upload a completed learner report card.</p>
    <fieldset disabled={pending} className="tc-group p-5 space-y-5 min-w-0">
      <label className="block text-sm font-medium">Template name<input required maxLength={160} className={templateInput} value={name} onChange={e=>setName(e.target.value)}/></label>
      <label className="block text-sm font-medium">Excel workbook<input type="file" accept=".xlsx" className={`${templateInput} file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-[#F5EFE6] file:px-3`} onChange={async e=>{const chosen=e.target.files?.[0]??null;if(await clearAttempt()){setFile(chosen);setError('');setExisting(null);}}}/></label>
      <p className="text-sm text-[#606861]">Excel .xlsx only · Maximum 10 MB. Workbook and worksheet editing protection is supported. Encrypted and macro-enabled files are not supported. Your original workbook is preserved exactly as uploaded.</p>
    </fieldset>
    {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}
    {existing&&<Link className="tc-button tc-secondary" href={`/report-cards/templates/${existing.id}`}>View existing template</Link>}
    {pending&&<p role="status" className="text-sm text-[#4F6F52]">{phase||'Opening template…'}</p>}
    <div className="flex flex-wrap gap-3"><Button type="submit" disabled={pending}>{pending?'Uploading template…':'Upload template'}</Button><Button type="button" variant="secondary" disabled={pending} onClick={async()=>{if(await clearAttempt())router.push('/report-cards/templates');}}>Cancel</Button></div>
  </form>;
}
