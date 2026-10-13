import {renderReports} from './offline-report-ui.js';
import {activeTeacher,cacheDay,listDays,queueDay,syncAttendance} from './offline-attendance.js';
import {readRecords,saveRecords,syncRecords,prepareRecords,resolveRecord,exportRecords,restoreRecords} from './offline-records.js';
import {computeTermGrade,inferTermAndComponent,defaultGradingConfig,defaultActivitySlots} from './offline-grading.js';

const owner=activeTeacher(),root=document.querySelector('#workspace');
let state,dirty=false,editing=false,busy=false,view={tab:'classes'},generation=0;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const rows=t=>state.rows[t]??[];
const get=(t,id)=>rows(t).find(r=>r.id===id);
function el(tag,text,parent=root){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;parent.append(node);return node;}
function message(text){document.querySelector('#status').textContent=text;}
function button(text,fn,parent=root,secondary=false){const b=el('button',text,parent);b.type='button';if(secondary)b.className='secondary';b.onclick=()=>run(fn);return b;}
async function run(fn){if(busy)return;busy=true;try{await fn();}catch(e){message(e.message);}finally{busy=false;}}
function input(label,value,parent,type='text'){const l=el('label',label,parent),i=el('input',undefined,l);i.type=type;i.value=value??'';i.oninput=()=>{dirty=true;};return i;}
function select(label,options,value,parent){const l=el('label',label,parent),s=el('select',undefined,l);for(const [id,name] of options){const o=el('option',name,s);o.value=id;}s.value=value??options[0]?.[0];s.onchange=()=>{dirty=true;};return s;}
function text(value,max=120){const v=value.trim();if(!v || v.length>max)throw new Error(`Enter a value of 1–${max} characters.`);return v;}
function number(value,max){if(value==='')return null;const n=Number(value);if(!Number.isFinite(n)||n<0||n>max)throw new Error(`Enter a number between 0 and ${max}.`);return n;}
const edit=(table,row,before=null)=>({table,row,before});
async function save(edits){await saveRecords(owner,edits);dirty=false;editing=false;message('Saved on this device. Changes will sync when connected.');await render();void sync().catch(e=>message(e.message));}
async function navigate(next){if(dirty&&!confirm('Leave without saving these changes?'))return false;dirty=false;editing=false;view=next;await render();return true;}
function nav(){const bar=el('nav');bar.className='toolbar';for(const [tab,label] of [['classes','Classes'],['learners','Learners'],['sections','Section Grade Book'],['reports','Report cards'],['sync','Sync & backup']]){const b=button(label,()=>navigate({tab}),bar,view.tab!==tab);b.setAttribute('aria-current',view.tab===tab?'page':'false');}}
function members(type,id){const field=type==='classes'?'class_id':'section_id',table=type==='classes'?'class_enrollments':'section_enrollments';return rows(table).filter(r=>r[field]===id&&r.status==='active').map(r=>get('learners',r.learner_id)).filter(Boolean).sort((a,b)=>a.display_name.localeCompare(b.display_name));}
function openForm(title,fields,onSave){
  if(dirty&&!confirm('Leave without saving?'))return;dirty=false;editing=true;
  root.replaceChildren();button('← Back',()=>navigate(view),root,true);el('h2',title);
  const form=el('form'),inputs=fields.map(f=>input(f.label,f.value,form,f.type));
  for(let i=0;i<inputs.length;i++){inputs[i].required=true;inputs[i].maxLength=fields[i].max??120;}
  const submit=el('button','Save on device',form);submit.type='submit';form.onsubmit=e=>{e.preventDefault();void run(()=>onSave(inputs.map(i=>i.value)));};
}
function classForm(table,row){openForm(row?'Edit details':table==='classes'?'Create class':'Create Section',[
  {label:'Name',value:row?.name},...(table==='classes'?[{label:'Subject',value:row?.subject}]:[]),
  {label:'Grade level',value:row?.grade_level,max:50},{label:'School year',value:row?.school_year??'2026–2027',max:30},
],async values=>{
  const [name,...rest]=values,subject=table==='classes'?rest.shift():undefined;
  await save([edit(table,{...row,id:row?.id??crypto.randomUUID(),teacher_id:owner,name:text(name),...(subject?{subject:text(subject)}:{}),grade_level:text(rest[0],50),school_year:text(rest[1],30),status:row?.status??'active'},row)]);
});}
function learnerForm(row,container){openForm(row?'Edit learner':'Add learner',[{label:'First name',value:row?.first_name},{label:'Last name',value:row?.last_name}],async values=>{
  const first_name=text(values[0]),last_name=text(values[1]),id=row?.id??crypto.randomUUID();
  const changes=[edit('learners',{id,teacher_id:owner,first_name,last_name,display_name:`${first_name} ${last_name}`},row)];
  if(container){const section=container.type==='sections';changes.push(edit(section?'section_enrollments':'class_enrollments',{id:crypto.randomUUID(),...(section?{teacher_id:owner,section_id:container.id}:{class_id:container.id}),learner_id:id,status:'active'}));}
  await save(changes);
});}
function listContainers(table){
  el('h2',table==='classes'?'Your classes':'Section Grade Books');button(table==='classes'?'Create class':'Create Section',()=>classForm(table));
  const grid=el('div');grid.className='class-grid';
  for(const c of rows(table).filter(c=>c.status==='active')){const b=button('',()=>navigate({tab:table,id:c.id}),grid,true);b.className='class-choice';const span=el('span',undefined,b);el('strong',table==='classes'?c.subject:c.name,span);el('small',`${table==='classes'?c.name+' · ':''}Grade ${c.grade_level.replace(/^grade\s*/i,'')} · ${members(table,c.id).length} learners`,span);}
  const archived=rows(table).filter(c=>c.status==='archived');if(archived.length){const details=el('details');el('summary','Archived',details);for(const c of archived)button(`Restore ${c.name}${c.subject?' · '+c.subject:''}`,()=>save([edit(table,{...c,status:'active'},c)]),details,true);}
  if(!rows(table).length)el('p','No records yet. Create one here, or refresh while connected to download your records.');
}
function roster(type,c){
  el('h2','Learners');const actions=el('div');actions.className='toolbar';button('Add learner',()=>learnerForm(null,{type,id:c.id}),actions);
  const list=members(type,c.id),available=rows('learners').filter(l=>!list.some(x=>x.id===l.id));
  if(available.length){const s=select('Enroll existing learner',available.map(l=>[l.id,l.display_name]),null,actions);button('Enroll',async()=>{
    if(dirty&&!confirm('Enroll this learner and discard unsaved form changes?'))return;
    const section=type==='sections',table=section?'section_enrollments':'class_enrollments',field=section?'section_id':'class_id';
    const old=rows(table).find(r=>r[field]===c.id&&r.learner_id===s.value)??null;
    await save([edit(table,{...old,id:old?.id??crypto.randomUUID(),[field]:c.id,learner_id:s.value,status:'active',...(section?{teacher_id:owner}:{})},old)]);
  },actions,true);s.onchange=()=>{};}
  for(const l of list){const line=el('div');line.className='learner';el('span',l.display_name,line);const controls=el('div');controls.className='toolbar';line.append(controls);button('Edit',()=>learnerForm(l),controls,true);button('Remove',async()=>{
    if(!confirm(`Remove ${l.display_name} from this roster? Existing records will be kept.${dirty?' Unsaved form changes will be discarded.':''}`))return;
    const table=type==='classes'?'class_enrollments':'section_enrollments',field=type==='classes'?'class_id':'section_id',old=rows(table).find(r=>r[field]===c.id&&r.learner_id===l.id);
    await save([edit(table,{...old,status:'inactive'},old)]);
  },controls,true);}
}
async function attendance(c){
  if(dirty&&!confirm('Leave without saving these changes?'))return;
  dirty=false;
  const learners=members('classes',c.id).map(l=>({id:l.id,name:l.display_name}));
  if(!learners.length)throw new Error('Add learners before taking attendance.');
  const all=rows('attendance_entries').filter(r=>r.class_id===c.id),dates=new Set([today(),...all.map(r=>r.attendance_date)]);
  for(const date of dates){const entries=all.filter(r=>r.attendance_date===date),marks=Object.fromEntries(entries.map(r=>[r.learner_id,r.status]));await cacheDay({owner,classId:c.id,className:c.name,subject:c.subject,date,learners,marks,baseline:marks,updatedAt:null},true);}
  // This standalone cached document does not have a Next.js router.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href=`/offline.html?classId=${c.id}&date=${today()}`;
}
function activityForm(c,row){
  if(dirty&&!confirm('Leave without saving these changes?'))return;
  dirty=false;editing=true;
  root.replaceChildren();button('Back',()=>navigate(view),root,true);el('h2',row?'Edit activity':'Add activity');
  const configured=rows('class_grading_config').find(r=>r.class_id===c.id)?.activity_slots;
  const allSlots=Array.isArray(configured)&&configured.length?configured:defaultActivitySlots();
  const occupied=rows('assessments').filter(a=>a.class_id===c.id&&a.id!==row?.id).map(a=>a.activity_slot??a.exported_title??(a.source==='imported'?a.title:null));
  const choices=allSlots.filter(slot=>!occupied.includes(slot.title));
  if(row?.activity_slot&&!choices.some(slot=>slot.title===row.activity_slot))choices.push({title:row.activity_slot,term:row.term,component:row.component});
  if(!choices.length){el('p','Every activity destination is already assigned. Open an existing activity to enter scores.');return;}
  const form=el('form'),title=input('Activity title',row?.title,form);
  const slot=select('Class record activity',choices.map(s=>[s.title,s.title]),row?.activity_slot??choices[0].title,form);
  const total=input('Highest possible score',row?.total_points??100,form,'number');
  total.min='.01';total.max='10000';total.step='.01';title.required=true;title.maxLength=160;total.required=true;
  if(row&&rows('submissions').some(s=>s.assessment_id===row.id)){total.disabled=true;slot.disabled=true;el('p','The activity destination and maximum are kept for saved scores.',form);}
  const b=el('button','Save on device',form);b.type='submit';form.onsubmit=e=>{e.preventDefault();void run(()=>{
    const chosen=choices.find(s=>s.title===slot.value);
    return save([edit('assessments',{...row,id:row?.id??crypto.randomUUID(),class_id:c.id,title:text(title.value,160),activity_slot:chosen.title,term:chosen.term,component:chosen.component,total_points:number(total.value,10000),source:'manual',status:row?.status??'closed'},row)]);
  });};
}
function grades(c){
  el('h2','Activities & grades');button('Add activity',()=>activityForm(c));
  const activities=rows('assessments').filter(a=>a.class_id===c.id),list=members('classes',c.id);
  const activity=select('Activity',activities.map(a=>[a.id,`${a.title}${a.source!=='manual'?' (view only)':''}`]),view.activity,root);
  const previousActivity=activity.value;
  activity.onchange=()=>run(async()=>{if(!await navigate({...view,activity:activity.value}))activity.value=previousActivity;});
  const a=activities.find(a=>a.id===activity.value);
  if(a){
    if(a.source==='manual')button('Edit activity',()=>activityForm(c,a),root,true);
    el('p',a.source!=='manual'?'Imported and checked scores are view only here. Use the original import or Check screen to revise them.':`Maximum score: ${a.total_points??'set per learner'}. Blank means no score recorded.`);
    const form=el('form'),changes=[];
    for(const l of list){const old=rows('submissions').find(s=>s.assessment_id===a.id&&s.learner_id===l.id)??null;const score=input(l.display_name,old?.score,form,'number');score.step='.01';score.min='0';score.max=String(old?.max_score??a.total_points??10000);score.disabled=a.source!=='manual';changes.push({l,old,score});}
    if(a.source==='manual'){const b=el('button','Save scores on device',form);b.type='submit';form.onsubmit=e=>{e.preventDefault();void run(()=>{
      const edits=changes.flatMap(({l,old,score})=>{
        const max=old?.max_score??a.total_points;if(max==null)throw new Error('Set an activity maximum before recording scores.');const value=number(score.value,Number(max));
        if(value===(old?.score??null))return [];
        return [edit('submissions',{id:old?.id??crypto.randomUUID(),assessment_id:a.id,learner_id:l.id,score:value,max_score:Number(max),review_status:'confirmed'},old)];
      });return save(edits);
    });};}
  }
  el('h2','Calculated term grades');
  const savedConfig=rows('class_grading_config').find(r=>r.class_id===c.id),config=savedConfig??defaultGradingConfig(c.subject);
  el('p',`${savedConfig?'Uses your saved grading rules.':'Uses the default grading rules for this subject.'} Incomplete terms remain marked incomplete.`);
  const wrap=el('div');wrap.className='table-scroll';const table=el('table',undefined,wrap),head=el('tr',undefined,el('thead',undefined,table));for(const h of ['Learner','Term 1','Term 2','Term 3'])el('th',h,head);
  const body=el('tbody',undefined,table);
  for(const l of list){const tr=el('tr',undefined,body);el('th',l.display_name,tr);for(const term of [1,2,3]){
    const confirmed=rows('submissions').filter(s=>s.review_status==='confirmed'&&s.score!=null&&Number(s.max_score)>0);
    const items=activities.filter(a=>confirmed.some(s=>s.assessment_id===a.id)).flatMap(a=>{const inferred=inferTermAndComponent(a.activity_slot??a.title),component=a.component??inferred.component;if(Number(a.term??inferred.term)!==term||!component)return [];const score=confirmed.find(s=>s.assessment_id===a.id&&s.learner_id===l.id);return [{title:a.title,component,possible:Number(score?.max_score??confirmed.find(s=>s.assessment_id===a.id)?.max_score??0),earned:score?.score??null,isTermExam:inferred.isTermExam}];});
    const possible=config.term_possible?.[String(term)]??{};for(const component of ['written_work','performance_task','assessment']){const missing=Number(possible[component])-items.filter(i=>i.component===component).reduce((sum,i)=>sum+i.possible,0);if(missing>0.001)items.push({title:'Unscored class-record columns',component,possible:missing,earned:null,isTermExam:false});}
    const result=computeTermGrade(items,config,possible),cell=el('td',result.status==='graded'?String(result.termGrade):result.status==='incomplete'?'Incomplete':'—',tr);cell.title=result.warnings.join('\n');
  }}
  const recorded=rows('teacher_term_grades').filter(r=>r.class_id===c.id);
  if(recorded.length){el('h2','Grades from your imported class record');el('p','These are the original imported values, shown for comparison.');
    const area=el('div');area.className='table-scroll';const t=el('table',undefined,area),h=el('tr',undefined,el('thead',undefined,t));for(const label of ['Learner','Term','Initial grade','Term grade','Descriptor'])el('th',label,h);
    const b=el('tbody',undefined,t);for(const grade of recorded){const tr=el('tr',undefined,b);for(const value of [get('learners',grade.learner_id)?.display_name??'Learner',grade.term,grade.initial_grade??'—',grade.term_grade??'—',grade.descriptor??'—'])el('td',String(value),tr);}
  }
}
function sectionGrades(c){
  el('h2','Grade Book setup');const toolbar=el('div');toolbar.className='toolbar';
  for(const isPeriod of [false,true])button(isPeriod?'Add period':'Add subject',()=>{
    const table=isPeriod?'section_grade_periods':'section_subjects',existing=rows(table).filter(r=>r.section_id===c.id),position=Math.max(0,...existing.map(r=>r.position))+1;
    if(isPeriod&&position>8)throw new Error('A Section can have up to 8 periods.');
    openForm(isPeriod?'Add period':'Add subject',[{label:isPeriod?'Period label':'Subject name',max:isPeriod?60:120}],values=>save([edit(table,{id:crypto.randomUUID(),teacher_id:owner,section_id:c.id,...(isPeriod?{key:`period_${crypto.randomUUID()}`,label:text(values[0],60)}:{name:text(values[0])}),position,status:'active'})]));
  },toolbar,true);
  const subjects=rows('section_subjects').filter(s=>s.section_id===c.id&&s.status==='active').sort((a,b)=>a.position-b.position),periods=rows('section_grade_periods').filter(p=>p.section_id===c.id&&p.status==='active').sort((a,b)=>a.position-b.position);
  if(!subjects.length||!periods.length){el('p','Add subjects and periods to enter grades.');return;}
  const subject=select('Subject',subjects.map(s=>[s.id,s.name]),view.subject,root),previousSubject=subject.value;
  subject.onchange=()=>run(async()=>{if(!await navigate({...view,subject:subject.value}))subject.value=previousSubject;});
  const selected=subjects.find(s=>s.id===subject.value);button('Rename subject',()=>openForm('Rename subject',[{label:'Subject name',value:selected.name}],values=>save([edit('section_subjects',{...selected,name:text(values[0])},selected)])),root,true);
  const form=el('form'),wrap=el('div',undefined,form);wrap.className='table-scroll';const table=el('table',undefined,wrap),head=el('tr',undefined,el('thead',undefined,table));el('th','Learner',head);for(const p of periods)el('th',p.label,head);
  const body=el('tbody',undefined,table),cells=[];
  for(const l of members('sections',c.id)){const tr=el('tr',undefined,body);el('th',l.display_name,tr);for(const p of periods){const old=rows('section_grade_entries').find(g=>g.section_id===c.id&&g.learner_id===l.id&&g.section_subject_id===subject.value&&g.period_id===p.id)??null;const td=el('td',undefined,tr),i=el('input',undefined,td);i.type='number';i.min='0';i.max='100';i.step='.01';i.value=old?.grade??'';i.setAttribute('aria-label',`${l.display_name} ${p.label}`);i.oninput=()=>{dirty=true;};cells.push({old,l,p,i});}}
  const b=el('button','Save grades on device',form);b.type='submit';form.onsubmit=e=>{e.preventDefault();void run(()=>{
    const changes=cells.flatMap(({old,l,p,i})=>{const grade=number(i.value,100);if(grade===(old?.grade??null))return [];return [edit('section_grade_entries',{id:old?.id??crypto.randomUUID(),teacher_id:owner,section_id:c.id,learner_id:l.id,section_subject_id:subject.value,period_id:p.id,grade,source_type:'manual'},old)];});
    if(changes.some(change=>change.before&&change.before.source_type!=='manual')&&!confirm('These edits replace imported grades with the manual grades you entered. Continue?'))return;
    return save(changes);
  });};
}
function detail(type){const c=get(type,view.id);if(!c){view={tab:type};listContainers(type);return;}
  el('h2',`${c.name}${c.subject?' · '+c.subject:''}`);const bar=el('div');bar.className='toolbar';button('Edit details',()=>classForm(type,c),bar,true);button('Archive',async()=>{if(confirm('Archive this record? Existing learners and grades will be kept.')){await save([edit(type,{...c,status:'archived'},c)]);await navigate({tab:type});}},bar,true);
  if(type==='classes')button('Take attendance',()=>attendance(c),bar);
  roster(type,c);if(type==='classes')grades(c);else sectionGrades(c);
}
async function backups(){
  el('h2','Sync & backup');el('p',`${state.queue.length} record change${state.queue.length===1?'':'s'} waiting to sync. ${state.preparedAt?'Last prepared: '+new Date(state.preparedAt).toLocaleString():'Connect to download your existing records.'}`);
  if(state.syncMessage)el('p',state.syncMessage);
  const conflict=state.queue[0];
  if(conflict?.error){el('h2','Review a change');const target=conflict.row;el('p',[conflict.table.replaceAll('_',' '),get('learners',target.learner_id)?.display_name,get('assessments',target.assessment_id)?.title,get('section_subjects',target.section_subject_id)?.name,get('section_grade_periods',target.period_id)?.label].filter(Boolean).join(' · '));el('p',conflict.error);el('p','Other changes wait until this change is reviewed.');const comparison=el('div');comparison.className='comparison';for(const [label,value] of [['On this device',conflict.row],['Online',conflict.conflict]]){const box=el('div',undefined,comparison);el('h3',label,box);const dl=el('dl',undefined,box);for(const [key,v] of Object.entries(value??{}).filter(([k])=>!k.endsWith('_id')&&!['id','created_at','updated_at'].includes(k))){el('dt',key.replaceAll('_',' '),dl);el('dd',typeof v==='object'?JSON.stringify(v):String(v??'—'),dl);}}
    for(const keep of [true,false])button(keep?'Use device change':'Keep online version',async()=>{if(!confirm(keep?'Use this device version after reviewing the online values?':'Discard this device change?'))return;await resolveRecord(owner,conflict.id,keep);await render();void sync();},root,!keep);
  }
  button('Sync now',async()=>{await sync(true);await render();},root,true);
  el('h2','Device backup');el('p','Backups contain learner records. Keep the file private. Restore using the same teacher account.');
  button('Download backup',async()=>{const backup=JSON.parse(await exportRecords(owner));backup.attendance=await listDays(owner);const url=URL.createObjectURL(new Blob([JSON.stringify(backup)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`TeacherCo-offline-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);});
  const file=input('Restore backup','',root,'file');file.accept='.json,application/json';file.onchange=()=>run(async()=>{
    const selected=file.files[0];if(!selected)return;if(selected.size>50*1024*1024)throw new Error('Backup is too large.');
    const backup=JSON.parse(await selected.text());if((await listDays(owner)).some(d=>d.pending))throw new Error('Sync or review current attendance before restoring.');
    if(!Array.isArray(backup.attendance??[]) || (backup.attendance??[]).some(day=>day.owner!==owner || typeof day.classId!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date??'') || !Array.isArray(day.learners) || day.learners.some(l=>typeof l.id!=='string'||typeof l.name!=='string') || !day.marks || !day.baseline || Object.values(day.marks).some(mark=>!['present','absent','late','excused'].includes(mark))))throw new Error('Invalid attendance backup.');
    if(!confirm('Restore this backup? Current synced device records will be replaced.'))return;
    await restoreRecords(owner,backup);
    for(const day of backup.attendance??[]){if(day.owner!==owner)throw new Error('Invalid attendance owner.');const saved=await cacheDay(day);if(day.pending)await queueDay(saved,day.marks);}
    message('Backup restored. Review changes before syncing.');await render();
  });
  if(navigator.storage?.persist)button('Keep records on this device',async()=>message(await navigator.storage.persist()?'Persistent storage enabled. Keep backups as well.':'Your browser did not grant persistent storage. Download a backup regularly.'),root,true);
}
async function render(){const version=++generation;if(!owner || activeTeacher()!==owner){root.replaceChildren();el('p','Sign in online first to prepare this device.');return;}
  const next=await readRecords(owner);if(version!==generation)return;state=next;root.replaceChildren();nav();
  document.querySelector('#summary').textContent=state.queue.length?`${state.queue.length} record change${state.queue.length===1?'':'s'} waiting to sync`:state.preparedAt?'Your records are saved on this device.':'Existing records have not been downloaded yet. Connect and select Refresh records.';
  if(view.tab==='reports')renderReports(root,owner,state);else if(view.tab==='sync')await backups();else if(view.tab==='learners'){el('h2','Your learners');button('Add learner',()=>learnerForm());for(const l of rows('learners').sort((a,b)=>a.display_name.localeCompare(b.display_name))){const line=el('div');line.className='learner';el('span',l.display_name,line);button('Edit',()=>learnerForm(l),line,true);}}
  else if(view.id)detail(view.tab);else listContainers(view.tab);
}
let connecting;
async function sync(force=false){if(connecting)return connecting;if(!owner||activeTeacher()!==owner||!navigator.onLine)return;
  connecting=(async()=>{await syncRecords(owner);await syncAttendance(owner);await prepareRecords(owner,force);if(!dirty&&!editing&&view.tab!=='reports')await render();})().finally(()=>{connecting=null;});return connecting;
}
function connection(){document.querySelector('#connection').textContent=navigator.onLine?'Online':'Offline';}
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('online',()=>{connection();void sync().catch(e=>message(e.message));});window.addEventListener('offline',connection);
window.addEventListener('focus',()=>{if(activeTeacher()!==owner){root.replaceChildren();message('Account changed. Reopen the workspace.');return;}void sync().catch(e=>message(e.message));});
setInterval(()=>{void sync().catch(e=>message(e.message));},30000);
document.querySelector('#refresh-records').onclick=()=>run(async()=>{if(dirty&&!confirm('Refresh and discard unsaved form changes?'))return;dirty=false;await sync(true);});
connection();void render().then(()=>sync()).catch(e=>message(e.message));
