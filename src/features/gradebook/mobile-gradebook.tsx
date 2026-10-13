'use client';

import { useState } from 'react';
import { Select } from '@/components/ui/select';
import type { GradebookData } from './data';
import { cellKey, gradeText } from './model';

type Props = Pick<GradebookData, 'learners' | 'subjects' | 'periods' | 'entries'>;

export function MobileGradebook({ learners, subjects, periods, entries }: Props) {
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0]?.id ?? '');
  const period = periods.find(item => item.id === selectedPeriod) ?? periods[0];
  const byCell = new Map(entries.map(entry => [cellKey(entry.learner_id, entry.section_subject_id, entry.period_id), entry]));

  return <section aria-label="Mobile learner grades" className="min-w-0 space-y-3 md:hidden">
    <Select name="mobile-grade-period" label="Show grades for" value={period?.id ?? ''} onChange={setSelectedPeriod} options={periods.map(item => ({ value: item.id, label: `${item.label}${item.status === 'inactive' ? ' (Inactive)' : ''}` }))} />
    {!period && <p className="text-sm text-[#606861]">No active periods. Show inactive periods or manage periods to view grades.</p>}
    {learners.map(learner => <article key={learner.id} className="min-w-0 rounded-xl border border-[#E3E5E1] bg-white p-4">
      <h3 className="break-words text-sm font-semibold text-[#28332B]">{learner.display_name}{learner.status === 'inactive' ? ' (Inactive)' : ''}</h3>
      <p className="mt-1 text-xs text-[#606861]">{period?.label ?? 'No period selected'}</p>
      <dl className="mt-3 divide-y divide-[#E3E5E1]">
        {subjects.map(subject => <div key={subject.id} className="flex items-start justify-between gap-3 py-2">
          <dt className="min-w-0 break-words text-sm">{subject.name}{subject.status === 'inactive' ? ' (Inactive)' : ''}</dt>
          <dd className="shrink-0 rounded-md bg-[#F4F7F4] px-2 py-1 text-sm font-semibold tabular-nums text-[#1A4D2E]">{period ? gradeText(byCell.get(cellKey(learner.id, subject.id, period.id))?.grade) : '—'}</dd>
        </div>)}
      </dl>
      {!subjects.length && <p className="mt-3 text-sm text-[#606861]">No active subjects.</p>}
      {!!subjects.length && !!periods.length && <details className="group mt-2 border-t border-[#E3E5E1]">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-xs font-semibold text-[#1A4D2E] focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">View all periods +</span><span className="hidden group-open:block">Hide all periods −</span>
        </summary>
        <div className="space-y-4 pb-1">
          {subjects.map(subject => <div key={subject.id}>
            <p className="break-words text-sm font-medium">{subject.name}{subject.status === 'inactive' ? ' (Inactive)' : ''}</p>
            <dl className="mt-2 grid grid-cols-2 gap-2">
              {periods.map(item => <div key={item.id} className="min-w-0 rounded-lg bg-[#F4F7F4] p-2">
                <dt className="break-words text-xs text-[#606861]">{item.label}{item.status === 'inactive' ? ' (Inactive)' : ''}</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums">{gradeText(byCell.get(cellKey(learner.id, subject.id, item.id))?.grade)}</dd>
              </div>)}
            </dl>
          </div>)}
        </div>
      </details>}
    </article>)}
  </section>;
}
