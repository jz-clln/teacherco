// @vitest-environment node
import {beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({context:vi.fn(),rpc:vi.fn(),revalidate:vi.fn()}));
vi.mock('@/lib/auth/access-guard',()=>({getAccessContext:mock.context}));
vi.mock('next/cache',()=>({revalidatePath:mock.revalidate}));
import {POST} from '@/app/api/attendance/sync/route';
const owner='11111111-1111-4111-8111-111111111111',classId='22222222-2222-4222-8222-222222222222',learner='33333333-3333-4333-8333-333333333333';
const input={owner,classId,date:'2026-01-01',marks:{[learner]:'absent'},baseline:{}};
function request(data:unknown=input,origin='https://teacherco.test'){return new Request('https://teacherco.test/api/attendance/sync',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(data)});}
beforeEach(()=>{vi.clearAllMocks();mock.context.mockResolvedValue({user:{id:owner,email_confirmed_at:'2026-01-01'},profile:{access_status:'active'},supabase:{rpc:mock.rpc}});mock.rpc.mockResolvedValue({data:{ok:true,updatedAt:'2026-01-01'},error:null});});
it('passes the baseline to the atomic save and invalidates attendance pages',async()=>{expect((await POST(request())).status).toBe(200);expect(mock.rpc).toHaveBeenCalledWith('save_attendance_day',{p_class:classId,p_date:input.date,p_marks:input.marks,p_baseline:{}});expect(mock.revalidate).toHaveBeenCalledWith('/today');});
it('rejects a different account without writing',async()=>{expect((await POST(request({...input,owner:classId}))).status).toBe(403);expect(mock.rpc).not.toHaveBeenCalled();});
it('requires authentication and rejects cross-origin writes',async()=>{mock.context.mockResolvedValue(null);expect((await POST(request())).status).toBe(401);expect((await POST(request(input,'https://other.test'))).status).toBe(403);expect(mock.rpc).not.toHaveBeenCalled();});
it('rejects future dates and invalid marks',async()=>{expect((await POST(request({...input,date:'2999-01-01'}))).status).toBe(400);expect((await POST(request({...input,marks:{[learner]:'unknown'}}))).status).toBe(400);expect(mock.rpc).not.toHaveBeenCalled();});
it('returns conflicts without claiming success and keeps transient failures retryable',async()=>{mock.rpc.mockResolvedValue({data:{ok:false,error:'Attendance changed online.'}});expect((await POST(request())).status).toBe(409);expect(mock.revalidate).not.toHaveBeenCalled();mock.rpc.mockResolvedValue({error:{message:'unavailable'}});expect((await POST(request())).status).toBe(503);});
