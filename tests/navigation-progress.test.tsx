import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const route=vi.hoisted(()=>({pathname:'/',search:''}));
vi.mock('next/navigation',()=>({usePathname:()=>route.pathname,useSearchParams:()=>new URLSearchParams(route.search)}));
import {NavigationProgress} from '@/components/layout/navigation-progress';
import {PageLoading} from '@/components/ui/page-loading';
afterEach(()=>{cleanup();route.pathname='/';route.search='';});
it('uses an accessible top bar without the page mascot',()=>{const {container}=render(<PageLoading/>);expect(screen.getByRole('status')).toHaveAttribute('aria-busy','true');expect(container.querySelector('img')).toBeNull();expect(container.querySelector('.tc-page-loading')).toBeTruthy();});
it('starts on internal navigation and stops when the next route commits',()=>{
  const {rerender}=render(<><NavigationProgress/><a href="/navigation-test-target" onClick={e=>e.preventDefault()}>Classes</a></>);
  fireEvent.click(screen.getByText('Classes'));expect(screen.getByRole('status')).toBeInTheDocument();
  route.pathname='/navigation-test-target';rerender(<NavigationProgress/>);expect(screen.queryByRole('status')).toBeNull();
});
it('ignores modified clicks and downloads',()=>{render(<><NavigationProgress/><a href="/navigation-test-target" onClick={e=>e.preventDefault()}>Classes</a><a href="/report.xlsx" download onClick={e=>e.preventDefault()}>Download</a></>);fireEvent.click(screen.getByText('Classes'),{ctrlKey:true});expect(screen.queryByRole('status')).toBeNull();fireEvent.click(screen.getByText('Download'));expect(screen.queryByRole('status')).toBeNull();});
