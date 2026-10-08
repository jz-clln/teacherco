import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {chooseOption} from './helpers/custom-select';
const mock=vi.hoisted(()=>({load:vi.fn(),save:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:mock.refresh})}));
vi.mock('@/features/classes/details-actions',()=>({loadClassSubjectOptions:mock.load,updateClassDetails:mock.save}));
import {EditClassDetails} from '@/features/classes/edit-class-details';
const initial={name:'Class Maya',schoolName:'School',schoolId:'',adviser:'Teacher',gradeLevel:'Grade 1',section:'Maya',subject:'Calculus',schoolYear:'2026-2027',benchmark:75};
afterEach(cleanup);beforeEach(()=>{vi.resetAllMocks();mock.load.mockResolvedValue({ok:true,data:['Calculus','Astronomy']});mock.save.mockResolvedValue({ok:true});});
it('uses custom dropdowns, retains current subjects, and Escape closes the menu before the form',async()=>{
  const {container}=render(<EditClassDetails classId="class-id" initial={initial}/>);fireEvent.click(screen.getByRole('button',{name:'Edit class details'}));
  const subject=screen.getByRole('combobox',{name:'Subject'});await waitFor(()=>expect(subject).toBeEnabled());expect(subject).toHaveTextContent('Calculus');expect(container.querySelector('datalist')).toBeNull();
  fireEvent.click(subject);expect(screen.getByRole('option',{name:'Astronomy'})).toBeVisible();fireEvent.keyDown(subject,{key:'Escape'});expect(screen.queryByRole('listbox')).toBeNull();expect(screen.getByRole('dialog')).toBeVisible();
  chooseOption(screen.getByRole('combobox',{name:'Grade level'}),'Grade 2');chooseOption(subject,'Astronomy');fireEvent.click(screen.getByRole('button',{name:'Save changes'}));await waitFor(()=>expect(mock.save).toHaveBeenCalledWith(expect.objectContaining({subject:'Astronomy',gradeLevel:'Grade 2'})));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());fireEvent.click(screen.getByRole('button',{name:'Edit class details'}));expect(screen.getByRole('combobox',{name:'Subject'})).toHaveTextContent('Astronomy');
});
it('supports a custom subject and a saved-options failure without losing the current value',async()=>{
  mock.load.mockResolvedValue({ok:false,error:'Could not load saved subjects.'});render(<EditClassDetails classId="class-id" initial={initial}/>);fireEvent.click(screen.getByRole('button',{name:'Edit class details'}));await screen.findByText('Could not load saved subjects.');
  const subject=screen.getByRole('combobox',{name:'Subject'});expect(subject).toHaveTextContent('Calculus');chooseOption(subject,'__other__');fireEvent.change(screen.getByPlaceholderText('Type a custom subject'),{target:{value:'Statistics'}});fireEvent.click(screen.getByRole('button',{name:'Save changes'}));await waitFor(()=>expect(mock.save).toHaveBeenCalledWith(expect.objectContaining({subject:'Statistics'})));
});
