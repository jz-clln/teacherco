'use client';
import { useState } from 'react';
import type { Section } from '@/types/domain';
import { archiveSection, deleteSection, reactivateSection } from './actions';
import { SectionActionButton } from './action-button';
import { sectionInputClass, sectionLabel } from './model';

export function SectionLifecycle({ section, classCount }: { section: Section; classCount: number }) {
  const [confirmation, setConfirmation] = useState('');
  return <details className="tc-group p-4"><summary className="flex min-h-11 cursor-pointer items-center font-medium">More Section actions</summary>
    <div className="mt-3 space-y-4">
      <SectionActionButton label={section.status === 'active' ? 'Archive Section' : 'Reactivate Section'} title={`${section.status === 'active' ? 'Archive' : 'Reactivate'} ${sectionLabel(section)}?`} description="The learner roster, linked classes and their records will stay unchanged." action={() => section.status === 'active' ? archiveSection(section.id) : reactivateSection(section.id)} />
      <div className="border-t border-[#E3E5E1] pt-4"><h2 className="font-semibold">Delete Section</h2>
        {classCount ? <p className="mt-2 text-sm text-[#606861]">This Section still has linked classes. Unlink them before deleting the Section.</p> : <>
          <p className="my-2 text-sm text-[#606861]">Section memberships and all Grade Book periods, subjects and reviewed grades will be permanently removed. Archive the Section to keep these records. Learner profiles and classes will not be deleted.</p>
          <label className="block max-w-md text-sm">Type “{section.name}” to confirm<input className={sectionInputClass} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
          {confirmation === section.name && <SectionActionButton label="Delete Section" title={`Delete ${sectionLabel(section)}?`} description="This permanently removes this Section, its memberships and all reviewed Grade Book data. Archive instead to preserve grades. Learner profiles and classes will stay unchanged." destructive action={() => deleteSection({ sectionId: section.id, confirmation })} destination="/sections" />}
        </>}
      </div>
    </div>
  </details>;
}
