import {syncRecords} from './offline-records.js';
import {activeTeacher,listDays,readDay,queueDay,syncAttendance,resolveDay,prepareAttendance} from './offline-attendance.js';
const owner=activeTeacher(),root=document.querySelector('#attendance');
let current,marks={},dirty=false,busy=false,renderVersion=0;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function el(tag,text,parent=root){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;parent.append(node);return node;}
function status(text){document.querySelector('#status').textContent=text;}
async function showClasses(){
  const version=++renderVersion;
  if(!owner||activeTeacher()!==owner){el('p','Sign in online to access your attendance on this device.');return;}
  const days=await listDays(owner),classes=new Map();
  if(version!==renderVersion)return;
  root.replaceChildren();
  for(const day of days.sort((a,b)=>(a.cachedAt||'').localeCompare(b.cachedAt||'')))classes.set(day.classId,day);
  if(!classes.size){el('p',navigator.onLine?'Preparing your classes. Use Refresh classes if they do not appear.':'No classes are saved on this device yet. Connect to prepare your classes.');return;}
  el('h2','Take attendance');
  const grid=el('div');grid.className='class-grid';
  for(const day of [...classes.values()].sort((a,b)=>a.className.localeCompare(b.className)||a.subject.localeCompare(b.subject))){
    const button=el('button',undefined,grid);button.className='class-choice';button.setAttribute('aria-label',`${day.className} · ${day.subject}`);
    const text=el('span',undefined,button);el('span',day.subject,text).className='class-name';el('span',`${day.className} · ${day.learners.length} learners`,text).className='class-meta';el('span','›',button).className='class-arrow';button.onclick=()=>openDay(day,today());
  }
  const pending=days.filter(d=>d.pending);
  el('div',pending.length?`${pending.length} attendance day${pending.length===1?'':'s'} waiting to sync`:'All saved attendance is synced').className='sync-summary';
  const pendingList=el('div');pendingList.className='pending-list';
  for(const day of pending){const button=el('button',`${day.className} · ${day.subject} · ${day.date}${day.error?' · Needs review':''}`,pendingList);button.className='class-choice';button.onclick=()=>openDay(day,day.date);}
}
async function openDay(roster,date){
  if(busy)return;
  if(dirty&&!confirm('Leave without saving these attendance changes?'))return;
  ++renderVersion;
  current=await readDay(owner,roster.classId,date)||{...roster,date,marks:{},baseline:{},pending:false,error:'',updatedAt:null};
  marks=Object.fromEntries(current.learners.map(l=>[l.id,current.marks[l.id]||'present']));dirty=false;renderDay();
}
function renderDay(){
  root.replaceChildren();
  const back=el('button','← Classes');back.className='secondary';back.onclick=()=>{if(!dirty||confirm('Leave without saving?')){dirty=false;current=null;void showClasses();}};
  el('h2',`${current.className} · ${current.subject}`);
  const label=el('label','Attendance date'),date=el('input',undefined,label);date.type='date';date.value=current.date;date.max=today();date.onchange=()=>{if(date.value&&date.value<=today())void openDay(current,date.value);};
  if(current.error)el('p',current.error).className='error';
  if(current.error){
    const link=el('a','View attendance saved online');link.href=`/classes/${current.classId}/attendance?date=${current.date}`;
    el('p','Your device marks remain below. Compare them with the online record before deciding which to keep.');
    const review=el('button','Review sync conflict');review.onclick=async()=>{
      review.disabled=true;
      try{
        const response=await fetch(`/api/attendance/sync?classId=${current.classId}&date=${current.date}`,{cache:'no-store'}),data=await response.json();
        if(!response.ok||data.owner!==owner)throw new Error(data.error||'Sign in to the original account.');
        const panel=el('section');el('h2','Compare attendance',panel);
        for(const learner of current.learners)el('p',`${learner.name}: device ${current.marks[learner.id]||'not taken'} · online ${data.marks[learner.id]||'not taken'}`,panel);
        for(const useDevice of [true,false]){
          const choice=el('button',useDevice?'Use device marks':'Keep online marks',panel);
          choice.onclick=async()=>{
            if(!confirm(useDevice?'Replace the online attendance with these device marks?':'Discard these device marks and keep the online attendance?'))return;
            try{const resolved=await resolveDay(current,data.marks,useDevice);if(!resolved)throw new Error('Device attendance changed. Open it again to review.');current=resolved;dirty=false;await syncRecords(owner);await syncAttendance(owner);await openDay(current,current.date);status('Your choice was saved.');}catch(error){status(error.message);}
          };
        }
      }catch(error){status(error.message);}finally{review.disabled=false;}
    };
  }
  el('p','Using the class roster saved on this device.');
  for(const learner of current.learners){
    const row=el('label',learner.name);row.className='learner';
    const select=el('select',undefined,row);
    for(const value of ['present','absent','late','excused']){const option=el('option',value[0].toUpperCase()+value.slice(1),select);option.value=value;}
    select.value=marks[learner.id];select.onchange=()=>{marks[learner.id]=select.value;dirty=true;};
  }
  const save=el('button','Save attendance on device');save.onclick=async()=>{
    save.disabled=true;busy=true;
    try{current=await queueDay(current,marks);dirty=false;status('Saved on this device. Waiting to sync.');await syncRecords(owner);await syncAttendance(owner);current=await readDay(owner,current.classId,current.date);status(current.error||(current.pending?'Saved on device. Will sync when connected.':'Attendance synced to your account.'));}
    catch{status('Could not save. Keep this page open and try again.');}finally{busy=false;save.disabled=false;}
  };
}
async function sync(){
  if(!owner||activeTeacher()!==owner){root.replaceChildren();current=null;dirty=false;status('Sign in online to access attendance for your account.');return;}
  try{await syncRecords(owner);await syncAttendance(owner);await prepareAttendance(owner);if(!current&&!dirty)await showClasses();}catch(error){status(error.message||'Could not refresh classes. Your device saves are kept.');}
}
function connection(){document.querySelector('#connection').textContent=navigator.onLine?'Online':'Offline';document.querySelector('#refresh-classes').disabled=!navigator.onLine;}
connection();window.addEventListener('online',connection);window.addEventListener('offline',connection);
document.querySelector('#refresh-classes').onclick=async()=>{const button=document.querySelector('#refresh-classes');button.disabled=true;try{await prepareAttendance(owner,true);if(!current&&!dirty)await showClasses();status('Your offline classes are up to date.');}catch(error){status(error.message);}finally{connection();}};
window.addEventListener('online',sync);window.addEventListener('focus',sync);setInterval(sync,30000);
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
(async()=>{const params=new URL(location.href).searchParams,days=await listDays(owner),roster=days.find(d=>d.classId===params.get('classId')),date=params.get('date');if(roster&&/^\d{4}-\d{2}-\d{2}$/.test(date||'')&&date<=today())await openDay(roster,date);else await showClasses();})().catch(()=>status('Device storage is unavailable in this browser.'));
void sync();
