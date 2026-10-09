'use client';
import Link, {useLinkStatus} from 'next/link';
import {LoaderCircle} from 'lucide-react';
function TabLabel({label}:{label:string}){const {pending}=useLinkStatus();return <span className="inline-flex items-center gap-2">{label}{pending&&<span role="status" aria-label={`Opening ${label}`}><LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true"/></span>}</span>;}
import { usePathname } from 'next/navigation';

export function ClassAreaTabs() {
  const path = usePathname();
  return <nav className="tc-tabs" aria-label="Classes and Sections">{[['Classes', '/classes'], ['Sections', '/sections']].map(([label, href]) => <Link key={href} href={href} aria-current={path === href || path.startsWith(`${href}/`) ? 'page' : undefined}><TabLabel label={label}/></Link>)}</nav>;
}
export function SectionTabs({ sectionId }: { sectionId: string }) {
  const path = usePathname(), base = `/sections/${sectionId}`;
  return <nav className="tc-tabs gap-4 sm:gap-6" aria-label="Section areas">{[['Overview', base], ['Learners', `${base}/learners`], ['Classes', `${base}/classes`], ['Grades', `${base}/grades`], ['Grade Inbox', base+'/inbox'], ['Report Cards', `${base}/report-cards`]].map(([label, href]) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}><TabLabel label={label}/></Link>)}</nav>;
}
