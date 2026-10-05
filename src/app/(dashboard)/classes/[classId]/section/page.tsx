import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ownedClass } from '@/features/classes/overview-data';
import { requireAccess } from '@/lib/auth/access-guard';
import { listSections, readClassSummary } from '@/features/sections/data';
import { ClassSectionPicker } from '@/features/sections/class-section-picker';
export default async function ClassSectionPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  await ownedClass(classId);
  const { supabase, user } = await requireAccess({ onboarded: true });
  const [sections, classroom] = await Promise.all([listSections(), readClassSummary(supabase, user.id, classId)]);
  if (!classroom) notFound();
  return <div className="space-y-5 wrap-anywhere"><Link className="tc-button tc-quiet px-0" href={`/classes/${classId}`}>‹ Back to class</Link><h1>{classroom.subject}</h1><p className="text-sm text-[#606861]">{classroom.name} · {classroom.grade_level} · SY {classroom.school_year}</p><ClassSectionPicker classroom={classroom} sections={sections} /></div>;
}
