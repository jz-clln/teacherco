import {assertDeviceWrite,deviceCanWrite} from './offline-access.js';
// Shared by the online app and the public offline shell. No credentials are stored here.
const DB = 'teacherco-attendance';
export function activeTeacher() {
  return document.cookie.split('; ').find(v => v.startsWith('teacherco_offline_owner='))?.split('=')[1] || '';
}
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('days', {keyPath: 'key'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function key(owner, classId, date) { return `${owner}:${classId}:${date}`; }
async function transaction(write, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('days', write ? 'readwrite' : 'readonly');
      let value;
      tx.oncomplete = () => { if(write)window.dispatchEvent(new Event('attendance-cache-change')); resolve(value); };
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('Device storage unavailable.'));
      fn(tx.objectStore('days'), result => { value = result; });
    });
  } finally { db.close(); }
}
export async function listDays(owner) {
  return transaction(false, (store, done) => { store.getAll().onsuccess = e => done(e.target.result.filter(row => row.owner === owner)); });
}
export async function readDay(owner, classId, date) {
  return transaction(false, (store, done) => { store.get(key(owner,classId,date)).onsuccess = e => done(e.target.result); });
}
export async function cacheDay(day, updateRoster=false) {
  return transaction(true, (store, done) => {
    const id = key(day.owner,day.classId,day.date);
    store.get(id).onsuccess = e => {
      const previous = e.target.result;
      // A server refresh must never replace work waiting on this device.
      if (previous?.pending) {
        if(updateRoster && JSON.stringify(previous.learners)!==JSON.stringify(day.learners)){
          const next={...previous,learners:day.learners,revision:crypto.randomUUID()};store.put(next);done(next);
        }else done(previous);
        return;
      }
      // Background roster refreshes must not invalidate an unchanged open form.
      if(previous&&JSON.stringify(previous.marks)===JSON.stringify(day.marks)&&JSON.stringify(previous.learners)===JSON.stringify(day.learners)&&previous.className===day.className&&previous.subject===day.subject){done(previous);return;}
      const next = {...day,key:id,cachedAt:new Date().toISOString(),pending:false,error:'',revision:crypto.randomUUID()};
      store.put(next); done(next);
    };
  });
}
export async function queueDay(day, marks) {
  assertDeviceWrite(day.owner);
  if (!day.owner || activeTeacher() !== day.owner) throw new Error('Sign in again before saving attendance on this device.');
  const result=await transaction(true, (store, done) => {
    const id=key(day.owner,day.classId,day.date);
    store.get(id).onsuccess=e=>{
      const previous=e.target.result;
      if(previous&&previous.revision!==day.revision){done(null);return;}
      const next={...day,key:id,baseline:previous?.baseline??day.baseline,marks,pending:true,error:'',savedAt:new Date().toISOString(),revision:crypto.randomUUID()};
      store.put(next);done(next);
    };
  });
  if(!result)throw new Error('Attendance changed in another tab. Reopen this day before saving.');
  return result;
}
let preparing;
const prepared=new Map();
export function prepareAttendance(owner,force=false){
  if(preparing)return preparing;
  if(!navigator.onLine||!owner||activeTeacher()!==owner)return Promise.resolve();
  if(!force&&Date.now()-(prepared.get(owner)||0)<300000)return Promise.resolve();
  preparing=(async()=>{
    let offset=0;
    while(offset!==null){
      const response=await fetch(`/api/attendance/offline?offset=${offset}`,{cache:'no-store',signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw new Error('Could not refresh offline classes. Your saved classes are still available.');
      const result=await response.json();
      if(result.owner!==owner||activeTeacher()!==owner)throw new Error('Sign in to the original account.');
      for(const day of result.days){if(day.owner!==owner)throw new Error('Invalid class owner.');await cacheDay(day);}
      if(result.nextOffset!==null&&(!Number.isSafeInteger(result.nextOffset)||result.nextOffset<=offset))throw new Error('Could not finish preparing classes.');
      offset=result.nextOffset;
    }
    prepared.set(owner,Date.now());
  })().finally(()=>{preparing=undefined;});
  return preparing;
}
export async function clearDays(owner, all=false, classId) {
  return transaction(true,(store,done)=>{store.getAll().onsuccess=e=>{
    for(const row of e.target.result)if(row.owner===owner&&(!classId||row.classId===classId)&&(all||!row.pending))store.delete(row.key);
    done(undefined);
  };});
}
export async function resolveDay(day, serverMarks, useDevice) {
  assertDeviceWrite(day.owner);
  if(activeTeacher()!==day.owner)throw new Error('Sign in again.');
  return transaction(true,(store,done)=>{store.get(day.key).onsuccess=e=>{
    const current=e.target.result;
    if(!current||current.revision!==day.revision){done(null);return;}
    const next={...current,baseline:serverMarks,marks:useDevice?current.marks:serverMarks,pending:useDevice,error:'',revision:crypto.randomUUID()};
    store.put(next);done(next);
  };});
}
let running;
export function syncAttendance(owner) {
  if(!deviceCanWrite(owner))return Promise.resolve();
  if(running)return running;
  const run=async()=>{
    if(!navigator.onLine||!owner||activeTeacher()!==owner)return;
    // New local classes and learners must reach the server before attendance.
    const {readRecords}=await import('./offline-records.js');
    if((await readRecords(owner)).queue.length)return;
    for(const day of await listDays(owner)){
      if(!deviceCanWrite(owner))break;
      if(!day.pending||day.error||activeTeacher()!==owner)continue;
      let response,result;
      try {
        response=await fetch('/api/attendance/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner,classId:day.classId,date:day.date,marks:day.marks,baseline:day.baseline}),signal:AbortSignal.timeout(20000)});
        result=await response.json();
      }catch{break;}
      if(response.status===401||response.status===403||response.status>=500)break;
      await transaction(true,(store,done)=>{store.get(day.key).onsuccess=e=>{
        const current=e.target.result;
        if(!current){done(undefined);return;}
        if(result.ok){
          // Keep edits made during this request queued, but advance their server baseline.
          store.put({...current,baseline:result.marks??day.marks,pending:current.revision!==day.revision,error:'',updatedAt:result.updatedAt});
        }else if(current.revision===day.revision)store.put({...current,error:result.error||'Could not sync. Open attendance to review.'});
        done(undefined);
      };});
    }
  };
  running=(navigator.locks?navigator.locks.request('teacherco-attendance-sync',run):run()).finally(()=>{running=undefined;});
  return running;
}
