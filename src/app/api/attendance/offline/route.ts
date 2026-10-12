import {getAccessContext} from '@/lib/auth/access-guard';
import {todayInManila} from '@/features/attendance/dates';
import type {AttendanceStatus} from '@/features/attendance/types';
export async function GET(request:Request){
  const context=await getAccessContext();
  if(!context||!context.user.email_confirmed_at||context.profile.access_status!=='active')return Response.json({error:'Sign in to prepare offline attendance.'},{status:401});
  const offset=Number(new URL(request.url).searchParams.get('offset')??0);
  if(!Number.isSafeInteger(offset)||offset<0)return Response.json({error:'Invalid page.'},{status:400});
  const {supabase,user}=context,date=todayInManila();
  const {data:classes,error}=await supabase.from('classes').select('id,name,subject').eq('teacher_id',user.id).eq('status','active').order('id').range(offset,offset+9);
  if(error)return Response.json({error:'Could not load classes. Try again when connected.'},{status:503});
  try{
    const days=await Promise.all((classes??[]).map(async classroom=>{
      const learners:{id:string;name:string}[]=[],marks:Record<string,AttendanceStatus>={};let updatedAt:string|null=null;
      for(let start=0;;start+=500){
        const {data,error}=await supabase.from('class_enrollments').select('learner:learners(id,display_name)').eq('class_id',classroom.id).eq('status','active').order('id').range(start,start+499);
        if(error)throw error;
        for(const row of data??[]){const learner=Array.isArray(row.learner)?row.learner[0]:row.learner;if(learner)learners.push({id:String(learner.id),name:String(learner.display_name)});}
        if((data?.length??0)<500)break;
      }
      for(let start=0;;start+=500){
        const {data,error}=await supabase.from('attendance_entries').select('learner_id,status,updated_at').eq('class_id',classroom.id).eq('attendance_date',date).order('id').range(start,start+499);
        if(error)throw error;
        for(const row of data??[]){marks[String(row.learner_id)]=row.status as AttendanceStatus;if(row.updated_at&&(!updatedAt||row.updated_at>updatedAt))updatedAt=row.updated_at;}
        if((data?.length??0)<500)break;
      }
      return {owner:user.id,classId:classroom.id,className:classroom.name,subject:classroom.subject,date,learners:learners.sort((a,b)=>a.name.localeCompare(b.name)),marks,baseline:marks,updatedAt};
    }));
    return Response.json({owner:user.id,days,nextOffset:classes?.length===10?offset+10:null},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return Response.json({error:'Could not prepare the class rosters. Try again when connected.'},{status:503});}
}
