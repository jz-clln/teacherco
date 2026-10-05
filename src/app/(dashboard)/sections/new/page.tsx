import Link from 'next/link';
import { requireAccess } from '@/lib/auth/access-guard';
import { SectionForm } from '@/features/sections/section-form';
export const metadata = { title: 'New Section' };
export default async function NewSectionPage() {
  await requireAccess({ onboarded: true });
  return <div className="space-y-5"><Link className="tc-button tc-quiet px-0" href="/sections">‹ Sections</Link><h1>New Section</h1><p className="text-sm text-[#606861]">Create a learner group for one school year. You can add classes and learners later.</p><SectionForm /></div>;
}
