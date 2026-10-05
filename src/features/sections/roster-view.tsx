'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { SectionActionButton } from './action-button';
import { compareRosters, duplicateWarnings, sectionInputClass, type SectionClass, type SectionLearner, type SectionMember } from './model';
import { deactivateSectionEnrollment, getLinkedClassLearners, reactivateSectionEnrollment } from './roster-actions';

export function SectionRoster({ sectionId, members, classes }: { sectionId: string; members: SectionMember[]; classes: SectionClass[] }) {
  const [inactive, setInactive] = useState(false), [classId, setClassId] = useState('');
  const [roster, setRoster] = useState<SectionLearner[] | null>(null), [pending, start] = useTransition(), [error, setError] = useState('');
  const active = members.filter(m => m.status === 'active'), shown = inactive ? members : active;
  const differences = roster ? compareRosters(members, roster) : null;
  const duplicates = new Set(duplicateWarnings(roster ?? [], members).map(d => d.id));
  function compare() {
    if (pending) return; setError('');
    start(async () => {
      try { const result = await getLinkedClassLearners({ sectionId, classId }); if (result.ok) setRoster(result.learners); else { setRoster(null); setError(result.error); } }
      catch { setError('Could not compare learners. Please try again.'); }
    });
  }
  return <div id="section-roster" className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2>Learners</h2><p className="mt-1 text-sm text-[#606861]">{active.length} active learners</p></div><Link className="tc-button tc-primary" href={`/sections/${sectionId}/learners/add`}>Add learner</Link></div>
    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-[#1A4D2E]" checked={inactive} onChange={e => setInactive(e.target.checked)} />Show inactive learners</label>
    {!shown.length ? <p className="tc-group p-5 text-sm text-[#606861]">No {inactive ? '' : 'active '}learners yet. Add existing learners or create a learner for this Section.</p> : <ul className="tc-group tc-rows">{shown.map(m => <li key={m.enrollmentId} className="tc-row flex-wrap justify-between gap-3"><div className="min-w-0 flex-1"><p className="font-medium wrap-anywhere">{m.display_name}</p>{m.status === 'inactive' && <p className="text-sm text-[#606861]">Inactive</p>}</div><SectionActionButton label={m.status === 'active' ? 'Remove' : 'Reactivate'} title={`${m.status === 'active' ? 'Remove' : 'Reactivate'} ${m.display_name}${m.status === 'active' ? ' from this Section' : ''}?`} description="Their learner profile, classes, grades and records will remain unchanged." action={() => m.status === 'active' ? deactivateSectionEnrollment({ sectionId, enrollmentId: m.enrollmentId }) : reactivateSectionEnrollment({ sectionId, enrollmentId: m.enrollmentId })} /></li>)}</ul>}
    <section className="tc-group space-y-4 p-5"><h2>Compare with class</h2><p className="text-sm text-[#606861]">Compare active learners. Different learner records stay separate, even when names match.</p><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="min-w-0 flex-1 text-sm">Linked class<select aria-label="Linked class" className={sectionInputClass} disabled={pending} value={classId} onChange={e => { setClassId(e.target.value); setRoster(null); }}><option value="">Choose a class</option>{classes.map(c => <option key={c.id} value={c.id}>{c.subject} · {c.name}</option>)}</select></label><Button variant="secondary" disabled={pending || !classId} onClick={compare}>{pending ? 'Comparing…' : 'Compare learners'}</Button></div>{!classes.length && <p className="text-sm text-[#606861]">Link a class to compare its learner roster.</p>}{error && <p role="alert" className="text-sm text-[#9B2C2C]">{error}</p>}
      {differences && <div className="grid gap-5 lg:grid-cols-3">{[['In both', differences.both], ['Only in Section', differences.sectionOnly], [`Only in ${classes.find(c => c.id === classId)?.subject ?? 'class'}`, differences.classOnly]].map(([title, rows], group) => <div key={title as string} className="min-w-0"><h3 className="font-semibold wrap-anywhere">{title as string} · {(rows as SectionLearner[]).length}</h3><ul className="mt-2 divide-y divide-[#E3E5E1]">{(rows as SectionLearner[]).map(l => <li key={l.id} className="py-3 text-sm wrap-anywhere"><p>{l.display_name}</p>{group === 2 && <><p className="mt-1 text-[#80571B]">{duplicates.has(l.id) ? 'Possible same-name record' : members.some(m => m.id === l.id) ? 'Inactive in Section' : 'Not in Section'}</p><Link className="tc-button tc-quiet mt-1 px-0" href={members.some(m => m.id === l.id) ? `#section-roster` : `/sections/${sectionId}/learners/add?class=${classId}&learner=${l.id}`} onClick={() => { if (members.some(m => m.id === l.id)) setInactive(true); }}>{members.some(m => m.id === l.id) ? 'View inactive learner' : duplicates.has(l.id) ? 'Review learner' : 'Add to Section'}</Link></>}</li>)}</ul></div>)}</div>}
    </section>
  </div>;
}
