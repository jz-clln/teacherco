'use client';
import {useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {activeTeacher} from '../../../public/offline-attendance.js';
import {prepareRecords,readRecords,saveReportPackage} from '../../../public/offline-records.js';
export function SaveOfflineReport({sectionId,templateId,disabled=false}:{sectionId:string;templateId:string;disabled?:boolean}){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');const lock=useRef(false);
  async function save(){
    if(lock.current)return;lock.current=true;setBusy(true);setMessage('');
    try{
      const owner=activeTeacher();if(!owner)throw new Error('Sign in again before preparing this device.');
      const response=await fetch('/api/offline/report-cards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sectionId,templateId}),cache:'no-store'});
      const data=await response.json();if(!response.ok)throw new Error(data.error??'Could not prepare this report card.');
      await prepareRecords(owner,true);
      const records=await readRecords(owner);
      if(!records.rows.sections.some(section=>section.id===sectionId))throw new Error('Sync your pending device changes and download this Section before saving its report card for offline use.');
      await saveReportPackage(owner,data);
      setMessage('Template and matches saved on this device. Open Offline workspace → Report cards to generate and print without internet. Refresh this copy after changing mappings online.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not save this report card on the device.');}
    finally{lock.current=false;setBusy(false);}
  }
  return <div className="space-y-2"><Button variant="secondary" disabled={disabled||busy} onClick={()=>void save()}>{busy?'Preparing offline copy…':'Save for offline'}</Button>{message&&<p role="status" className="text-sm text-[#606861]">{message}</p>}</div>;
}
