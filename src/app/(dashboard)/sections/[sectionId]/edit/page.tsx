import { ownedSection } from '@/features/sections/data';
import { SectionForm } from '@/features/sections/section-form';
export default async function EditSectionPage({ params }: { params: Promise<{ sectionId: string }> }) {
  const { section } = await ownedSection((await params).sectionId);
  return <div className="space-y-4"><h2>Edit Section</h2><SectionForm section={section} /></div>;
}
