'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {accessExpired} from '@/lib/auth/access-policy';
import type {AccessProfile} from '@/features/invites/types';
export function AccessBoundary({profile,children}:{profile:AccessProfile;children:React.ReactNode}){
 const [expired,setExpired]=useState(()=>accessExpired(profile));
 useEffect(()=>{const check=()=>setExpired(accessExpired(profile));check();const timer=setInterval(check,1000);window.addEventListener('focus',check);return()=>{clearInterval(timer);window.removeEventListener('focus',check);};},[profile]);
 return <>
  {profile.access_expires_at&&profile.role!=='admin'&&<div role="status" className="mb-4 rounded-xl border border-[#E3E5E1] bg-[#FAFAF8] p-4 text-sm">
   {expired?'Your access has expired. Your records are safe. This account is read-only until you renew.':`Access ends ${new Date(profile.access_expires_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})} (Manila).`}
   {expired&&<Link href="/invite" className="tc-button tc-primary ml-3">Renew access</Link>}
  </div>}
  <fieldset disabled={expired} className="m-0 min-w-0 border-0 p-0">{children}</fieldset>
 </>;
}
