import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({review:vi.fn(),save:vi.fn(),reset:vi.fn()}));
vi.mock('@/features/report-card-mappings/actions',()=>({reviewMapping:mock.review,saveMapping:mock.save,resetMapping:mock.reset}));
vi.mock('@/features/report-card-templates/actions',()=>({loadTemplateSheet:vi.fn()}));
vi.mock('@/components/ui/confirm-dialog',()=>({ConfirmDialog:()=>null}));
import {WorkbookGrid} from '@/features/report-card-templates/viewer';
import {MappingWorkspace} from '@/features/report-card-mappings/workspace';
import {emptyDefinition} from '@/features/report-card-mappings/model';
import type {Template,SheetPreview} from '@/features/report-card-templates/model';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));});
const summary={name:'Front page',index:0,state:'visible' as const,rowExtent:30,columnExtent:9,mergeCount:0,formulaCount:0,hasImages:false,hasExternalReferences:false,hasPrintArea:false,hasFreezePane:false,truncated:false};
const template={id:'f0a00c60-51b8-4f2a-b82b-0547a127a0a7',file_sha256:'a'.repeat(64),workbook_metadata:{formatVersion:1,sheets:[summary]},status:'active',name:'Blank'} as Template;
const preview:SheetPreview={summary,rowStart:1,columnStart:1,rows:[{number:1,height:24,hidden:false}],columns:[{number:1,letter:'A',width:80,hidden:false}],cells:[{address:'A1',row:1,column:1,type:'text',displayValue:'Blank'}],merges:[],warnings:[]};
it('adds restrained mapped labels without changing workbook text or styles',()=>{const select=vi.fn();render(<WorkbookGrid preview={preview} markers={[{sheet:'Front page',address:'A1:B2',label:'Learner Name'},{sheet:'Other',address:'A1',label:'Wrong sheet'}]} onSelect={select}/>);const cell=screen.getByRole('button',{name:'A1: Blank'});expect(cell).toHaveAttribute('title','Mapped: Learner Name');expect(cell).toHaveTextContent('Blank');fireEvent.click(cell);expect(select.mock.calls[0][0]).toMatchObject({address:'A1',sheetName:'Front page'});});
it('assigns locally, requires explicit review/save and does not autosave selection',async()=>{
  // Keep this test on mapping controls; the real viewer is covered separately.
  const {loadTemplateSheet}=await import('@/features/report-card-templates/actions');vi.mocked(loadTemplateSheet).mockResolvedValue({ok:true,data:preview});
  mock.review.mockImplementation(async({definition})=>({ok:true,data:{definition,warnings:[]}}));mock.save.mockImplementation(async({definition})=>({ok:true,data:{id:'saved',revision:1,status:'draft',mapping_definition:definition}}));
  render(<MappingWorkspace template={template} initial={null}/>);
  await waitFor(()=>expect(screen.getByRole('button',{name:'A1: Blank'})).toBeVisible());fireEvent.click(screen.getByRole('button',{name:'A1: Blank'}));fireEvent.click(screen.getByRole('button',{name:'Assign'}));
  expect(mock.save).not.toHaveBeenCalled();expect(mock.review).not.toHaveBeenCalled();expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
  fireEvent.click(screen.getByLabelText('More mapping actions'));fireEvent.click(screen.getByRole('button',{name:'Review'}));await waitFor(()=>expect(screen.getByRole('heading',{name:'Review'})).toBeVisible());fireEvent.click(screen.getByLabelText('More mapping actions'));fireEvent.click(screen.getByRole('button',{name:'Save draft'}));await waitFor(()=>expect(mock.save).toHaveBeenCalledOnce());expect(mock.save.mock.calls[0][0].definition).toEqual({...emptyDefinition(template.file_sha256),fields:{learner_name:{sheet:'Front page',address:'A1'}}});
});
