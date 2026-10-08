import {NextRequest} from 'next/server';
import {templateAccess} from '@/features/report-card-templates/data';
import {removeTemporary} from '@/features/report-card-generation/temporary-output';
import {boundedJson,sameOrigin} from '@/features/report-card-generation/request';
export async function POST(request:NextRequest){
  const headers={'Cache-Control':'private, no-store'};
  if(!sameOrigin(request))return Response.json({error:'Request origin is not allowed.'},{status:403,headers});
  try{const input=await boundedJson(request,512);await removeTemporary(await templateAccess(),input.cleanupToken);return Response.json({ok:true},{headers});}catch{return Response.json({error:'Temporary cleanup will be retried automatically.'},{status:400,headers});}
}
