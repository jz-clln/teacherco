// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
vi.mock('server-only',()=>({}));
import {boundedJson,sameOrigin} from '@/features/report-card-generation/request';

it('bounds the actual streamed body even without a Content-Length header',async()=>{
  const request=new NextRequest('https://teacherco.example/api',{method:'POST',body:JSON.stringify({value:'x'.repeat(100)})});
  await expect(boundedJson(request,32)).rejects.toMatchObject({status:413});
  const valid=new NextRequest('https://teacherco.example/api',{method:'POST',body:'{"value":0}'});
  await expect(boundedJson(valid,32)).resolves.toEqual({value:0});
});

it('accepts the public proxy origin and rejects foreign or missing origins',()=>{
  const headers={host:'teacherco.example','x-forwarded-proto':'https',origin:'https://teacherco.example'};
  expect(sameOrigin(new NextRequest('http://localhost/api',{headers}))).toBe(true);
  expect(sameOrigin(new NextRequest('http://localhost/api',{headers:{...headers,origin:'https://foreign.example'}}))).toBe(false);
  expect(sameOrigin(new NextRequest('http://localhost/api',{headers:{host:headers.host}}))).toBe(false);
});
