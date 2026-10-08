import type {NextRequest} from 'next/server';
import {TemplateError} from '@/features/report-card-templates/data';
export function sameOrigin(request:NextRequest){
  const forwarded=request.headers.get('x-forwarded-proto'),protocol=forwarded==='http'||forwarded==='https'?`${forwarded}:`:request.nextUrl.protocol;
  try{return request.headers.get('origin')===new URL(`${protocol}//${request.headers.get('host')??request.nextUrl.host}`).origin;}catch{return false;}
}
export async function boundedJson(request:NextRequest,limit:number){
  const reader=request.body?.getReader();if(!reader)throw new TemplateError('Review readiness before generating.');const chunks:Uint8Array[]=[];let length=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw new TemplateError('Request is too large.',413);}chunks.push(value);}}finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
