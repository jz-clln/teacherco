import Link from 'next/link';
import { ownedSection } from '@/features/sections/data';
import { SectionTabs } from '@/features/sections/area-tabs';
import { sectionLabel } from '@/features/sections/model';
export default async function SectionLayout({ params, children }: { params: Promise<{ sectionId: string }>; children: React.ReactNode }) {
  const { sectionId } = await params, { section } = await ownedSection(sectionId);
  return <div className="min-w-0 space-y-5 wrap-anywhere"><Link className="tc-button tc-quiet px-0" href="/sections">‹ Sections</Link><header><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1 basis-64"><h1>{sectionLabel(section)}</h1><p className="mt-2 text-sm text-[#606861]">SY {section.school_year}</p>{section.school_name && <p className="mt-1 text-sm text-[#606861]">{section.school_name}</p>}<p className="mt-2 text-sm text-[#4F6F52]">{section.is_adviser ? 'Adviser · ' : ''}{section.status === 'archived' ? 'Archived' : 'Active'}</p></div><Link className="tc-button tc-quiet shrink-0" href={`/sections/${sectionId}/edit`}>Edit</Link></div></header><SectionTabs sectionId={sectionId} />{children}</div>;
}
