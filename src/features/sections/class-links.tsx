'use client';
import Link from 'next/link';
import type { Section } from '@/types/domain';
import { contextConflict, sectionLabel, type SectionClass } from './model';
import { linkClassToSection, unlinkClassFromSection } from './actions';
import { SectionActionButton } from './action-button';

export function LinkedClasses({ section, classes }: { section: Section; classes: SectionClass[] }) {
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2>Classes</h2><Link className="tc-button tc-primary" href={`/sections/${section.id}/classes/link`}>Link class</Link></div>
    {!classes.length ? <p className="tc-group p-5 text-sm text-[#606861]">No classes linked yet. This Section can also stand on its own.</p> : <ul className="tc-group tc-rows">{classes.map(c => <li key={c.id} className="tc-row flex-wrap justify-between gap-3"><Link className="min-w-0 flex-1 py-2" href={`/classes/${c.id}`}><span className="block font-semibold wrap-anywhere">{c.subject}</span><span className="mt-1 block text-sm text-[#606861] wrap-anywhere">{c.name} · {c.learnerCount} learners · {c.status === 'active' ? 'Active' : 'Archived'}</span></Link><SectionActionButton label="Unlink" title={`Unlink ${c.subject} from ${sectionLabel(section)}?`} description="The class, scores and learners will stay unchanged." action={() => unlinkClassFromSection({ classId: c.id, sectionId: section.id })} /></li>)}</ul>}
  </div>;
}
export function ClassLinkChoices({ section, classes }: { section: Section; classes: SectionClass[] }) {
  const compatible = classes.filter(c => !contextConflict(c, section)), incompatible = classes.filter(c => contextConflict(c, section));
  return <div className="space-y-5"><p className="text-sm text-[#606861]">Choose one of your unlinked classes. Linking keeps both learner rosters independent.</p>
    {!classes.length && <p className="tc-group p-5">No unlinked classes available. <Link className="underline" href="/classes/new">Create a class</Link> or manage its current Section link first.</p>}
    {[["Compatible", compatible], ["Incompatible", incompatible]].map(([label, rows]) => (rows as SectionClass[]).length > 0 && <section key={label as string}><h2 className="mb-2 text-sm font-semibold">{label as string}</h2><ul className="tc-group tc-rows">{(rows as SectionClass[]).map(c => <li key={c.id} className="tc-row flex-wrap justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="font-semibold wrap-anywhere">{c.subject} · {c.name}</h3><p className="mt-1 text-sm text-[#606861] wrap-anywhere">{c.grade_level} · SY {c.school_year} · {c.learnerCount} learners · {c.status}</p>{contextConflict(c, section) && <p className="mt-2 text-sm text-[#9B2C2C]">{contextConflict(c, section)}</p>}</div>{!contextConflict(c, section) && <SectionActionButton label="Link class" title={`Link ${c.subject}?`} description={`${c.name} · ${c.grade_level} · SY ${c.school_year} · ${c.learnerCount} learners will be linked to ${sectionLabel(section)} · SY ${section.school_year}. Neither roster will change.`} action={() => linkClassToSection({ classId: c.id, sectionId: section.id })} destination={`/sections/${section.id}/classes`} />}</li>)}</ul></section>)}
  </div>;
}
