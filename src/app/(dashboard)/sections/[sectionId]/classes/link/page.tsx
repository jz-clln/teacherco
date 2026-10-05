import { ownedSection, classChoices } from '@/features/sections/data';
import { ClassLinkChoices } from '@/features/sections/class-links';
export default async function LinkClassPage({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params;
  const [{ section }, classes] = await Promise.all([ownedSection(sectionId), classChoices(sectionId)]);
  return <div className="space-y-4"><h2>Link a class</h2><ClassLinkChoices section={section} classes={classes} /></div>;
}
