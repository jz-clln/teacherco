import {boundedJson,sameOrigin} from '@/features/report-card-generation/request';
import {temporaryDownload} from '@/features/report-card-generation/temporary-output';
import {MAX_DOWNLOAD_BYTES} from '@/features/report-card-generation/model';
import {NextRequest} from 'next/server';
import {generateDownload} from '@/features/report-card-generation/data';
import {TemplateError} from '@/features/report-card-templates/data';
import {WorkbookError} from '@/features/report-card-templates/package';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:NextRequest,{params}:{params:Promise<{sectionId:string}>}){
  const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
  if(!sameOrigin(request))return Response.json({error:'Request origin is not allowed.'},{status:403,headers});
  if(Number(request.headers.get('content-length')??0)>4096)return Response.json({error:'Request is too large.'},{status:413,headers});
  try{const body=await boundedJson(request,4096),{sectionId}=await params;if(body.sectionId!==sectionId)throw new TemplateError('Section does not match.');const output=await generateDownload(body);if(output.bytes.length>MAX_DOWNLOAD_BYTES){const download=await temporaryDownload(output.context,output.bytes,output.mime,output.revalidate);return Response.json({...download,filename:output.filename,mime:output.mime},{headers});}return new Response(new Uint8Array(output.bytes),{headers:{...headers,'Content-Type':output.mime,'Content-Disposition':`attachment; filename="Report-Card.${output.mime==='application/zip'?'zip':'xlsx'}"; filename*=UTF-8''${encodeURIComponent(output.filename)}`,'X-Download-Filename':encodeURIComponent(output.filename)}});}catch(e){return Response.json({error:e instanceof TemplateError||e instanceof WorkbookError?e.message:'Could not generate the report card. Review readiness and try again.'},{status:e instanceof TemplateError?e.status:400,headers});}
}
