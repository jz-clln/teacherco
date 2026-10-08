'use server';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { getClassTermGrades } from '@/features/grading/queries';
import { sectionAccess,requireSection } from '@/features/sections/action-helpers';
import { readGradebook } from '@/features/gradebook/data';
import { previewClassGrades } from '@/features/gradebook/actions';
import { buildPreview,importSchema,type ImportSelection } from '@/features/gradebook/model';
import { subjectKey,periodCode } from './labels';
import { revalidatePath } from 'next/cache';
export async function discoverClassSync(sectionId:string){
  try{
    z.uuid().parse(sectionId);const context=await sectionAccess();const section=await requireSection(context.supabase,context.user.id,sectionId);if(section.status!=='active')throw new Error();
    const book=await readGradebook(context.supabase,context.user.id,sectionId),proposals: {name:string;selection:ImportSelection;preview:Extract<Awaited<ReturnType<typeof previewClassGrades>>,{ok:true}>['data']}[]=[],issues:string[]=[];
    for(const subject of book.subjects.filter(s=>s.status==='active')){
      const classes=book.classes.filter(c=>c.status==='active'&&subjectKey(c.subject)===subjectKey(subject.name));
      if(classes.length!==1){if(classes.length>1)issues.push(`${subject.name}: choose a source class in Grade Book.`);continue;}
      const classId=classes[0].id;
      const revision=async()=>{const r=await context.supabase.from('classes').select('sync_revision').eq('id',classId).eq('teacher_id',context.user.id).eq('section_id',sectionId).single();if(r.error)throw new Error();return Number(r.data.sync_revision);};
      const before=await revision(),classroom=await getClassTermGrades(context.supabase,classId);
      if(!classroom||before!==await revision()){issues.push(`${subject.name}: source changed. Check updates again.`);continue;}
      const activeIds=new Set(book.learners.filter(l=>l.status==='active').map(l=>l.id));
      const preview=(selection:ImportSelection)=>{const rows=buildPreview(classroom,activeIds,book.entries,selection);return {rows,revision:before,digest:createHash('sha256').update(JSON.stringify({p:selection,revision:before,rows})).digest('hex')};};
      for(const period of book.periods.filter(p=>p.status==='active')){
        const code=periodCode(period.label);if(code===null||code<11||code>13){issues.push(`${subject.name} · ${period.label}: choose the source term in Grade Book.`);continue;}
        const selection:ImportSelection={sectionId,subjectId:subject.id,periodId:period.id,classId:classes[0].id,term:code-10,calculation:'printed'};
        let result=preview(selection);
        const ambiguous=result.rows.some(r=>r.printed!=null&&r.calculated!=null&&r.printed!==r.calculated);
        if(ambiguous){issues.push(`${subject.name} · ${period.label}: printed and calculated grades differ. Choose the source in Grade Book.`);continue;}
        if(result.rows.every(r=>r.printed==null)){selection.calculation='calculated';result=preview(selection);}
        if(result.rows.some(r=>r.status==='add'||r.status==='change'))proposals.push({name:`${subject.name} · ${period.label}`,selection,preview:result});
      }
    }
    return {ok:true as const,data:{proposals,issues}};
  }catch{return {ok:false as const,error:'Could not check linked classes. Refresh and try again.'};}
}
export async function applyClassSync(input:unknown){
  try{
    const p=z.object({selection:importSchema,digest:z.string().length(64),useIncoming:z.array(z.uuid()),confirmed:z.literal(true)}).strict().parse(input),context=await sectionAccess(),fresh=await previewClassGrades(p.selection);
    if(!fresh.ok||fresh.data.digest!==p.digest)return {ok:false as const,error:'Source or grades changed. Check for updates again.'};
    const rows=fresh.data.rows.filter(r=>r.status==='add'||r.status==='change'&&p.useIncoming.includes(r.learnerId));
    if(rows.length){const {error}=await context.supabase.rpc('save_section_grades',{p_section:p.selection.sectionId,p_subject:p.selection.subjectId,p_period:p.selection.periodId,p_class:p.selection.classId,p_revision:fresh.data.revision,p_term:p.selection.term,p_calculation:p.selection.calculation,p_rows:rows.map(r=>({learner_id:r.learnerId,grade:r.incoming,expected_updated_at:r.current?.updated_at??null,replace_manual:p.useIncoming.includes(r.learnerId)}))});if(error)return {ok:false as const,error:'Could not sync. Check for updates before retrying.'};}
    revalidatePath(`/sections/${p.selection.sectionId}/grades`);revalidatePath(`/sections/${p.selection.sectionId}/inbox`);return {ok:true as const,count:rows.length};
  }catch{return {ok:false as const,error:'Could not sync these grades.'};}
}
