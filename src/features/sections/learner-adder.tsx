'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { addLearnerToSection, addLearnersFromClassToSection, createLearnerInSection, getLinkedClassLearners, searchSectionLearners } from './roster-actions';
import { duplicateWarnings, sectionInputClass, type DuplicateWarning, type SectionClass, type SectionLearner, type SectionMember, type SectionResult } from './model';

type Review = { description: string; save: (keepSeparate: boolean) => Promise<SectionResult> };
export function LearnerAdder({ sectionId, sectionName, members, classes, initialClassId = '', initialLearners = null, initialLearnerId = '' }: { sectionId: string; sectionName: string; members: SectionMember[]; classes: SectionClass[]; initialClassId?: string; initialLearners?: SectionLearner[] | null; initialLearnerId?: string }) {
  const router = useRouter(), lock = useRef(false), requestId = useRef('');
  const [mode, setMode] = useState<'existing' | 'class' | 'new'>(initialClassId ? 'class' : 'existing');
  const [search, setSearch] = useState(''), [classId, setClassId] = useState(initialClassId);
  const [firstName, setFirstName] = useState(''), [lastName, setLastName] = useState('');
  const [candidates, setCandidates] = useState<SectionLearner[] | null>(initialLearners), [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<string[]>(initialLearnerId && initialLearners?.some(l => l.id === initialLearnerId) && !members.some(m => m.id === initialLearnerId) ? [initialLearnerId] : []), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [pending, start] = useTransition(), [review, setReview] = useState<Review | null>(null), [duplicates, setDuplicates] = useState<DuplicateWarning[]>([]);
  const warningRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (duplicates.length) warningRef.current?.focus(); }, [duplicates.length]);
  const memberIds = new Set(members.map(m => m.id));
  const available = candidates?.filter(c => !memberIds.has(c.id)) ?? [];
  const allAvailableSelected = available.length > 0 && available.slice(0, 500).every(l => selected.includes(l.id));
  const possibleDuplicates = new Set(duplicateWarnings(available, members).map(d => d.id));
  function switchMode(next: typeof mode) { setMode(next); setCandidates(null); setSelected([]); setError(''); setMessage(''); }
  function load(event: React.FormEvent) {
    event.preventDefault(); if (lock.current) return; lock.current = true; setError(''); setMessage(''); setSelected([]);
    start(async () => {
      try {
        const result = mode === 'class' ? await getLinkedClassLearners({ sectionId, classId }) : await searchSectionLearners({ sectionId, search });
        if (!result.ok) { setError(result.error); setCandidates(null); return; }
        setCandidates(result.learners); setHasMore('hasMore' in result && result.hasMore === true);
      } catch { setError('Could not load learners. Try again.'); }
      finally { lock.current = false; }
    });
  }
  function reviewSelection() {
    const ids = [...selected];
    setReview({ description: `Add ${ids.length} selected learner${ids.length === 1 ? '' : 's'} to ${sectionName}? Their existing class memberships and records will stay unchanged.`,
      save: keepSeparate => mode === 'class' ? addLearnersFromClassToSection({ sectionId, classId, learnerIds: ids, keepSeparate }) : addLearnerToSection({ sectionId, learnerIds: ids, keepSeparate }),
    });
  }
  function reviewNew(event: React.FormEvent) {
    event.preventDefault(); requestId.current ||= crypto.randomUUID();
    setReview({ description: `Create ${firstName.trim()} ${lastName.trim()} and add them to ${sectionName}?`, save: keepSeparate => createLearnerInSection({ sectionId, requestId: requestId.current, firstName, lastName, keepSeparate }) });
  }
  function save(keepSeparate: boolean) {
    if (lock.current || !review) return; lock.current = true; setError(''); setMessage('');
    start(async () => {
      try {
        const result = await review.save(keepSeparate);
        if (!result.ok) {
          if (result.duplicates) setDuplicates(result.duplicates);
          else { setReview(null); setDuplicates([]); }
          setError(result.error); return;
        }
        setReview(null); setDuplicates([]); setSelected([]); setMessage(result.message ?? 'Learners added.');
        setFirstName(''); setLastName(''); requestId.current = ''; router.refresh();
      } catch { setError('Could not add learners. Please try again.'); setReview(null); setDuplicates([]); }
      finally { lock.current = false; }
    });
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2" aria-label="Add learner options">{[['existing', 'Add existing learner'], ['class', 'Add from linked class'], ['new', 'Create new learner']].map(([value, label]) => <Button key={value} type="button" variant={mode === value ? 'secondary' : 'ghost'} aria-pressed={mode === value} disabled={pending || !!review} onClick={() => switchMode(value as typeof mode)}>{label}</Button>)}</div>
    {mode === 'new' ? <form onSubmit={reviewNew} className="tc-group space-y-4 p-5"><h2>Create new learner</h2><fieldset disabled={pending || !!review} className="grid min-w-0 gap-4 sm:grid-cols-2"><label className="text-sm">First name<input required maxLength={120} className={sectionInputClass} value={firstName} onChange={e => { setFirstName(e.target.value); requestId.current = ''; }} /></label><label className="text-sm">Last name<input required maxLength={120} className={sectionInputClass} value={lastName} onChange={e => { setLastName(e.target.value); requestId.current = ''; }} /></label><Button className="sm:col-span-2">Create and add learner</Button></fieldset></form> : <>
      <form onSubmit={load} className="tc-group space-y-3 p-5"><fieldset disabled={pending || !!review} className="min-w-0 space-y-3">
        {mode === 'existing' ? <label className="block text-sm font-medium">Search learners<input maxLength={120} type="search" className={sectionInputClass} value={search} onChange={e => setSearch(e.target.value)} /></label> : <label className="block text-sm font-medium">Choose linked class<select aria-label="Choose linked class" required className={sectionInputClass} value={classId} onChange={e => { setClassId(e.target.value); setCandidates(null); setSelected([]); }}><option value="">Choose a class</option>{classes.map(c => <option key={c.id} value={c.id}>{c.subject} · {c.name}</option>)}</select></label>}
        {mode === 'class' && !classes.length && <p className="text-sm text-[#606861]">No linked classes yet. Add an existing learner or create one for this Section.</p>}
        <Button variant="secondary" disabled={mode === 'class' && !classId}>{pending ? 'Loading learners…' : mode === 'class' ? 'Load learners' : 'Search'}</Button>
      </fieldset></form>
      {candidates && <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm">{available.length} available learner{available.length === 1 ? '' : 's'}</p><Button variant="ghost" disabled={pending || !!review || !available.length} onClick={() => setSelected(allAvailableSelected ? [] : available.slice(0, 500).map(l => l.id))}>{allAvailableSelected ? 'Clear selection' : available.length > 500 ? 'Select first 500' : 'Select all'}</Button></div>
        {selected.length > 500 && <p role="alert" className="text-sm text-[#9B2C2C]">Choose up to 500 learners at a time.</p>}
        {hasMore && <p className="text-sm text-[#606861]">Showing the first 50 matches. Narrow your search to find another learner.</p>}
        {!candidates.length ? <p className="tc-group p-5">No learners found. Try another name or create a new learner.</p> : <ul className="tc-group tc-rows">{candidates.map(l => <li key={l.id}><label className="tc-row cursor-pointer"><input type="checkbox" className="size-5 shrink-0 accent-[#1A4D2E]" disabled={pending || !!review || memberIds.has(l.id)} checked={selected.includes(l.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, l.id] : ids.filter(id => id !== l.id))} /><span className="min-w-0"><span className="block font-medium wrap-anywhere">{l.display_name}</span>{l.classes?.map(c => <span key={c} className="mt-1 block text-xs text-[#606861] wrap-anywhere">{c}</span>)}{memberIds.has(l.id) ? <span className="block text-sm text-[#606861]">Already in this Section{members.find(m => m.id === l.id)?.status === 'inactive' ? ' · inactive; reactivate from Learners' : ''}</span> : possibleDuplicates.has(l.id) && <span className="block text-sm text-[#80571B]">Possible same-name record · review before adding</span>}</span></label></li>)}</ul>}
        <Button disabled={pending || !!review || !selected.length || selected.length > 500} onClick={reviewSelection}>Add selected{selected.length ? ` (${selected.length})` : ''}</Button>
      </div>}
    </>}
    {pending && <p role="status" className="text-sm">Working…</p>}
    {error && <p role="alert" className="text-sm text-[#9B2C2C]">{error}</p>}
    {message && <p role="status" className="text-sm text-[#1A4D2E]">{message}</p>}
    {!!duplicates.length && <div ref={warningRef} tabIndex={-1} role="region" aria-label="Possible duplicate review" className="tc-group space-y-3 p-5"><h2>Possible duplicate</h2><p className="text-sm">These names appear under different learner records. Review them before adding separate records.</p><ul className="space-y-3">{duplicates.map(d => <li key={d.id} className="text-sm"><p>Selected learner: <strong>{d.name}</strong></p><p>Existing Section or selected learner: {d.existing.join(', ')}</p></li>)}</ul><div className="flex flex-wrap gap-2"><Button disabled={pending} onClick={() => save(true)}>Keep separate</Button><Button variant="secondary" disabled={pending} onClick={() => { setReview(null); setDuplicates([]); setError(''); }}>Cancel</Button></div></div>}
    <ConfirmDialog open={!!review && !duplicates.length} pending={pending} title={mode === 'new' ? 'Create and add learner?' : 'Add selected learners?'} description={review?.description} confirmLabel={mode === 'new' ? 'Create and add' : 'Add learners'} onConfirm={() => save(false)} onCancel={() => setReview(null)} />
  </div>;
}
