import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { ClassAreaTabs } from '@/features/sections/area-tabs';
import { listSections } from '@/features/sections/data';
import { sectionLabel } from '@/features/sections/model';
export const metadata = { title: 'Sections' };

export default async function SectionsPage() {
  const sections = await listSections();
  return <div className="min-w-0 space-y-6 wrap-anywhere"><ClassAreaTabs /><header className="flex flex-wrap items-center justify-between gap-3"><div><h1>Sections</h1><p className="mt-2 text-sm text-[#606861]">Learner groups that connect your classes.</p></div><Link className="tc-button tc-primary" href="/sections/new">New Section</Link></header>
    {!sections.length ? <div className="tc-group space-y-3 p-5"><h2>Organize classes by their learner group</h2><p className="text-sm text-[#606861]">Add a Section, then link its classes.</p><Link className="tc-button tc-secondary" href="/sections/new">Create Section</Link></div> : ['active', 'archived'].map(status => {
      const rows = sections.filter(s => s.status === status);
      return rows.length > 0 && <section key={status}><h2 className="mb-3 text-sm font-semibold">{status === 'active' ? 'Active' : 'Archived'}</h2><ul className="tc-group tc-rows">{rows.map(s => <li key={s.id}><Link className="tc-row justify-between" href={`/sections/${s.id}`}><div className="min-w-0"><p className="font-semibold">{sectionLabel(s)}</p><p className="mt-1 text-sm text-[#606861]">{s.grade_level} · SY {s.school_year}{s.is_adviser ? ' · Adviser' : ''}</p><p className="mt-1 text-sm text-[#606861]">{s.classCount} classes · {s.learnerCount} active learners</p></div><ChevronRight size={18} className="shrink-0" aria-hidden /></Link></li>)}</ul></section>;
    })}
  </div>;
}
