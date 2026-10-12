import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import type {GradebookData} from '@/features/gradebook/data';
const mock=vi.hoisted(()=>({discover:vi.fn(),apply:vi.fn(),refresh:vi.fn()}));
vi.mock('@/features/assisted-workflows/sync-actions',()=>({discoverClassSync:mock.discover,applyClassSync:mock.apply}));
vi.mock('@/features/assisted-workflows/grade-actions',()=>({analyzeGradeFile:vi.fn(),applyGradeFile:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:mock.refresh})}));
import {GradeInbox} from '@/features/assisted-workflows/inbox';
const book={section:{id:'section',status:'active'},subjects:[{id:'math',name:'Calculus',status:'active'}],periods:[{id:'term1',label:'Term 1',status:'active'}],learners:[{id:'ana',display_name:'Ana',status:'active'}],entries:[]} as unknown as GradebookData;
const proposal={name:'Calculus - Term 1',selection:{sectionId:'section',subjectId:'math',periodId:'term1',classId:'class',term:1,calculation:'printed'},preview:{digest:'a'.repeat(64),revision:1,rows:[{learnerId:'ana',name:'Ana',status:'change',current:{grade:78,source_type:'manual'},incoming:85},{learnerId:'ben',name:'Ben',status:'add',current:null,incoming:0},{learnerId:'cat',name:'Cat',status:'missing',current:{grade:90},incoming:null}]}};
beforeEach(()=>{vi.clearAllMocks();HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};mock.discover.mockResolvedValue({ok:true,data:{proposals:[proposal],issues:[]}});mock.apply.mockResolvedValue({ok:true,count:1});});
afterEach(cleanup);
async function open(){render(<GradeInbox book={book}/>);fireEvent.click(await screen.findByRole('button',{name:'Review updates (2 grades)'}));return screen.getByRole('dialog',{name:'Review class updates'});}
it('shows old/new grades before writes and requires a decision plus separate confirmation',async()=>{
  const dialog=await open();expect(mock.apply).not.toHaveBeenCalled();expect(dialog.style.width).toBe('100vw');expect(dialog.style.height).toBe('100dvh');
  expect(within(dialog).getByText('78',{exact:true})).toBeVisible();expect(within(dialog).getByText('85',{exact:true})).toBeVisible();expect(within(dialog).getByText('0',{exact:true})).toBeVisible();expect(within(dialog).getByText('No class grade — keep current')).toBeVisible();
  const reviewed=within(dialog).getByRole('checkbox');expect(reviewed).toBeDisabled();
  fireEvent.click(within(dialog).getByRole('button',{name:'Keep 78'}));expect(within(dialog).getByRole('button',{name:'Apply 1 grade updates'})).toBeDisabled();
  fireEvent.click(reviewed);fireEvent.click(within(dialog).getByRole('button',{name:'Apply 1 grade updates'}));
  await waitFor(()=>expect(mock.apply).toHaveBeenCalledOnce());expect(mock.apply.mock.calls[0][0]).toMatchObject({selection:proposal.selection,digest:proposal.preview.digest,useIncoming:[],confirmed:true});
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
});
it('cancels without applying anything and clears acknowledgement when a decision changes',async()=>{
  const dialog=await open();fireEvent.click(within(dialog).getByRole('button',{name:'Use 85'}));fireEvent.click(within(dialog).getByRole('checkbox'));expect(within(dialog).getByRole('button',{name:'Apply 2 grade updates'})).toBeEnabled();
  fireEvent.click(within(dialog).getByRole('button',{name:'Keep 78'}));expect(within(dialog).getByRole('checkbox')).not.toBeChecked();
  fireEvent.click(within(dialog).getAllByRole('button',{name:'Cancel'})[0]);expect(screen.queryByRole('dialog')).toBeNull();expect(mock.apply).not.toHaveBeenCalled();
});
it('surfaces stale update failures and closes the obsolete review',async()=>{
  mock.apply.mockResolvedValue({ok:false,error:'Source changed. Check updates again.'});
  const dialog=await open();fireEvent.click(within(dialog).getByRole('button',{name:'Use 85'}));fireEvent.click(within(dialog).getByRole('checkbox'));fireEvent.click(within(dialog).getByRole('button',{name:'Apply 2 grade updates'}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(screen.getByRole('alert')).toHaveTextContent('Source changed');
});
