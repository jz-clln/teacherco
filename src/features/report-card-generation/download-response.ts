'use client';
export async function receiveDownload(response:Response,cleanupUrl:string){
  if(!response.headers.get('Content-Type')?.includes('application/json'))return {blob:await response.blob(),filename:decodeURIComponent(response.headers.get('X-Download-Filename')??'Report-Card.xlsx')};
  const data=await response.json();
  try{
    const url=new URL(data.url),expected=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    if(url.origin!==expected.origin||!url.pathname.startsWith('/storage/v1/object/sign/report-card-temporary/'))throw new Error();
    const file=await fetch(url,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});if(!file.ok)throw new Error();
    const blob=await file.blob();if(blob.size>50*1024*1024)throw new Error();return {blob,filename:data.filename as string};
  }catch{throw new Error('The temporary download failed or expired. Try generating again.');}
  finally{await fetch(cleanupUrl,{method:'POST',cache:'no-store',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({cleanupToken:data.cleanupToken})}).catch(()=>undefined);}
}
