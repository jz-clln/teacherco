import Link from 'next/link';
import { ownedSection, sectionClasses } from '@/features/sections/data';
import { SectionLifecycle } from '@/features/sections/section-lifecycle';
export default async function SectionOverview({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params, { supabase, user, section } = await ownedSection(sectionId);
  const [classes, roster] = await Promise.all([sectionClasses(sectionId), supabase.from('section_enrollments').select('id', { count: 'exact', head: true }).eq('section_id', sectionId).eq('teacher_id', user.id).eq('status', 'active')]);
  if (roster.error) throw new Error('Could not load Section counts.');
  return <div className="space-y-5"><div className="flex justify-end"><Link className="tc-button tc-primary" href={`/sections/${sectionId}/learners/add`}>Add learner</Link></div><dl className="tc-group tc-metrics">{[['Learners', roster.count ?? 0], ['Linked classes', classes.length], ['Adviser', section.is_adviser ? 'Yes' : 'No'], ['Status', section.status === 'active' ? 'Active' : 'Archived']].map(([label, value]) => <div key={label}><dt className="text-sm text-[#606861]">{label}</dt><dd className="mt-2 text-xl font-semibold">{value}</dd></div>)}</dl>
    <section className="tc-group"><div className="flex flex-wrap items-center justify-between gap-2 p-5"><h2>Classes</h2><Link className="tc-button tc-quiet" href={`/sections/${sectionId}/classes/link`}>Link class</Link></div>{classes.length ? <ul className="tc-rows">{classes.map(c => <li key={c.id}><Link className="tc-row justify-between" href={`/classes/${c.id}`}><span>{c.subject}<span className="mt-1 block text-sm text-[#606861]">{c.name}</span></span><span aria-hidden>›</span></Link></li>)}</ul> : <p className="px-5 pb-5 text-sm text-[#606861]">No linked classes.</p>}</section>
    <section className="tc-group p-5"><h2>Learners</h2><p className="mt-2 text-sm">{roster.count ?? 0} active learners</p><Link className="tc-button tc-quiet mt-2 px-0" href={`/sections/${sectionId}/learners`}>View learners</Link></section><SectionLifecycle section={section} classCount={classes.length} />
  </div>;
}
