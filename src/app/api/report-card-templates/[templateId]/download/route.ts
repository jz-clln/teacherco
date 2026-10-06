import { templateAccess, ownedTemplate, originalBytes, TemplateError } from '@/features/report-card-templates/data';
import { TEMPLATE_BUCKET } from '@/features/report-card-templates/model';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{templateId:string}>}){
  try{
    const context=await templateAccess(),{templateId}=await params,template=await ownedTemplate(context,templateId);
    await originalBytes(context,template);
    // Direct Storage download avoids the serverless response-body size limit.
    const {data,error}=await context.supabase.storage.from(TEMPLATE_BUCKET).createSignedUrl(template.storage_path,60,{download:template.original_filename});
    if(error||!data)throw new TemplateError('The workbook could not be downloaded. Please try again.',503);
    return new Response(null,{status:302,headers:{Location:data.signedUrl,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'}});
  }catch(error){return Response.json({error:error instanceof TemplateError?error.message:'The workbook could not be downloaded. Please try again.'},{status:error instanceof TemplateError?error.status:503,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});}
}
