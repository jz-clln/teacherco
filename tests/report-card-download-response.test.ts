import {it,expect,vi,afterEach} from 'vitest';
import {receiveDownload} from '@/features/report-card-generation/download-response';
afterEach(()=>vi.unstubAllGlobals());
it('fetches temporary output without browser caching, credentials or referrers and acknowledges cleanup',async()=>{
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://fixture.supabase.co');
  const fetcher=vi.fn().mockResolvedValueOnce(new Response('synthetic')).mockResolvedValueOnce(new Response());vi.stubGlobal('fetch',fetcher);
  const url='https://fixture.supabase.co/storage/v1/object/sign/report-card-temporary/synthetic?token=synthetic';
  const response=Response.json({url,cleanupToken:'synthetic',filename:'Report.xlsx'});
  const result=await receiveDownload(response,'/cleanup');
  expect(result.filename).toBe('Report.xlsx');
  expect(fetcher.mock.calls[0][1]).toEqual({cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  expect(fetcher.mock.calls[1]).toEqual(['/cleanup',expect.objectContaining({method:'POST',cache:'no-store',keepalive:true,body:'{"cleanupToken":"synthetic"}'})]);
  vi.unstubAllEnvs();
});
it('attempts cleanup after an expired download without exposing the URL or token',async()=>{
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://fixture.supabase.co');
  const fetcher=vi.fn().mockResolvedValueOnce(new Response('',{status:403})).mockRejectedValueOnce(new Error('network'));vi.stubGlobal('fetch',fetcher);
  await expect(receiveDownload(Response.json({url:'https://fixture.supabase.co/storage/v1/object/sign/report-card-temporary/synthetic?token=secret',cleanupToken:'synthetic'}),'/cleanup')).rejects.toThrow('The temporary download failed or expired. Try generating again.');
  expect(fetcher).toHaveBeenCalledTimes(2);vi.unstubAllEnvs();
});
