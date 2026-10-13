import { activeTeacher } from './offline-attendance.js';

// Only these fields can be changed by the offline editor. Everything else stays on the server.
export const fields = {
  classes: ['id','teacher_id','name','subject','grade_level','school_year','status'],
  learners: ['id','teacher_id','first_name','last_name','display_name'],
  class_enrollments: ['id','class_id','learner_id','status'],
  assessments: ['id','class_id','title','activity_slot','term','component','total_points','source','status'],
  submissions: ['id','assessment_id','learner_id','score','max_score','review_status'],
  sections: ['id','teacher_id','name','grade_level','school_year','status'],
  section_enrollments: ['id','teacher_id','section_id','learner_id','status'],
  section_subjects: ['id','teacher_id','section_id','name','position','status'],
  section_grade_periods: ['id','teacher_id','section_id','key','label','position','status'],
  section_grade_entries: ['id','teacher_id','section_id','learner_id','section_subject_id','period_id','grade','source_type'],
};
export const tables = [...Object.keys(fields), 'class_grading_config', 'teacher_term_grades', 'attendance_entries'];
export const project = (table, row) => row == null ? null : Object.fromEntries(fields[table].map(key => [key, row[key] ?? null]));
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const empty = owner => ({version:1,owner,revision:null,rows:Object.fromEntries(tables.map(t=>[t,[]])),queue:[],preparedAt:null,syncMessage:'',reportCards:{}});
function checkOwner(owner) {
  if (!owner || activeTeacher() !== owner) throw new Error('Sign in to the same teacher account before opening these records.');
}
function transaction(owner, write, change) {
  checkOwner(owner);
  return new Promise((resolve,reject) => {
    const opening = indexedDB.open('teacherco-records',1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('accounts',{keyPath:'owner'});
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db=opening.result, tx=db.transaction('accounts',write?'readwrite':'readonly'), store=tx.objectStore('accounts');
      let result, failure;
      const request=store.get(owner);
      request.onsuccess=()=>{
        try { checkOwner(owner); const state=request.result??empty(owner); result=change(state); if(write){state.revision=crypto.randomUUID();store.put(state);} }
        catch(error){failure=error;tx.abort();}
      };
      tx.oncomplete=()=>{db.close();if(write)window.dispatchEvent(new Event('offline-records-change'));resolve(result);};
      tx.onabort=tx.onerror=()=>{db.close();reject(failure??tx.error??new Error('Device storage is unavailable.'));};
    };
  });
}
export const readRecords = owner => transaction(owner,false,state=>state);
export function saveReportPackage(owner,pack){
  if(pack?.version!==1||pack.owner!==owner||!pack.sectionId||!pack.templateId||typeof pack.workbook!=='string'||pack.workbook.length>17*1024*1024||!Array.isArray(pack.printSheets))throw new Error('Invalid offline report-card package.');
  return transaction(owner,true,state=>{state.reportCards??={};state.reportCards[`${pack.sectionId}:${pack.templateId}`]=pack;});
}
export function removeReportPackage(owner,key){return transaction(owner,true,state=>{if(state.reportCards)delete state.reportCards[key];});}

