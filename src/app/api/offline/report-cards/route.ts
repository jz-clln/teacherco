import {z} from 'zod';
import {prepareOfflineReport} from '@/features/report-card-generation/offline-package';
import {TemplateError} from '@/features/report-card-templates/data';
export async function POST(request:Request){
  const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Invalid origin.'},403);
  try{
    const input=z.object({sectionId:z.uuid(),templateId:z.uuid()}).strict().parse(await request.json());
    return reply(await prepareOfflineReport(input.sectionId,input.templateId));
  }catch(error){return reply({error:error instanceof TemplateError||error instanceof Error&&error.constructor===Error?error.message:'Could not prepare this report card for offline use.'},error instanceof TemplateError?error.status:400);}
}
