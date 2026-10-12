import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {PreviewDownload} from '@/features/report-card-generation/preview-download';
const details={sectionId:'section',templateId:'template',learnerId:'learner',digest:'digest',profileId:'profile',profileRevision:2,formulaTargets:['Sheet1!J30']};
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('requires grade review and formula confirmation, then submits only the previewed learner',async()=>{
  const fetch=vi.fn().mockResolvedValue({ok:false,json:async()=>({error:'Review is stale. Please refresh.'})});vi.stubGlobal('fetch',fetch);
  render(<PreviewDownload details={details} disabled={false}/>);fireEvent.click(screen.getByRole('button',{name:'Download'}));
  expect(screen.getByRole('button',{name:'Download Excel'})).toBeDisabled();fireEvent.click(screen.getByLabelText(/I reviewed/));expect(screen.getByRole('button',{name:'Download Excel'})).toBeDisabled();fireEvent.click(screen.getByLabelText(/I confirm/));fireEvent.click(screen.getByRole('button',{name:'Download Excel'}));
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Review is stale'));
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({learnerId:'learner',profileId:'profile',profileRevision:2,confirmed:true,replaceFormulas:true});
});
it('downloads the filled workbook after review',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('workbook',{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','X-Download-Filename':'Ana.xlsx'}})));
  const create=vi.fn(()=> 'blob:report-card');vi.stubGlobal('URL',class extends URL {static createObjectURL=create;static revokeObjectURL=vi.fn();});
  let filename='';vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){filename=this.download;});
  render(<PreviewDownload details={{...details,formulaTargets:[]}} disabled={false}/>);fireEvent.click(screen.getByRole('button',{name:'Download'}));fireEvent.click(screen.getByLabelText(/I reviewed/));fireEvent.click(screen.getByRole('button',{name:'Download Excel'}));
  await waitFor(()=>expect(filename).toBe('Ana.xlsx'));expect(create).toHaveBeenCalledOnce();expect(screen.queryByRole('button',{name:'Download Excel'})).toBeNull();
});
