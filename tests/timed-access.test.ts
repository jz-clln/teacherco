import {describe,it,expect} from 'vitest';
import {accessExpired,canWrite,routeAccessRedirect} from '@/lib/auth/access-policy';
const profile={access_status:'active' as const,role:'teacher' as const,onboarding_completed:true};
describe('timed access policy',()=>{
 it('expires at the exact deadline and preserves navigation to records and renewal',()=>{const p={...profile,access_expires_at:'2026-01-01T00:00:00Z'};expect(accessExpired(p,Date.parse(p.access_expires_at))).toBe(true);expect(canWrite(p)).toBe(false);expect(routeAccessRedirect('/classes',true,p)).toBeNull();expect(routeAccessRedirect('/invite',true,p)).toBeNull();});
 it('preserves legacy access and admin access without bypassing suspension',()=>{expect(canWrite(profile)).toBe(true);expect(canWrite({...profile,role:'admin',access_expires_at:'2000-01-01'})).toBe(true);expect(canWrite({...profile,access_status:'suspended'})).toBe(false);});
 it('fails closed for invalid deadlines',()=>{expect(canWrite({...profile,access_expires_at:'invalid'})).toBe(false);});
});
