// @vitest-environment node
import {beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({context:vi.fn(),rpc:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/auth/access-guard',()=>({getAccessContext:mock.context}));
import {GET,POST} from '@/app/api/offline/records/route';
const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const input={owner,id,table:'classes',row:{id,teacher_id:owner,name:'Maya',subject:'Math',grade_level:'1',school_year:'2026',status:'active'},before:null};
const request=(body:unknown=input,origin='https://teacherco.test')=>new Request('https://teacherco.test/api/offline/records',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();mock.context.mockResolvedValue({user:{id:owner,email_confirmed_at:'yes'},profile:{access_status:'active'},supabase:{rpc:mock.rpc,from:mock.from}});mock.rpc.mockResolvedValue({data:{ok:true,row:input.row}});});
it('sends a stable operation id and expected baseline to the atomic RPC',async()=>{
  const result=await POST(request());expect(result.status).toBe(200);expect(result.headers.get('cache-control')).toContain('no-store');expect(mock.rpc).toHaveBeenCalledWith('sync_offline_record',{p_operation:id,p_table:'classes',p_row:input.row,p_before:null});
});
it('rejects invalid owners, tables, fields, grades and origins before writing',async()=>{
  expect((await POST(request({...input,owner:id}))).status).toBe(403);
  expect((await POST(request({...input,table:'profiles'}))).status).toBe(422);
  expect((await POST(request({...input,table:'__proto__'}))).status).toBe(422);
  expect((await POST(request({...input,row:{...input.row,benchmark:999}}))).status).toBe(422);
  expect((await POST(request({...input,table:'submissions',row:{id,assessment_id:id,learner_id:id,score:21,max_score:20,review_status:'confirmed'}}))).status).toBe(422);
  expect((await POST(request(input,'https://elsewhere.test'))).status).toBe(403);expect(mock.rpc).not.toHaveBeenCalled();
});
it('requires an active verified session for preparation and writes',async()=>{
  mock.context.mockResolvedValue(null);expect((await GET(new Request('https://teacherco.test/api/offline/records?table=classes'))).status).toBe(401);expect((await POST(request())).status).toBe(401);
});
it('returns conflicts for review and temporary failures for retry',async()=>{
  mock.rpc.mockResolvedValue({data:{ok:false,error:'Changed online',current:input.row}});const result=await POST(request());expect(result.status).toBe(409);expect((await result.json()).current).toEqual(input.row);
  mock.rpc.mockResolvedValue({error:{code:'PGRST202'}});expect((await POST(request())).status).toBe(503);
});
it('paginates allowed tables using the signed-in client and rejects arbitrary table reads',async()=>{
  const range=vi.fn().mockResolvedValue({data:Array.from({length:500},()=>input.row)}),order=vi.fn(()=>({range}));mock.from.mockReturnValue({select:()=>({order})});
  const response=await GET(new Request('https://teacherco.test/api/offline/records?table=classes&offset=500'));
  expect((await response.json()).nextOffset).toBe(1000);expect(range).toHaveBeenCalledWith(500,999);
  expect((await GET(new Request('https://teacherco.test/api/offline/records?table=profiles'))).status).toBe(400);
});
