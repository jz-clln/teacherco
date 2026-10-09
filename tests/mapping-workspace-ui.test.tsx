import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {chooseOption} from './helpers/custom-select';
import type {Template} from '@/features/report-card-templates/model';
import {emptyDefinition,type MappingDefinition,type MappingRecord} from '@/features/report-card-mappings/model';
const mocks=vi.hoisted(()=>({review:vi.fn(),save:vi.fn(),reset:vi.fn(),compact:false}));
vi.mock('@/features/report-card-mappings/actions',()=>({reviewMapping:mocks.review,saveMapping:mocks.save,resetMapping:mocks.reset}));
vi.mock('@/features/report-card-templates/viewer',()=>({TemplateViewer:({onSelection}:{onSelection:(s:unknown)=>void})=><><button onClick={()=>onSelection({sheetName:'Front',address:'C8',mergedRange:'C8:F8'})}>Workbook cell</button><button onClick={()=>onSelection({sheetName:'Front',address:'G8'})}>Second workbook cell</button></>}));
import {MappingWorkspace} from '@/features/report-card-mappings/workspace';
const template={id:'template',name:'Grade 8 template',file_sha256:'a'.repeat(64),status:'active',workbook_metadata:{formatVersion:1,sheets:[{name:'Front',index:0,state:'visible'}]}} as Template;
beforeEach(()=>{
  vi.resetAllMocks();mocks.compact=false;
  vi.stubGlobal('matchMedia',()=>({matches:mocks.compact,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  mocks.review.mockImplementation(async({definition}:{definition:MappingDefinition})=>({ok:true,data:{definition,warnings:[]}}));
  mocks.save.mockImplementation(async({definition,status}:{definition:MappingDefinition;status:string})=>({ok:true,data:{id:'record',revision:1,status,mapping_definition:definition}}));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('reviews a whole grade table before applying and saves only on explicit Save mapping',async()=>{
  start();fireEvent.click(screen.getByRole('button',{name:'Map grade table'}));
  for(const [i,column] of ['G','H','I'].entries())fireEvent.change(screen.getByLabelText(`Term ${i+1} column`),{target:{value:column}});
  fireEvent.change(screen.getByLabelText('Subjects in worksheet order'),{target:{value:'Calculus\nLanguage'}});
  fireEvent.click(screen.getByRole('button',{name:'Review grade mappings'}));await screen.findByRole('button',{name:'Apply to mapping'});
  expect(mocks.save).not.toHaveBeenCalled();expect(screen.getByRole('status')).toHaveTextContent('0 mapped');
  fireEvent.click(screen.getByRole('button',{name:'Apply to mapping'}));expect(screen.getByRole('status')).toHaveTextContent('6 mapped');expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Save mapping'}));await screen.findByText('Mapping saved.');expect(mocks.save.mock.calls[0][0].definition.subjects[1].outputs.period_3.address).toBe('I31');
});
function start(initial:MappingRecord|null=null){return render(<MappingWorkspace template={template} initial={initial}/>);}
it('expands beside Save mapping and exits with Escape without losing unsaved edits',async()=>{
  const {container}=start();fireEvent.click(screen.getByText('Workbook cell'));fireEvent.click(screen.getByRole('button',{name:'Assign'}));
  const fullscreen=screen.getByRole('button',{name:'Full screen'});expect(screen.getByRole('button',{name:'Save mapping'}).nextElementSibling).toBe(fullscreen);
  fireEvent.click(fullscreen);await waitFor(()=>expect(container.querySelector('[data-mapping-fullscreen="true"]')).not.toBeNull());expect(document.body.style.overflow).toBe('hidden');expect(screen.getByRole('button',{name:'Exit full screen'})).toHaveAttribute('aria-pressed','true');
  fireEvent.keyDown(document,{key:'Escape'});expect(container.querySelector('[data-mapping-fullscreen="true"]')).toBeNull();expect(document.body.style.overflow).not.toBe('hidden');expect(screen.getByRole('button',{name:'Full screen'})).toHaveFocus();expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Save mapping'}));await screen.findByText('Mapping saved.');expect(mocks.save.mock.calls[0][0].definition.fields.learner_name.address).toBe('C8:F8');
});
it('assigns a merged cell directly and validates before saving without a wizard',async()=>{
  start();fireEvent.click(screen.getByText('Workbook cell'));chooseOption(screen.getByRole('combobox',{name:'Assign as'}),'field:learner_name');fireEvent.click(screen.getByRole('button',{name:'Assign'}));
  expect(screen.getByRole('status')).toHaveTextContent('1 mapped');expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Save mapping'}));await screen.findByText('Mapping saved.');
  expect(mocks.review).toHaveBeenCalledOnce();expect(mocks.save.mock.calls[0][0]).toMatchObject({status:'reviewed',expectedId:null,revision:0,definition:{fields:{learner_name:{sheet:'Front',address:'C8:F8'}}}});
  expect(screen.queryByRole('navigation',{name:'Mapping steps'})).toBeNull();
});
it('blocks invalid saves and preserves local edits when a revision becomes stale',async()=>{
  start();fireEvent.click(screen.getByText('Workbook cell'));fireEvent.click(screen.getByRole('button',{name:'Assign'}));
  mocks.review.mockResolvedValueOnce({ok:false,error:'Locations overlap.'});fireEvent.click(screen.getByRole('button',{name:'Save mapping'}));expect(await screen.findByRole('alert')).toHaveTextContent('Locations overlap.');expect(mocks.save).not.toHaveBeenCalled();
  mocks.save.mockResolvedValueOnce({ok:false,error:'Changed in another session.'});fireEvent.click(screen.getByRole('button',{name:'Save mapping'}));await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Changed in another session.'));expect(screen.getByRole('status')).toHaveTextContent('1 mapped · Unsaved changes');
});
it('keeps mapping controls beside the workbook on small screens',async()=>{
  mocks.compact=true;start();expect(screen.getByRole('complementary',{name:'Mapping controls'})).toBeVisible();
  fireEvent.click(screen.getByText('Workbook cell'));fireEvent.click(screen.getByRole('button',{name:'Assign'}));
  expect(screen.getByRole('button',{name:'Clear Learner Name'})).toBeVisible();expect(screen.getByRole('combobox',{name:'Assign as'})).toBeVisible();
});
it('shows only one subject editor while keeping both subject mappings',()=>{
  const definition=emptyDefinition(template.file_sha256);definition.subjects=[{key:'math',label:'Mathematics',outputs:{period_1:{sheet:'Front',address:'D15'}}},{key:'english',label:'English',outputs:{period_1:{sheet:'Front',address:'D16'}}}];definition.periods=[{key:'period_1',label:'Term 1'}];
  start({id:'record',revision:1,status:'draft',mapping_definition:definition} as MappingRecord);
  expect(screen.queryByRole('textbox',{name:'period_1 label'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Mathematics 1 mapped'}));expect(screen.getByRole('textbox',{name:'Subject label math'})).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'English 1 mapped'}));expect(screen.queryByRole('textbox',{name:'Subject label math'})).toBeNull();expect(screen.getByRole('textbox',{name:'Subject label english'})).toBeVisible();expect(screen.getByRole('status')).toHaveTextContent('2 mapped');
});

it('holds a subject target until a cell is selected, then releases it without saving',async()=>{
  const definition=emptyDefinition(template.file_sha256);definition.periods=[{key:'period_1',label:'Term 1'}];definition.subjects=[{key:'math',label:'Calculus',outputs:{}}];
  start({id:'record',revision:1,status:'draft',mapping_definition:definition} as MappingRecord);
  fireEvent.click(screen.getByRole('button',{name:'Calculus 0 mapped'}));
  fireEvent.click(screen.getByRole('button',{name:'Select location for Calculus - Term 1'}));
  expect(screen.getByText('Mapping Calculus - Term 1')).toBeVisible();
  expect(screen.getByRole('button',{name:'Select location for Calculus - Term 1'})).toHaveAttribute('aria-pressed','true');
  fireEvent.click(screen.getByText('Workbook cell'));expect(screen.queryByRole('button',{name:'Cancel selection'})).toBeNull();
  fireEvent.click(screen.getByText('Second workbook cell'));expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Save mapping'}));await screen.findByText('Mapping saved.');
  expect(mocks.save.mock.calls[0][0].definition.subjects[0].outputs.period_1.address).toBe('C8:F8');
});
it('cancels the held target and waits for both clicks when selecting a range',async()=>{
  start();fireEvent.click(screen.getByRole('button',{name:'Select location for Learner Name'}));
  fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('button',{name:'Cancel selection'})).toBeNull();
  fireEvent.click(screen.getByText('Workbook cell'));expect(screen.getByRole('status')).toHaveTextContent('0 mapped');
  fireEvent.click(screen.getByRole('button',{name:'Select location for Learner Name'}));
  fireEvent.click(screen.getByLabelText('Select range with two clicks'));fireEvent.click(screen.getByText('Workbook cell'));
  expect(screen.getByText('Select the last cell in the range.')).toBeVisible();expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Second workbook cell'));expect(screen.queryByRole('button',{name:'Cancel selection'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Save mapping'}));await screen.findByText('Mapping saved.');
  expect(mocks.save.mock.calls[0][0].definition.fields.learner_name.address).toBe('C8:G8');
});
