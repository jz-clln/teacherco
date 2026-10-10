import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {chooseOption} from './helpers/custom-select';
import type {GradebookData} from '@/features/gradebook/data';
const mocks=vi.hoisted(()=>({preview:vi.fn(),save:vi.fn()}));
vi.mock('@/features/gradebook/actions',()=>({previewClassGrades:mocks.preview,importClassGrades:mocks.save,saveManualGrades:vi.fn()}));
vi.mock('@/features/gradebook/setup',()=>({GradebookSetup:()=>null}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
import {SectionGradebook} from '@/features/gradebook/gradebook';
import {ClassGradeImport} from '@/features/gradebook/import-panel';
const book={section:{id:'section',status:'active'},periods:[{id:'t1',label:'Term 1',status:'active'},{id:'t2',label:'Term 2',status:'active'}],subjects:[{id:'calculus',name:'Calculus',status:'active'},{id:'language',name:'Language',status:'active'}],classes:[{id:'c1',subject:'Calculus',name:'Class A'},{id:'c2',subject:'Language',name:'Class B'}],learners:[{id:'learner',display_name:'Ana',status:'active'}],entries:[{learner_id:'learner',section_subject_id:'calculus',period_id:'t1',grade:89,source_type:'manual'},{learner_id:'learner',section_subject_id:'language',period_id:'t1',grade:92,source_type:'manual'}]} as GradebookData;
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('shows each learner with both subjects and removes the view-level destination selectors',()=>{
  render(<SectionGradebook book={book}/>);
  const table=screen.getByRole('table');expect(within(table).getByRole('cell',{name:'89'})).toBeVisible();expect(within(table).getByRole('cell',{name:'92'})).toBeVisible();
  expect(screen.queryByRole('combobox',{name:'Subject'})).toBeNull();expect(screen.queryByRole('combobox',{name:'Period for entry or import'})).toBeNull();
  expect(screen.queryByRole('button',{name:/Show more subjects/})).toBeNull();
});
it('shows two subjects initially, expands learners independently, and searches without losing grades',()=>{
  const extended={...book,subjects:[...book.subjects,{id:'science',name:'Science',status:'active'}],learners:[...book.learners,{id:'ben',display_name:'Ben Cruz',status:'active'}]} as GradebookData;
  render(<SectionGradebook book={extended}/>);
  expect(screen.queryByRole('rowheader',{name:'Science'})).toBeNull();
  const more=screen.getByRole('button',{name:'Show more subjects for Ana'});fireEvent.click(more);
  expect(screen.getAllByRole('rowheader',{name:'Science'})).toHaveLength(1);
  expect(screen.getByRole('button',{name:'Show more subjects for Ben Cruz'})).toHaveAttribute('aria-expanded','false');
  const search=screen.getByRole('searchbox',{name:'Search learners'});
  fireEvent.change(search,{target:{value:' bEN '}});expect(screen.queryByRole('rowheader',{name:'Ana'})).toBeNull();expect(screen.getByRole('rowheader',{name:'Ben Cruz'})).toBeVisible();
  fireEvent.change(search,{target:{value:'Nobody'}});expect(screen.getByRole('status')).toHaveTextContent('No learners match');
  fireEvent.click(screen.getByRole('button',{name:'Clear search'}));expect(screen.getByRole('cell',{name:'89'})).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'Show fewer subjects for Ana'}));expect(screen.queryByRole('rowheader',{name:'Science'})).toBeNull();
});
it('changes destination with the linked class and invalidates the previous preview',async()=>{
  mocks.preview.mockResolvedValue({ok:true,data:{rows:[],digest:'a'.repeat(64),revision:1}});
  render(<ClassGradeImport book={book} onClose={()=>{}} onSaved={()=>{}}/>);
  chooseOption(screen.getByRole('combobox',{name:'Linked class'}),'c1');chooseOption(screen.getByRole('combobox',{name:'Grade source'}),'printed');
  fireEvent.click(screen.getByRole('button',{name:'Review grades'}));await screen.findByText('Review changes');expect(mocks.preview.mock.calls[0][0]).toMatchObject({subjectId:'calculus',periodId:'t1'});
  chooseOption(screen.getByRole('combobox',{name:'Linked class'}),'c2');expect(screen.queryByText('Review changes')).toBeNull();expect(screen.getByRole('status')).toHaveTextContent('Language / Term 1');
  chooseOption(screen.getByRole('combobox',{name:'Source class term'}),'2');fireEvent.click(screen.getByRole('button',{name:'Review grades'}));await waitFor(()=>expect(mocks.preview).toHaveBeenCalledTimes(2));expect(mocks.preview.mock.calls[1][0]).toMatchObject({subjectId:'language',periodId:'t2',classId:'c2'});expect(mocks.save).not.toHaveBeenCalled();
});
