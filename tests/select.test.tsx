import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {Select} from '@/components/ui/select';
afterEach(cleanup);
const options=[{value:'one',label:'Term 1'},{value:'two',label:'Term 2'}];
it('uses keyboard selection and submits the chosen form value',()=>{
  const change=vi.fn();const {container}=render(<form><Select name="term" label="Term" options={options} emptyLabel="Choose term" onChange={change}/></form>);
  const trigger=screen.getByRole('combobox',{name:'Term'});
  fireEvent.keyDown(trigger,{key:'ArrowDown'});fireEvent.keyDown(trigger,{key:'ArrowDown'});fireEvent.keyDown(trigger,{key:'Enter'});
  expect(trigger).toHaveTextContent('Term 1');expect(change).toHaveBeenCalledWith('one');expect(new FormData(container.querySelector('form')!).get('term')).toBe('one');expect(container.querySelector('select')).toBeNull();
});
it('follows controlled values and prevents disabled selections and submission',()=>{
  const change=vi.fn();const {container,rerender}=render(<form><Select name="term" label="Term" options={options} value="one" onChange={change}/></form>);
  fireEvent.click(screen.getByRole('combobox'));expect(screen.getByRole('listbox')).toBeVisible();
  rerender(<form><Select name="term" label="Term" options={options} value="two" onChange={change} disabled/></form>);
  expect(screen.getByRole('combobox')).toHaveTextContent('Term 2');expect(screen.queryByRole('listbox')).toBeNull();expect(new FormData(container.querySelector('form')!).has('term')).toBe(false);expect(change).not.toHaveBeenCalled();
});
it('closes with Escape without changing the value',()=>{
  const change=vi.fn();render(<Select name="term" label="Term" options={options} value="one" onChange={change}/>);
  const trigger=screen.getByRole('combobox');fireEvent.click(trigger);fireEvent.keyDown(trigger,{key:'ArrowDown'});fireEvent.keyDown(trigger,{key:'Escape'});
  expect(trigger).toHaveAttribute('aria-expanded','false');expect(trigger).toHaveTextContent('Term 1');expect(change).not.toHaveBeenCalled();
});
