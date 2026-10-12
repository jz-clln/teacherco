// @vitest-environment node
import {beforeEach,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({context:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/auth/access-guard',()=>({getAccessContext:mock.context}));
import {GET} from '@/app/api/attendance/offline/route';
const owner='teacher';
beforeEach(()=>{vi.clearAllMocks();mock.context.mockResolvedValue({user:{id:owner,email_confirmed_at:'yes'},profile:{access_status:'active'},supabase:{from:mock.from}});});
it('prepares both subjects in the same section with distinct class ids and account filtering',async()=>{
  const filters:unknown[][]=[];
  mock.from.mockImplementation((table:string)=>{
    const query={select:vi.fn().mockReturnThis(),eq:vi.fn((...args:unknown[])=>{filters.push([table,...args]);return query;}),order:vi.fn().mockReturnThis(),range:vi.fn(async()=>({data:table==='classes'?[{id:'class-1',name:'Maya',subject:'Calculus'},{id:'class-2',name:'Maya',subject:'General Mathematics'}]:table==='class_enrollments'?[{learner:{id:'learner',display_name:'Ana'}}]:[],error:null}))};return query;
  });
  const response=await GET(new Request('https://teacherco.test/api/attendance/offline'));expect(response.status).toBe(200);
  const data=await response.json();expect(data.days.map((d:{subject:string})=>d.subject)).toEqual(['Calculus','General Mathematics']);expect(data.days.every((d:{owner:string})=>d.owner===owner)).toBe(true);expect(filters).toContainEqual(['classes','teacher_id',owner]);expect(filters).toContainEqual(['classes','status','active']);expect(data.nextOffset).toBeNull();expect(response.headers.get('cache-control')).toContain('no-store');
});
it('requires an active session and rejects invalid pagination',async()=>{
  expect((await GET(new Request('https://teacherco.test/api/attendance/offline?offset=-1'))).status).toBe(400);
  mock.context.mockResolvedValue(null);expect((await GET(new Request('https://teacherco.test/api/attendance/offline'))).status).toBe(401);expect(mock.from).not.toHaveBeenCalled();
});
