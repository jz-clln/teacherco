import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {LoadingState} from '@/components/ui/loading-state';
import {Button} from '@/components/ui/button';
afterEach(cleanup);
it('announces an animated page load without pretending to know progress',()=>{
  const {container}=render(<LoadingState page label="Loading worksheet..."/>);
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy','true');expect(screen.getByRole('status')).toHaveAccessibleName('Loading worksheet...');expect(container.querySelector('.tc-loading-spinner')).toHaveAttribute('aria-hidden','true');expect(container.querySelector('.tc-loading-spinner img')).toHaveAttribute('src',expect.stringContaining('teacherco-mascot'));expect(container.querySelector('.tc-loading-spinner img')).toHaveAttribute('alt','');expect(container.querySelector('.tc-loading-track')).toBeTruthy();expect(screen.queryByRole('progressbar')).toBeNull();
});
it('blocks repeated actions while loading without adding a logo to the button',()=>{
  const action=vi.fn(),{rerender,container}=render(<Button loading onClick={action}>Saving changes</Button>);
  const button=screen.getByRole('button',{name:'Saving changes'});expect(button).toBeDisabled();expect(button).toHaveAttribute('aria-busy','true');expect(button.querySelector('img')).toBeNull();expect(button.querySelector('.tc-loading-spinner')).toBeNull();fireEvent.click(button);expect(action).not.toHaveBeenCalled();
  rerender(<Button onClick={action}>Save changes</Button>);expect(container.querySelector('.tc-loading-spinner')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Save changes'}));expect(action).toHaveBeenCalledOnce();
});
