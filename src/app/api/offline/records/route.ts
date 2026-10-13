import {canWrite} from '@/lib/auth/access-policy';
import {getAccessContext} from '@/lib/auth/access-guard';
import {operationSchema,recordSchemas} from '@/lib/offline/validation';
import {tables} from '../../../../../public/offline-records.js';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function access(){const c=await getAccessContext();return c?.user.email_confirmed_at && c.profile.access_status==='active'?c:null;}
export async function GET(request:Request){
  const context=await access();if(!context)return reply({error:'Sign in to prepare your offline workspace.'},401);
  const url=new URL(request.url),table=url.searchParams.get('table')??'',offset=Number(url.searchParams.get('offset')??0);
  if(!tables.includes(table)||!Number.isSafeInteger(offset)||offset<0)return reply({error:'Invalid offline page.'},400);
  // Every listed table has owner RLS. Do not use a service-role client here.
  const {data,error}=await context.supabase.from(table).select('*').order(table==='class_grading_config'?'class_id':'id').range(offset,offset+499);
  if(error)return reply({error:'Could not prepare offline records.'},503);
  return reply({owner:context.user.id,rows:data??[],nextOffset:data?.length===500?offset+500:null});
}
export async function POST(request:Request){
  if(request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Invalid origin.'},403);
  const context=await access();if(!context)return reply({error:'Sign in again to sync. Device changes are safe.'},401);
  if(!canWrite(context.profile))return reply({error:'Renew your invite code to sync. Device changes are safe.'},403);
  let body;try {const raw=await request.text();if(raw.length>64000)return reply({error:'Change is too large.'},413);body=operationSchema.safeParse(JSON.parse(raw));}catch{return reply({error:'Invalid change.'},400);}
  if(!body.success)return reply({error:'Invalid change.'},400);
  const op=body.data;
  if(op.owner!==context.user.id)return reply({error:'Sign in to the same teacher account.'},403);
  const schema=Object.hasOwn(recordSchemas,op.table)?recordSchemas[op.table]:undefined;
  if(!schema || !schema.safeParse(op.row).success || (op.row.teacher_id && op.row.teacher_id!==context.user.id))return reply({error:'Check the record values before syncing.'},422);
  const {data,error}=await context.supabase.rpc('sync_offline_record',{p_operation:op.id,p_table:op.table,p_row:op.row,p_before:op.before});
  if(error){
    if(['23503','23505','23514','42501','22023','P0001'].includes(error.code))return reply({error:'The record or its related records are no longer editable. Keep the online version, refresh, then reapply your changes.',current:op.before},409);
    return reply({error:'Could not sync right now. Your changes remain on this device.'},503);
  }
  if(!data.ok)return reply({error:data.error,current:data.current??null},409);
  return reply({row:data.row});
}
