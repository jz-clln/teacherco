import { sectionGradebook } from '@/features/gradebook/data';
import { createHash } from 'node:crypto';
import { SectionGradebook } from '@/features/gradebook/gradebook';
export default async function GradesPage({ params }: { params:Promise<{ sectionId:string }> }) {
  const { sectionId } = await params;
  const book = await sectionGradebook(sectionId);
  // Reset configuration drafts after setup/roster changes, without interrupting
  // a newly opened import panel when a grade-save refresh finishes arriving.
  const version = createHash('sha256').update(JSON.stringify({ periods:book.periods,subjects:book.subjects,status:book.section.status,learners:book.learners })).digest('hex');
  return <SectionGradebook key={version} book={book}/>;
}
