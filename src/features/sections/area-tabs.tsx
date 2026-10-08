'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function ClassAreaTabs() {
  const path = usePathname();
  return <nav className="tc-tabs" aria-label="Classes and Sections">{[['Classes', '/classes'], ['Sections', '/sections']].map(([label, href]) => <Link key={href} href={href} aria-current={path === href || path.startsWith(`${href}/`) ? 'page' : undefined}>{label}</Link>)}</nav>;
}
export function SectionTabs({ sectionId }: { sectionId: string }) {
  const path = usePathname(), base = `/sections/${sectionId}`;
  return <nav className="tc-tabs gap-4 sm:gap-6" aria-label="Section areas">{[['Overview', base], ['Learners', `${base}/learners`], ['Classes', `${base}/classes`], ['Grades', `${base}/grades`], ['Grade Inbox', base+'/inbox'], ['Report Cards', `${base}/report-cards`]].map(([label, href]) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>{label}</Link>)}</nav>;
}
