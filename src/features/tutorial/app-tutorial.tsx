'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { ArrowLeft, BookOpen, ChevronDown } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { TutorialScreenshot } from './tutorial-screenshot';
import { sectionLabel } from '@/features/sections/model';

type Props = {
  classes: { id: string; name: string; subject: string }[];
  sections: { id: string; name: string; grade_level: string }[];
  loadError: boolean;
};
function GuideLink({ href, children }: { href: string; children: ReactNode }) {
  const style = 'font-semibold text-[#1A4D2E] underline decoration-[#4F6F52]/50 underline-offset-4 hover:decoration-[#1A4D2E] focus-visible:outline-2 focus-visible:outline-offset-4';
  return href.endsWith('.html') ? <a href={href} className={style}>{children}</a> : <Link href={href} className={style}>{children}</Link>;
}

export function AppTutorial({ classes, sections, loadError }: Props) {
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? '');
  const classPage = (suffix = '') => classId ? `/classes/${classId}${suffix}` : '/classes/new';
  const sectionPage = (suffix = '') => sectionId ? `/sections/${sectionId}${suffix}` : '/sections/new';
  const chapters: { id: string; title: string; intro: string; steps: ReactNode[]; tip: string }[] = [
    { id: 'start', title: 'Set up your workspace', intro: 'Start with your school details and understand how classes and Sections work together.', steps: [
      <>Review your name and school in <GuideLink href="/settings#profile">Profile settings</GuideLink>, then choose your language in <GuideLink href="/settings#language">Language settings</GuideLink>.</>,
      <>A class holds one subject’s records, attendance, and scores. <GuideLink href="/classes/new">Create a class</GuideLink> with the correct subject, grade level, and school year.</>,
      <>A Section brings the learner group and its subjects together for the Grade Book and report cards. <GuideLink href="/sections/new">Create a Section</GuideLink>, then <GuideLink href={sectionPage('/classes')}>{sectionId ? 'open its linked classes' : 'create your first Section to link classes'}</GuideLink>. Review the roster before linking.</>,
    ], tip: 'Use consistent school years and grade levels so classes can connect to the right Section.' },
    { id: 'records', title: 'Bring in learners and class records', intro: 'Use your existing records and review what TeacherCo detects before saving.', steps: [
      <>Open <GuideLink href={classPage('/records')}>{classId ? 'Import class record' : 'Create your first class'}</GuideLink>. Upload the Excel class record and review the detected learners and score columns.</>,
      <>Check names and duplicates in <GuideLink href={classPage('/learners')}>{classId ? 'Class learners' : 'Class setup'}</GuideLink>. Use the <GuideLink href={sectionPage('/learners')}>{sectionId ? 'Section roster' : 'Section setup'}</GuideLink> to manage membership across subjects.</>,
      <>When your workbook changes, use <GuideLink href={classPage('/records/sync')}>{classId ? 'Sync updated record' : 'Class setup'}</GuideLink> to review the changes before applying them. Keep the correct class selected.</>,
    ], tip: 'Review imports before confirming. A clean learner roster makes grades, reports, and attendance easier to manage.' },
    { id: 'attendance', title: 'Log attendance', intro: 'Record attendance for the selected class and date.', steps: [
      <>Open <GuideLink href={classPage('/attendance')}>{classId ? 'Attendance' : 'Create a class for attendance'}</GuideLink> and check the date before marking learners.</>,
      <>Review the learner statuses and save. If you are offline, check the waiting-to-sync count after saving.</>,
      <>Visit <GuideLink href="/today">Today</GuideLink> to review your classroom day and learners who may need attention.</>,
    ], tip: 'Before leaving an internet connection, make sure the class roster is available on the device you will use.' },
    { id: 'scores', title: 'Enter scores and understand term grades', intro: 'Class term grades are calculated from recorded scores and grading rules.', steps: [
      <>Use <GuideLink href={classPage('/scores')}>{classId ? 'Manual scores' : 'Class setup'}</GuideLink> to record assessment scores. Check the activity, term, grading component, and maximum score.</>,
      <>Review <GuideLink href={classId ? `/settings?class=${classId}#grading` : '/settings#grading'}>Grading rules</GuideLink>, including weights and grade conversion, before relying on the results.</>,
      <>Open <GuideLink href={classPage('/term-grades')}>{classId ? 'Term grades' : 'Class setup'}</GuideLink> and choose a term. On mobile, search for a learner and expand their card for component scores and workbook comparison.</>,
      <>If a grade is missing or differs from the workbook, review the source scores, component assignments, calculation notes, and grading rules.</>,
    ], tip: 'A calculated class term grade and a saved Section Grade Book grade are separate. Review and import the class result into the Grade Book when ready.' },
    { id: 'gradebook', title: 'Manage the Section Grade Book', intro: 'Keep each learner’s saved grades together across subjects and periods.', steps: [
      <>Open the <GuideLink href={sectionPage('/grades')}>{sectionId ? 'Grade Book' : 'Section setup'}</GuideLink>. Use Manage periods & subjects to match your school’s reporting structure.</>,
      <>Choose Enter grades for manual entry, or Import / Refresh from Class for grades from a linked class. Check the subject, period, and source before confirming.</>,
      <>On mobile, search by name and choose the period to show. Each learner’s card lists subject grades; View all periods expands the full breakdown.</>,
      <>Review your changes before saving. After updating class scores, refresh the corresponding Grade Book grades if you want those changes included.</>,
    ], tip: 'Missing grades are different from zero. Leave a value blank when a grade is not yet available.' },
    { id: 'check', title: 'Check assessments', intro: 'Set up the assessment and answer key before recording results.', steps: [
      <>Go to <GuideLink href={classId ? `/check/new?classId=${classId}` : '/check/new'}>New assessment</GuideLink>, choose the class, and complete the assessment details.</>,
      <>Enter and review the answer key. Scores are based on your confirmed key.</>,
      <>Open the assessment from <GuideLink href="/check">Check</GuideLink>, follow the answer-sheet capture or upload steps, and review detected answers and learner matches before confirming scores.</>,
    ], tip: 'Use a clear, well-lit image of the complete answer sheet, and review uncertain answers instead of accepting them automatically.' },
    { id: 'report-cards', title: 'Prepare and print report cards', intro: 'Connect a workbook template to your Section’s reviewed grades.', steps: [
      <>Upload your original Excel layout in <GuideLink href="/report-cards/templates/new">Upload report card template</GuideLink>. Find uploaded workbooks in <GuideLink href="/report-cards/templates">Report card templates</GuideLink>.</>,
      <>Open the template’s mapping workspace. Map learner information, subject rows, and periods to the correct cells, then save the mapping.</>,
      <>Open <GuideLink href={sectionPage('/report-cards')}>{sectionId ? 'Section report cards' : 'Section setup'}</GuideLink>. Choose the template, match subjects and terms, confirm the matches, and save.</>,
      <>Preview the learner’s card and check all names and grades. Download the workbook or print. The print controls offer A4 and Short / Letter, with fit options to keep the card on the page.</>,
      <>For offline use, prepare the report cards with Save for offline while connected. Use <GuideLink href="/offline-workspace.html">Offline workspace</GuideLink> to generate them from the saved template and available local grades.</>,
    ], tip: 'Review the full print preview, including the bottom of the form. Use a device with the template’s fonts installed for the closest appearance.' },
    { id: 'insights', title: 'Use reports, Ask, and attention checks', intro: 'Turn reviewed classroom records into useful summaries and follow-up actions.', steps: [
      <>Open <GuideLink href="/reports">Reports</GuideLink> to prepare a Class Performance Summary or Learner Progress Summary. Select the correct class and learner where needed.</>,
      <>Use <GuideLink href="/ask">Ask</GuideLink> for questions about your confirmed records. Review the supporting information before making decisions.</>,
      <>Check <GuideLink href={classPage('/attention')}>{classId ? 'Needs attention' : 'Class setup'}</GuideLink> and adjust thresholds in <GuideLink href="/settings#attention">Attention rules</GuideLink> to suit your classroom.</>,
      <>Review <GuideLink href="/settings#ai">AI & privacy</GuideLink> to control AI use and notes. AI assists with wording and explanation; teachers remain responsible for reviewing results.</>,
    ], tip: 'After each assessment, review attention checks and use the results to plan follow-up support.' },
    { id: 'offline', title: 'Prepare for working offline', intro: 'Prepare on the same device and browser before losing your connection.', steps: [
      <>While online, open <GuideLink href="/offline-workspace.html">Offline workspace</GuideLink> and check that the classes, learners, and records you need are available. Review cached records and waiting items in <GuideLink href="/settings#offline">Offline settings</GuideLink>.</>,
      <>Use the offline workspace for classes, learners, attendance, and grades. Prepare report-card templates online first if you will need offline generation or printing.</>,
      <>Reconnect and keep TeacherCo open while saved changes sync. Check the pending count and resolve any reported conflicts before treating the cloud copy as up to date.</>,
      <>AI features require internet. Keep unsynced records on the device and avoid clearing browser storage or the offline cache while work is waiting to upload.</>,
    ], tip: 'Test the offline workspace before a school day without internet. Cached records on one device are not automatically available on another.' },
    { id: 'account', title: 'Protect your work and manage access', intro: 'Keep your account, saved records, and exports under your control.', steps: [
      <>Use <GuideLink href={classPage('/export')}>{classId ? 'Class export' : 'Class setup'}</GuideLink> and <GuideLink href="/settings#data">Data & storage</GuideLink> to review export and retention options. Read deletion confirmations carefully.</>,
      <>Manage your password and sign out from <GuideLink href="/settings#account">Account settings</GuideLink>. Sync pending offline work before switching accounts or devices.</>,
      <>If timed access expires, records remain readable. Follow the renewal banner to redeem another invite code and restore editing.</>,
      <>Read the <GuideLink href="/legal/privacy">Privacy Notice</GuideLink> and <GuideLink href="/legal/terms">Terms</GuideLink> when reviewing how the service handles your information.</>,
    ], tip: 'A useful routine: check Today, log attendance, update scores, review grades, then confirm that your work has synced.' },
  ];

  return <div className="min-w-0 space-y-6">
    <Link href="/settings#tutorial" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#1A4D2E]"><ArrowLeft size={16} aria-hidden />Back to Settings</Link>
    <header><p className="mb-2 flex items-center gap-2 text-sm font-medium text-[#4F6F52]"><BookOpen size={18} aria-hidden />TEACHERCO GUIDE</p><h1 className="text-2xl font-bold sm:text-3xl">Make the most of TeacherCo</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#606861]">Start at the beginning or jump to the task you need. Green underlined text opens the relevant page in your workspace.</p></header>
    <section className="tc-group space-y-4 p-4 sm:p-5" aria-labelledby="tutorial-context"><h2 id="tutorial-context" className="text-base font-semibold">Choose where tutorial links take you</h2><p className="text-sm text-[#606861]">Choose your class and Section so links open their exact pages. These choices only change tutorial links.</p>
      {loadError && <p role="status" className="text-sm text-[#606861]">Some classroom choices could not be loaded. Refresh this page to try again.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {classes.length ? <Select name="tutorial-class" label="Class" value={classId} onChange={setClassId} options={classes.map(item => ({ value: item.id, label: `${item.name} · ${item.subject}` }))} /> : <p className="text-sm">No class available. <GuideLink href="/classes/new">Create your first class</GuideLink>.</p>}
        {sections.length ? <Select name="tutorial-section" label="Section" value={sectionId} onChange={setSectionId} options={sections.map(item => ({ value: item.id, label: sectionLabel(item) }))} /> : <p className="text-sm">No Section available. <GuideLink href="/sections/new">Create your first Section</GuideLink>.</p>}
      </div>
    </section>
    <nav aria-label="Tutorial topics" className="grid gap-2 sm:grid-cols-2">{chapters.map((chapter, index) => <a href={`#${chapter.id}`} onClick={() => { const topic = document.getElementById(chapter.id); if (topic instanceof HTMLDetailsElement) topic.open = true; }} key={chapter.id} className="inline-flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[#1A4D2E] hover:bg-[#EAF0EA] focus-visible:outline-2"><span className="text-xs text-[#606861]">{String(index + 1).padStart(2, '0')}</span>{chapter.title}</a>)}</nav>
    <div className="space-y-3">{chapters.map((chapter, index) => <details key={chapter.id} id={chapter.id} className="tc-group group scroll-mt-6" open={index === 0}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 focus-visible:outline-2 [&::-webkit-details-marker]:hidden"><h2 className="text-base font-semibold">{index + 1}. {chapter.title}</h2><ChevronDown size={18} aria-hidden className="shrink-0 transition group-open:rotate-180" /></summary>
      <div className="space-y-4 px-4 pb-5 sm:px-5"><p className="text-sm leading-6 text-[#606861]">{chapter.intro}</p><TutorialScreenshot topic={chapter.id} title={chapter.title} /><ol className="list-decimal space-y-3 pl-5 text-sm leading-7">{chapter.steps.map((step, stepIndex) => <li key={stepIndex} className="pl-1">{step}</li>)}</ol><p className="rounded-xl bg-[#EAF0EA] p-3 text-sm leading-6 text-[#1A4D2E]"><strong>Make it a habit: </strong>{chapter.tip}</p></div>
    </details>)}</div>
  </div>;
}
