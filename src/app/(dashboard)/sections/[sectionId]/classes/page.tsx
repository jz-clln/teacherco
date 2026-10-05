import { ownedSection, sectionClasses } from '@/features/sections/data';
import { LinkedClasses } from '@/features/sections/class-links';
export default async function SectionClassesPage({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params;
  const [{ section }, classes] = await Promise.all([ownedSection(sectionId), sectionClasses(sectionId)]);
  return <LinkedClasses section={section} classes={classes} />;
}
