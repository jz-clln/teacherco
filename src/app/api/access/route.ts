import {getAccessContext} from '@/lib/auth/access-guard';
export async function GET(){
 const context=await getAccessContext();
 if(!context)return Response.json({error:'Sign in again.'},{status:401,headers:{'Cache-Control':'private, no-store'}});
 return Response.json({owner:context.user.id,status:context.user.email_confirmed_at?context.profile.access_status:'pending',expiresAt:context.profile.role==='admin'?null:context.profile.access_expires_at??null,checkedAt:Date.now()},{headers:{'Cache-Control':'private, no-store'}});
}
