import {useState} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {SubjectInput} from '@/features/report-card-mappings/subject-input';
afterEach(cleanup);
function setup(){
  const save=vi.fn();
  function Form(){const [value,setValue]=useState('');return <form onSubmit={e=>{e.preventDefault();save(value);}}><SubjectInput value={value} onChange={setValue} options={['Calculus','English','General Mathematics']} disabled={false}/><button>Add</button></form>;}
  render(<Form/>);return {input:screen.getByRole('combobox',{name:'Subject name'}),save};
}
it('filters while typing directly and allows selecting a saved subject',()=>{
  const {input,save}=setup();fireEvent.focus(input);fireEvent.change(input,{target:{value:'CAL'}});
  expect(screen.getAllByRole('option')).toHaveLength(1);fireEvent.click(screen.getByRole('option',{name:'Calculus'}));
  expect(input).toHaveValue('Calculus');fireEvent.click(screen.getByRole('button',{name:'Add'}));expect(save).toHaveBeenCalledWith('Calculus');
});
it('keeps a new typed name when no suggestions match',()=>{
  const {input,save}=setup();fireEvent.change(input,{target:{value:'Robotics'}});expect(screen.getByRole('status')).toHaveTextContent('No matching subjects');
  fireEvent.click(screen.getByRole('button',{name:'Add'}));expect(save).toHaveBeenCalledWith('Robotics');
});
it('selects with arrow keys and Enter without submitting and Escape keeps the text',()=>{
  const {input,save}=setup();fireEvent.change(input,{target:{value:'math'}});fireEvent.keyDown(input,{key:'ArrowDown'});fireEvent.keyDown(input,{key:'Enter'});
  expect(input).toHaveValue('General Mathematics');expect(save).not.toHaveBeenCalled();expect(input).toHaveAttribute('aria-expanded','false');
  fireEvent.change(input,{target:{value:'New subject'}});fireEvent.keyDown(input,{key:'Escape'});expect(input).toHaveValue('New subject');expect(input).toHaveAttribute('aria-expanded','false');
});
