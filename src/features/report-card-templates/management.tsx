'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { updateTemplate, deleteTemplate } from './actions';
import { templateInput } from './upload-form';
import type { Template } from './model';
export function TemplateManagement({template}:{template:Template}){
  const [rename,setRename]=useState(false),[name,setName]=useState(template.name),[error,setError]=useState(''),[confirm,setConfirm]=useState<'archive'|'delete'|null>(null);
  const [pending,start]=useTransition(),lock=useRef(false),router=useRouter();
  function save(kind:'rename'|'archive'|'delete'){
    if(lock.current)return;lock.current=true;setError('');
    start(async()=>{try{const result=kind==='delete'?await deleteTemplate(template.id):await updateTemplate(kind==='rename'?{id:template.id,name}:{id:template.id,status:template.status==='active'?'archived':'active'});
      if(!result.ok)setError(result.error);else if(kind==='delete'){router.push('/report-cards/templates');router.refresh();}else{setRename(false);router.refresh();}
    }catch{setError('Could not complete this change. Please try again.');}finally{lock.current=false;setConfirm(null);}});
  }
  return <div className="space-y-3">{error&&<p role="alert" className="text-red-800 text-sm">{error}</p>}
    <div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={pending} onClick={()=>setRename(!rename)}>Rename</Button><a className="tc-button tc-secondary" href={`/api/report-card-templates/${template.id}/download`}>Download original</a></div>
    {rename&&<form className="max-w-xl space-y-3" onSubmit={e=>{e.preventDefault();save('rename');}}><label className="block text-sm">Template name<input className={templateInput} value={name} required maxLength={160} disabled={pending} onChange={e=>setName(e.target.value)}/></label><div className="flex flex-wrap gap-3"><Button disabled={pending} type="submit">{pending?'Saving…':'Save name'}</Button><Button type="button" variant="secondary" disabled={pending} onClick={()=>setRename(false)}>Cancel rename</Button></div></form>}
    <details className="tc-group px-4"><summary className="min-h-11 cursor-pointer py-3 font-medium">More template actions</summary><div className="flex flex-wrap gap-3 pb-4"><Button variant="secondary" disabled={pending} onClick={()=>setConfirm('archive')}>{template.status==='active'?'Archive template':'Reactivate template'}</Button><Button variant="ghost" disabled={pending} className="tc-danger" onClick={()=>setConfirm('delete')}>Delete template</Button></div></details>
    <ConfirmDialog open={confirm!==null} title={confirm==='delete'?`Delete '${template.name}'?`:`${template.status==='active'?'Archive':'Reactivate'} this template?`} description={confirm==='delete'?'This permanently removes this uploaded template and its saved mapping from TeacherCo. It will not affect your Sections, Classes or Grade Book.':'The original workbook stays unchanged and remains available to view and download.'} destructive={confirm==='delete'} pending={pending} confirmLabel={confirm==='delete'?'Delete template':template.status==='active'?'Archive template':'Reactivate template'} onCancel={()=>setConfirm(null)} onConfirm={()=>save(confirm==='delete'?'delete':'archive')}/>
  </div>;
}
