// @vitest-environment node
import {beforeAll,afterAll,it,expect} from 'vitest';
import {database} from './helpers/database';
import {randomUUID} from 'node:crypto';
import type {PGlite} from '@electric-sql/pglite';
let db:PGlite;
beforeAll(async()=>{db=await database(27);},30000);
afterAll(async()=>{await db?.close();});
async function teacher(){const id=randomUUID();await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[id,`${id}@example.com`]);return id;}
async function code(days:number){const code=randomUUID().replaceAll('-','').slice(0,12).toUpperCase().match(/.{4}/g)!.join('-');await db.query('insert into invite_codes(code,duration_days) values($1,$2)',[code,days]);return code;}
async function redeem(id:string,code:string){return (await db.query<{ok:boolean}>('select redeem_invite_code($1,$2) ok',[id,code])).rows[0].ok;}
async function asUser(id:string,work:()=>Promise<void>){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');try{await work();}finally{await db.exec('reset role');}}
it.each([7,30])('grants %i days, locks expired writes but retains reads, and renews with a new code',async days=>{
 const id=await teacher(),first=await code(days);expect(await redeem(id,first)).toBe(true);
 const p=(await db.query<{days:number}>('select extract(epoch from (access_expires_at-now()))/86400 days from profiles where id=$1',[id])).rows[0];expect(Number(p.days)).toBeCloseTo(days,3);
 const unused=await code(7);expect(await redeem(id,unused)).toBe(false);
 await asUser(id,async()=>{await db.query("insert into classes(teacher_id,name,subject,grade_level,school_year) values($1,'Maya','Math','1','2026')",[id]);});
 await db.query("update profiles set access_expires_at=now()-interval '1 second' where id=$1",[id]);
 await asUser(id,async()=>{
  expect((await db.query('select * from classes')).rows).toHaveLength(1);
  expect((await db.query<{active:boolean,read:boolean}>('select has_active_access() active,has_read_access() read')).rows[0]).toEqual({active:false,read:true});
  await expect(db.query("insert into classes(teacher_id,name,subject,grade_level,school_year) values($1,'Other','Math','1','2026')",[id])).rejects.toThrow(/row-level security/);
  expect((await db.query("update classes set name='Changed' returning id")).rows).toHaveLength(0);
  expect((await db.query('delete from classes returning id')).rows).toHaveLength(0);
  await expect(db.query('select sync_offline_record($1,$2,$3,$4)',[randomUUID(),'classes','{}',null])).rejects.toThrow(/active account/);
 });
 expect(await redeem(id,first)).toBe(false);expect(await redeem(id,unused)).toBe(true);
 expect((await db.query('select * from invite_code_redemptions where user_id=$1',[id])).rows).toHaveLength(2);
 await asUser(id,async()=>{expect((await db.query("update classes set name='Renewed' returning id")).rows).toHaveLength(1);});
});
it('keeps existing unlimited accounts and blocks protected expiry changes',async()=>{
 const id=await teacher();await db.query("update profiles set access_status='active' where id=$1",[id]);
 await asUser(id,async()=>{expect((await db.query<{ok:boolean}>('select has_active_access() ok')).rows[0].ok).toBe(true);await expect(db.query("update profiles set access_expires_at=now()+interval '100 years' where id=$1",[id])).rejects.toThrow(/Protected/);});
 expect(await redeem(id,await code(7))).toBe(false);
});
it('rejects suspended redemption, invalid durations, and reusing another teacher code',async()=>{
 const a=await teacher(),b=await teacher(),c=await code(7);expect(await redeem(a,c)).toBe(true);expect(await redeem(b,c)).toBe(false);
 await db.query("update profiles set access_status='suspended' where id=$1",[b]);expect(await redeem(b,await code(30))).toBe(false);
 await expect(code(49)).rejects.toThrow();
});
