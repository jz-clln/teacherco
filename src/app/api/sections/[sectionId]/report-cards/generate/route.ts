import {NextRequest} from 'next/server';
import {generateDownload} from '@/features/report-card-generation/data';
import {TemplateError} from '@/features/report-card-templates/data';
import {WorkbookError} from '@/features/report-card-templates/package';
export const runtime='nodejs';
export const maxDuration=60;
function sameOrigin(request:NextRequest){
  // Next's internal URL can use localhost behind a proxy. Compare with the
  // request's actual Host, while retaining the externally forwarded protocol.
  const forwarded=request.headers.get('x-forwarded-proto');
  const protocol=forwarded==='http'||forwarded==='https'?`${forwarded}:`:request.nextUrl.protocol;
  try{return request.headers.get('origin')===new URL(`${protocol}//${request.headers.get('host')??request.nextUrl.host}`).origin;}catch{return false;}
}
async function boundedBody(request:NextRequest){
  const reader=request.body?.getReader();if(!reader)throw new TemplateError('Review readiness before generating.');
  const chunks:Uint8Array[]=[];let length=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>4096){await reader.cancel();throw new TemplateError('Request is too large.',413);}chunks.push(value);}}finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function POST(request:NextRequest,{params}:{params:Promise<{sectionId:string}>}){
  const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
  if(!sameOrigin(request))return Response.json({error:'Request origin is not allowed.'},{status:403,headers});
  if(Number(request.headers.get('content-length')??0)>4096)return Response.json({error:'Request is too large.'},{status:413,headers});
  try{const body=await boundedBody(request),{sectionId}=await params;if(body.sectionId!==sectionId)throw new TemplateError('Section does not match.');const output=await generateDownload(body);return new Response(new Uint8Array(output.bytes),{headers:{...headers,'Content-Type':output.mime,'Content-Disposition':`attachment; filename="Report-Card.${output.mime==='application/zip'?'zip':'xlsx'}"; filename*=UTF-8''${encodeURIComponent(output.filename)}`,'X-Download-Filename':encodeURIComponent(output.filename)}});}catch(e){return Response.json({error:e instanceof TemplateError||e instanceof WorkbookError?e.message:'Could not generate the report card. Review readiness and try again.'},{status:e instanceof TemplateError?e.status:400,headers});}
}
