import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {FileUpload} from '@/components/ui/file-upload';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function capability(matches:boolean){vi.stubGlobal('matchMedia',vi.fn().mockReturnValue({matches,addEventListener:vi.fn(),removeEventListener:vi.fn()}));}
it('supports desktop multiple-file drops, visible hover, and picker fallback',()=>{
  capability(true);const receive=vi.fn();const {container}=render(<FileUpload label="Grades" multiple onFiles={receive}/>);
  expect(screen.getByText('Drag and drop your Excel files here')).toBeVisible();
  const zone=container.firstElementChild!,files=[new File(['a'],'Science.xlsx'),new File(['b'],'Math.xlsx')],dataTransfer={types:['Files'],files,dropEffect:'none'};
  fireEvent.dragEnter(zone,{dataTransfer});expect(zone).toHaveAttribute('data-drag-active','true');
  fireEvent.dragOver(zone,{dataTransfer});expect(dataTransfer.dropEffect).toBe('copy');
  fireEvent.drop(zone,{dataTransfer});expect(receive).toHaveBeenCalledWith(files);expect(zone).toHaveAttribute('data-drag-active','false');
  const input=screen.getByLabelText('Grades'),click=vi.spyOn(input,'click');screen.getByRole('button',{name:'Choose files'}).focus();expect(screen.getByRole('button',{name:'Choose files'})).toHaveFocus();fireEvent.click(screen.getByRole('button',{name:'Choose files'}));expect(click).toHaveBeenCalledOnce();
  fireEvent.change(input,{target:{files:[files[0]]}});expect(receive).toHaveBeenLastCalledWith([files[0]]);
});
it('shows picker only on mobile or coarse-pointer tablets and blocks browser file navigation',()=>{
  capability(false);const receive=vi.fn();const {container}=render(<FileUpload label="Workbook" onFiles={receive}/>);
  expect(screen.queryByText(/Drag and drop/)).not.toBeInTheDocument();expect(container.firstElementChild).not.toHaveClass('border-dashed');expect(screen.getByRole('button',{name:'Choose file'})).toBeVisible();
  const drop=new Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(drop,'dataTransfer',{value:{types:['Files'],files:[new File(['a'],'a.xlsx')]}});window.dispatchEvent(drop);expect(drop.defaultPrevented).toBe(true);expect(receive).not.toHaveBeenCalled();
  expect(vi.mocked(window.matchMedia)).toHaveBeenCalledWith(expect.stringContaining('(pointer: fine)'));
});
it('never accepts another drop while upload is disabled',()=>{capability(true);const receive=vi.fn();const {container}=render(<FileUpload label="Workbook" disabled onFiles={receive}/>);fireEvent.drop(container.firstElementChild!,{dataTransfer:{types:['Files'],files:[new File(['a'],'a.xlsx')]}});expect(receive).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Choose file'})).toBeDisabled();});
