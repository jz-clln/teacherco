import { sectionMembers, sectionClasses } from '@/features/sections/data';
import { SectionRoster } from '@/features/sections/roster-view';
export default async function SectionLearnersPage({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params, [members, classes] = await Promise.all([sectionMembers(sectionId), sectionClasses(sectionId)]);
  return <SectionRoster sectionId={sectionId} members={members} classes={classes} />;
}
