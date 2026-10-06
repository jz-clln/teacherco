// @vitest-environment node
import {beforeEach,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mock=vi.hoisted(()=>({generate:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/features/report-card-generation/data',()=>({generateDownload:mock.generate}));
vi.mock('@/features/report-card-templates/data',()=>({TemplateError:class extends Error{constructor(message:string,public status=400){super(message);}}}));
import {POST} from '@/app/api/sections/[sectionId]/report-cards/generate/route';
beforeEach(()=>{vi.resetAllMocks();mock.generate.mockResolvedValue({bytes:Buffer.from('fixture'),filename:'José-Report-Card.xlsx',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});});
function request(body=JSON.stringify({sectionId:'section'}),origin='https://teacherco.example'){return new NextRequest('https://teacherco.example/api/sections/section/report-cards/generate',{method:'POST',headers:{origin,'Content-Type':'application/json'},body});}
const params={params:Promise.resolve({sectionId:'section'})};
it('delivers private no-store attachment bytes with a Unicode-safe filename',async()=>{const r=await POST(request(),params);expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(r.headers.get('x-content-type-options')).toBe('nosniff');expect(decodeURIComponent(r.headers.get('x-download-filename')!)).toBe('José-Report-Card.xlsx');expect(await r.text()).toBe('fixture');});
it('rejects cross-origin or mismatched Section requests before generation',async()=>{expect((await POST(request(undefined,'https://other.example'),params)).status).toBe(403);expect((await POST(request(JSON.stringify({sectionId:'other'})),params)).status).toBe(400);expect(mock.generate).not.toHaveBeenCalled();});
it('limits the streamed request body even without a content-length header',async()=>{expect((await POST(request('x'.repeat(4097)),params)).status).toBe(413);expect(mock.generate).not.toHaveBeenCalled();});
it('does not expose internal errors or output bytes when generation fails',async()=>{mock.generate.mockRejectedValue(new Error('internal source details'));const r=await POST(request(),params);expect(r.status).toBe(400);expect(await r.text()).not.toContain('internal source details');});
it('accepts the actual request host behind a proxy, but not an unrelated origin',async()=>{const r=new NextRequest('http://localhost:3330/api/sections/section/report-cards/generate',{method:'POST',headers:{origin:'https://teacherco.example',host:'teacherco.example','x-forwarded-proto':'https'},body:JSON.stringify({sectionId:'section'})});expect((await POST(r,params)).status).toBe(200);const bad=new NextRequest('http://localhost:3330/api/sections/section/report-cards/generate',{method:'POST',headers:{origin:'https://evil.example',host:'teacherco.example','x-forwarded-proto':'https'},body:JSON.stringify({sectionId:'section'})});expect((await POST(bad,params)).status).toBe(403);});
