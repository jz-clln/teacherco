import {z} from 'zod';
import {getAccessContext} from '@/lib/auth/access-guard';
import {isDateKey,todayInManila} from '@/features/attendance/dates';
import {ATTENDANCE_STATUSES} from '@/features/attendance/types';
import {revalidatePath} from 'next/cache';
const marks=z.record(z.uuid(),z.enum(ATTENDANCE_STATUSES));
const schema=z.object({owner:z.uuid(),classId:z.uuid(),date:z.string().refine(isDateKey),marks:marks.refine(v=>Object.keys(v).length>0&&Object.keys(v).length<=500),baseline:marks.refine(v=>Object.keys(v).length<=1000)});
export async function GET(request:Request){
  const context=await getAccessContext(),url=new URL(request.url);
  if(!context||!context.user.email_confirmed_at||context.profile.access_status!=='active')return Response.json({error:'Sign in to review attendance.'},{status:401});
  const classId=url.searchParams.get('classId'),date=url.searchParams.get('date');
  if(!z.uuid().safeParse(classId).success||!date||!isDateKey(date))return Response.json({error:'Invalid attendance date.'},{status:400});
  const {data:classroom}=await context.supabase.from('classes').select('id').eq('id',classId).eq('teacher_id',context.user.id).maybeSingle();
  if(!classroom)return Response.json({error:'Class not found.'},{status:404});
  const {data,error}=await context.supabase.from('attendance_entries').select('learner_id,status').eq('class_id',classId).eq('attendance_date',date).limit(1000);
  if(error)return Response.json({error:'Could not read attendance.'},{status:503});
  return Response.json({owner:context.user.id,marks:Object.fromEntries((data??[]).map(r=>[r.learner_id,r.status]))},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({ok:false,error:'Invalid origin.'},{status:403});
  const context=await getAccessContext();
  if(!context)return Response.json({ok:false,error:'Sign in to sync attendance.'},{status:401});
  if(!context.user.email_confirmed_at||context.profile.access_status!=='active')return Response.json({ok:false,error:'Account access is required.'},{status:403});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success||parsed.data.date>todayInManila())return Response.json({ok:false,error:'Invalid attendance data.'},{status:400});
  const data=parsed.data;
  if(data.owner!==context.user.id)return Response.json({ok:false,error:'Sign in to the account that saved this attendance.'},{status:403});
  const {data:result,error}=await context.supabase.rpc('save_attendance_day',{p_class:data.classId,p_date:data.date,p_marks:data.marks,p_baseline:data.baseline});
  if(error)return Response.json({ok:false,error:'Could not sync attendance. Your device copy is kept.'},{status:503});
  if(result?.ok){for(const path of [`/classes/${data.classId}`,`/classes/${data.classId}/attendance`,'/today','/reports'])revalidatePath(path);}
  return Response.json(result,{status:result?.ok?200:409,headers:{'Cache-Control':'no-store'}});
}