// Multiple related edits are saved together, or none of them are saved.
export function saveRecords(owner, edits) {
  return transaction(owner,true,state=>{
    for(const {table,row,before} of edits){
      if(!Object.hasOwn(fields,table) || !row.id)throw new Error('Invalid offline record.');
      const previous=state.rows[table].find(r=>r.id===row.id)??null;
      if(!same(project(table,previous),project(table,before)))throw new Error('This record changed in another tab. Reopen it before saving.');
      const value=project(table,row);
      if(same(project(table,previous),value))continue;
      state.queue.push({id:crypto.randomUUID(),table,row:value,before:project(table,previous),savedAt:new Date().toISOString()});
      state.rows[table]=[...state.rows[table].filter(r=>r.id!==row.id),{...previous,...value}];
    }
  });
}
let syncing;
export function syncRecords(owner) {
  if(syncing)return syncing;
  const run=async()=>{
    while(navigator.onLine && activeTeacher()===owner){
      const state=await readRecords(owner), operation=state.queue[0];
      if(!operation || operation.error)return;
      let response, result;
      try {
        response=await fetch('/api/offline/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner,...operation}),signal:AbortSignal.timeout(30000)});
        result=await response.json();
      }catch{
        await transaction(owner,true,current=>{current.syncMessage='Connection unavailable. Your changes are saved on this device.';});
        return;
      }
      checkOwner(owner);
      if(response.status===401 || response.status===403 || response.status>=500){
        await transaction(owner,true,current=>{current.syncMessage=response.status<500?'Sign in online to the same teacher account to continue syncing.':result.error??'Sync is temporarily unavailable. Your device saves are safe.';});
        return;
      }
      await transaction(owner,true,current=>{
        if(current.queue[0]?.id!==operation.id)return;
        current.syncMessage='';
        if(!response.ok){current.queue[0]={...operation,error:result.error??'Review this change before syncing.',conflict:result.current??null};return;}
        current.queue.shift();
        // Later local edits must survive an upload finishing in the background.
        if(!current.queue.some(op=>op.table===operation.table && op.row.id===operation.row.id)){
          current.rows[operation.table]=current.rows[operation.table].flatMap(row=>row.id===operation.row.id?(result.row?[result.row]:[]):[row]);
        }
      });
      if(!response.ok)return;
    }
  };
  syncing=(navigator.locks?navigator.locks.request('teacherco-records-sync',run):run()).finally(()=>{syncing=null;});
  return syncing;
}
let preparing;
const prepared=new Map();
export function prepareRecords(owner,force=false) {
  if(preparing)return preparing;
  if(!navigator.onLine || activeTeacher()!==owner || (!force && Date.now()-(prepared.get(owner)??0)<300000))return Promise.resolve();
  preparing=(async()=>{
    const initial=await readRecords(owner);
    if(initial.queue.length)return;
    const rows={};
    for(const table of tables){
      rows[table]=[];
      for(let offset=0;;){
        const response=await fetch(`/api/offline/records?table=${table}&offset=${offset}`,{cache:'no-store',signal:AbortSignal.timeout(30000)});
        const result=await response.json();checkOwner(owner);
        if(!response.ok || result.owner!==owner || !Array.isArray(result.rows))throw new Error('Could not refresh offline records. Your device saves are safe.');
        rows[table].push(...result.rows);
        if(result.nextOffset===null)break;
        if(!Number.isSafeInteger(result.nextOffset) || result.nextOffset<=offset)throw new Error('Invalid offline page.');
        offset=result.nextOffset;
      }
    }
    const applied=await transaction(owner,true,state=>{
      // A refresh that began before a local edit must not roll it back, even if
      // another tab has already finished uploading that edit.
      if(state.queue.length || state.revision!==initial.revision)return false;
      state.rows=rows;state.preparedAt=new Date().toISOString();return true;
    });
    if(applied)prepared.set(owner,Date.now());
  })().finally(()=>{preparing=null;});
  return preparing;
}
export function resolveRecord(owner,id,keepDevice) {
  return transaction(owner,true,state=>{
    const op=state.queue[0];
    if(op?.id!==id || !op.error)throw new Error('This conflict has changed. Refresh the list.');
    if(keepDevice){op.before=project(op.table,op.conflict);op.id=crypto.randomUUID();delete op.error;delete op.conflict;}
    else {
      // Discard only this change. Rebase the next edit to the same row for explicit review.
      state.queue.shift();
      const next=state.queue.find(x=>x.table===op.table && x.row.id===op.row.id);
      if(next){next.error='An earlier change was discarded. Review this later edit too.';next.conflict=op.conflict;}
      else state.rows[op.table]=[...state.rows[op.table].filter(r=>r.id!==op.row.id),...(op.conflict?[op.conflict]:[])];
    }
  });
}
export function clearRecords(owner,all=false) {
  if(!owner)return Promise.resolve();
  return transaction(owner,true,state=>{if(all || !state.queue.length)Object.assign(state,empty(owner));});
}
export async function exportRecords(owner) {return JSON.stringify({format:'teacherco-offline',...(await readRecords(owner))},null,2);}
export function restoreRecords(owner,backup) {
  if(backup?.format!=='teacherco-offline' || backup.version!==1 || backup.owner!==owner || !Array.isArray(backup.queue) || backup.queue.length>100000)throw new Error('Choose a TeacherCo backup from this teacher account.');
  const uuid=value=>typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  const validRow=(table,row)=>row && typeof row==='object' && !Array.isArray(row) && uuid(row[table==='class_grading_config'?'class_id':'id']) && (!row.teacher_id || row.teacher_id===owner);
  for(const t of tables)if(!Array.isArray(backup.rows?.[t]) || !backup.rows[t].every(row=>validRow(t,row)))throw new Error('Incomplete or invalid backup records.');
  for(const op of backup.queue)if(!Object.hasOwn(fields,op.table) || !uuid(op.id) || !validRow(op.table,op.row) || (op.before!==null&&!validRow(op.table,op.before)))throw new Error('Invalid backup change.');
  const reportCards=backup.reportCards??{};
  if(typeof reportCards!=='object'||Array.isArray(reportCards)||Object.entries(reportCards).some(([key,p])=>!p||p.version!==1||p.owner!==owner||!uuid(p.sectionId)||!uuid(p.templateId)||key!==`${p.sectionId}:${p.templateId}`||typeof p.workbook!=='string'||p.workbook.length>17*1024*1024||!Array.isArray(p.printSheets)||!p.snapshot||p.snapshot.section?.teacher_id!==owner||p.snapshot.template?.teacher_id!==owner))throw new Error('Invalid report-card backup.');
  return transaction(owner,true,state=>{
    if(state.queue.length)throw new Error('Sync or review current device changes before restoring a backup.');
    Object.assign(state,{version:1,owner,rows:backup.rows,queue:backup.queue,preparedAt:backup.preparedAt,reportCards});
  });
}
