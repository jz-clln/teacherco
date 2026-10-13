import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,act,cleanup} from '@testing-library/react';
import {AccessBoundary} from '@/features/invites/components/access-boundary';
afterEach(()=>{cleanup();vi.useRealTimers();});
it('switches an open page to read-only at expiry while retaining navigation and renewal',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
 render(<AccessBoundary profile={{access_status:'active',role:'teacher',onboarding_completed:true,access_expires_at:'2026-01-01T00:00:01Z'}}><input aria-label="Grade"/><button>Save</button><a href="/classes">View classes</a></AccessBoundary>);
 expect(screen.getByRole('button',{name:'Save'})).not.toBeDisabled();act(()=>vi.advanceTimersByTime(1000));expect(screen.getByRole('button',{name:'Save'})).toBeDisabled();expect(screen.getByLabelText('Grade')).toBeDisabled();expect(screen.getByRole('link',{name:'Renew access'})).toHaveAttribute('href','/invite');expect(screen.getByRole('link',{name:'View classes'})).toHaveAttribute('href','/classes');
});
