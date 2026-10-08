'use client';
import Link from 'next/link';
import type { SectionSummary } from './model';
import { contextConflict, sectionLabel, type SectionClass } from './model';
import { SectionActionButton } from './action-button';
import { linkClassToSection, unlinkClassFromSection } from './actions';

export function ClassSectionPicker({ classroom, sections }: { classroom: SectionClass; sections: SectionSummary[] }) {
  const current = sections.find(s => s.id === classroom.section_id);
  return <div className="space-y-5"><div className="tc-group p-5"><h2>Section</h2><p className="mt-2 wrap-anywhere">{current ? <Link className="tc-button tc-quiet " href={`/sections/${current.id}`}>{sectionLabel(current)}</Link> : 'Not linked'}</p>{current && <SectionActionButton label="Unlink from Section" title={`Unlink ${classroom.subject} from ${sectionLabel(current)}?`} description="The class, scores and learners will stay unchanged." action={() => unlinkClassFromSection({ classId: classroom.id, sectionId: current.id })} />}</div>
    <h2>{current ? 'Change Section' : 'Link to Section'}</h2>
    {!sections.length && <p>No Sections yet. <Link className="tc-button tc-secondary" href="/sections/new">Create Section</Link></p>}
    <ul className="tc-group tc-rows">{sections.filter(s => s.id !== current?.id).map(s => <li key={s.id} className="tc-row flex-wrap justify-between gap-3"><div className="min-w-0 flex-1"><p className="font-semibold wrap-anywhere">{sectionLabel(s)}</p><p className="text-sm text-[#606861]">SY {s.school_year} · {s.status}</p>{contextConflict(classroom, s) && <p className="mt-2 text-sm text-[#9B2C2C]">{contextConflict(classroom, s)}</p>}</div>{!contextConflict(classroom, s) && <SectionActionButton label={current ? 'Change Section' : 'Link to Section'} title={`Link ${classroom.subject} to ${sectionLabel(s)}?`} description={`${classroom.name} · ${classroom.grade_level} · SY ${classroom.school_year} · ${classroom.learnerCount} learners. ${current ? `This replaces its link to ${sectionLabel(current)}. ` : ''}Neither learner roster will change.`} action={() => linkClassToSection({ classId: classroom.id, sectionId: s.id, expectedSectionId: classroom.section_id })} />}</li>)}</ul>
  </div>;
}
