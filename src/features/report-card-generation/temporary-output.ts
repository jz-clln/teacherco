import 'server-only';
import {randomUUID} from 'node:crypto';
import {TemplateError,type TemplateContext} from '@/features/report-card-templates/data';
export const TEMPORARY_BUCKET='report-card-temporary';
export const SIGNED_SECONDS=60;
export function ownedTemporaryPath(path:unknown,owner:string):path is string{return typeof path==='string'&&new RegExp(`^\\d{13}/${owner}/[a-f0-9-]{36}\\.(xlsx|zip)$`).test(path);}
export async function removeTemporary(context:TemplateContext,path:unknown){
  if(!ownedTemporaryPath(path,context.user.id))throw new TemplateError('This temporary download is unavailable.',403);
  const {error}=await context.supabase.storage.from(TEMPORARY_BUCKET).remove([path]);if(error)throw new TemplateError('Temporary cleanup will be retried automatically.');
}
export async function temporaryDownload(context:TemplateContext,bytes:Buffer,mime:string,revalidate:()=>Promise<void>){
  const expires=Date.now()+14*60*1000,path=`${expires}/${context.user.id}/${randomUUID()}.${mime==='application/zip'?'zip':'xlsx'}`,bucket=context.supabase.storage.from(TEMPORARY_BUCKET);
  try{
    const upload=await bucket.upload(path,bytes,{contentType:mime,cacheControl:'0',headers:{'cache-control':'private, no-store, max-age=0'},upsert:false});if(upload.error)throw new Error();
    await revalidate();
    const signed=await bucket.createSignedUrl(path,SIGNED_SECONDS);if(signed.error||!signed.data?.signedUrl)throw new Error();
    await revalidate();
    return {url:signed.data.signedUrl,cleanupToken:path,expiresIn:SIGNED_SECONDS};
  }catch(e){await bucket.remove([path]).catch(()=>undefined);if(e instanceof TemplateError)throw e;throw new TemplateError('A temporary download failed. Try generating again.',503);}
}
