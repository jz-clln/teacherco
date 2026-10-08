// Scheduled private-output cleanup. Never reads file contents or logs identifiers.
declare const Deno:{env:{get:(key:string)=>string|undefined};serve:(handler:(request:Request)=>Promise<Response>)=>void};
type Item={name:string;id:string|null};
export async function cleanupExpired(url:string,key:string,now=Date.now(),transport:typeof fetch=fetch){
  const bucket='report-card-temporary',headers={Authorization:`Bearer ${key}`,apikey:key,'Content-Type':'application/json'};
  async function list(prefix:string){const r=await transport(`${url}/storage/v1/object/list/${bucket}`,{method:'POST',headers,body:JSON.stringify({prefix,limit:100,offset:0,sortBy:{column:'name',order:'asc'}})});if(!r.ok)throw new Error('Cleanup unavailable');return await r.json() as Item[];}
  let removed=0;const paths:string[]=[];
  for(const expiry of await list('')){if(!/^\d{13}$/.test(expiry.name)||Number(expiry.name)>now)continue;
    for(const owner of await list(expiry.name)){if(!/^[a-f0-9-]{36}$/.test(owner.name))continue;
      for(const file of await list(`${expiry.name}/${owner.name}`)){if(/^[a-f0-9-]{36}\.(xlsx|zip)$/.test(file.name))paths.push(`${expiry.name}/${owner.name}/${file.name}`);if(paths.length>=500)break;}if(paths.length>=500)break;}if(paths.length>=500)break;
  }
  for(let i=0;i<paths.length;i+=100){const batch=paths.slice(i,i+100),r=await transport(`${url}/storage/v1/object/${bucket}`,{method:'DELETE',headers,body:JSON.stringify({prefixes:batch})});if(!r.ok)throw new Error('Cleanup unavailable');removed+=batch.length;}
  return removed;
}
export async function cleanupHandler(request:Request,env:(key:string)=>string|undefined,transport:typeof fetch=fetch){
  const token=env('REPORT_CARD_CLEANUP_TOKEN');
  if(request.method!=='POST'||!token||request.headers.get('x-cleanup-token')!==token)return Response.json({error:'Denied'},{status:403,headers:{'Cache-Control':'no-store'}});
  try{const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)throw new Error();const removed=await cleanupExpired(url,key,Date.now(),transport);return Response.json({removed},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Cleanup unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
if(typeof Deno!=='undefined')Deno.serve(request=>cleanupHandler(request,key=>Deno.env.get(key)));
