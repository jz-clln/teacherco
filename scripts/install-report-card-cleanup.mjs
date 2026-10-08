// Installs only the dedicated cleanup secret/schedule. Never prints secret values.
import {readFileSync,writeFileSync,mkdtempSync,rmSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const ref=readFileSync('supabase/.temp/project-ref','utf8').trim(),url=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
if(url.hostname!==`${ref}.supabase.co`||process.env.REPORT_CARD_CLEANUP_PROJECT_REF!==ref)throw new Error('Explicit cleanup project reference must match the linked environment.');
const folder=mkdtempSync(join(tmpdir(),'teacherco-cleanup-')),secret=randomBytes(32).toString('hex');let stage='secret';
function cli(args){try{return execFileSync(process.env.SUPABASE_CLI_MODULE?process.execPath:'supabase',process.env.SUPABASE_CLI_MODULE?[process.env.SUPABASE_CLI_MODULE,...args]:args,{stdio:['ignore','pipe','pipe'],windowsHide:true,encoding:'utf8'});}catch{throw new Error(`Cleanup installation failed at ${stage}. No credentials were printed.`);}}
try{
  const env=join(folder,'secret.env');writeFileSync(env,`REPORT_CARD_CLEANUP_TOKEN=${secret}\n`,{mode:0o600});cli(['secrets','set','--project-ref',ref,'--env-file',env]);
  stage='schedule';const sql=join(folder,'schedule.sql');
  writeFileSync(sql,`begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $setup$ declare existing uuid; begin
  select id into existing from vault.secrets where name='teacherco_report_card_cleanup_token';
  if existing is null then perform vault.create_secret('${secret}','teacherco_report_card_cleanup_token','Report card temporary-file cleanup only');
  else perform vault.update_secret(existing,'${secret}'); end if;
end $setup$;
select cron.schedule('teacherco-report-card-cleanup','* * * * *',$job$
  select net.http_post(
    url:='${url.origin}/functions/v1/report-card-cleanup',
    headers:=jsonb_build_object('Content-Type','application/json','x-cleanup-token',(select decrypted_secret from vault.decrypted_secrets where name='teacherco_report_card_cleanup_token')),
    body:='{}'::jsonb,timeout_milliseconds:=30000)
  where exists(select 1 from storage.objects where bucket_id='report-card-temporary' and name ~ '^[0-9]{13}/' and split_part(name,'/',1) < (floor(extract(epoch from now())*1000)::bigint)::text);
$job$);
commit;`,{mode:0o600});cli(['db','query','--linked','--file',sql]);
  stage='worker verification';const response=await fetch(`${url.origin}/functions/v1/report-card-cleanup`,{method:'POST',headers:{'x-cleanup-token':secret}});if(!response.ok)throw new Error('Cleanup worker verification failed. No credentials were printed.');
  console.log('Cleanup secret stored securely; minute schedule installed; authenticated worker responds successfully.');
}finally{rmSync(join(folder,'secret.env'),{force:true});rmSync(join(folder,'schedule.sql'),{force:true});rmdirSync(folder);}
