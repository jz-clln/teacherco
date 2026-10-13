"use client";
import {useEffect,useId,useRef} from 'react';
import Link from 'next/link';
import {MonitorDown} from 'lucide-react';
import {Button} from '@/components/ui/button';
export function WindowsInstallDialog({open,onClose,destination}:{open:boolean;onClose:()=>void;destination:string|null}){
 const ref=useRef<HTMLDialogElement>(null),id=useId();
 useEffect(()=>{const dialog=ref.current;if(!open||!dialog)return;const focus=document.activeElement as HTMLElement|null;dialog.showModal();return()=>{dialog.close();focus?.focus();};},[open]);
 return <dialog ref={ref} className="pwa-dialog pwa-windows-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
  <p className="pwa-dialog-brand">TeacherCo for Windows</p>
  <h2 id={`${id}-title`}>Install TeacherCo on your PC</h2>
  <p id={`${id}-description`}>Open TeacherCo in Microsoft Edge or Google Chrome to install it as an app with its own window.</p>
  <ol>
   <li><MonitorDown size={22} aria-hidden/><span>Look for the <strong>Install app</strong> icon in the address bar and follow the browser prompt.</span></li>
   <li><span className="pwa-step-number" aria-hidden>2</span><span>No install icon? In <strong>Edge</strong>, open the menu, then <strong>More tools → Apps → Install this site as an app</strong>. In <strong>Chrome</strong>, choose <strong>Cast, save, and share → Install page as app</strong>. Menu names can vary.</span></li>
   <li><span className="pwa-step-number" aria-hidden>3</span><span>Confirm installation, then open <strong>TeacherCo</strong> from Windows Start. You can pin it to your taskbar.</span></li>
  </ol>
  <p className="pwa-guidance">Sign in online first to prepare your records. Saved classes, learners, attendance, grades, and prepared report cards remain available in the offline workspace.</p>
  <p className="pwa-guidance">Already installed or installation unavailable? You can keep using TeacherCo in this browser.</p>
  <div className="flex flex-wrap items-center gap-3"><Button type="button" autoFocus onClick={onClose}>Got it</Button><Link href={destination??'/login'} prefetch={false} className="tc-button tc-secondary">Continue in browser</Link></div>
 </dialog>;
}
