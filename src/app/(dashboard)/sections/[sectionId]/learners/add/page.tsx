import { ownedSection, sectionMembers, sectionClasses, readClassLearners } from '@/features/sections/data';
import { LearnerAdder } from '@/features/sections/learner-adder';
import { sectionLabel } from '@/features/sections/model';
export default async function AddSectionLearnersPage({ params, searchParams }: { params: Promise<{ sectionId: string }>; searchParams: Promise<{ class?: string; learner?: string }> }) {
  const { sectionId } = await params, [{ section, supabase }, members, classes] = await Promise.all([ownedSection(sectionId), sectionMembers(sectionId), sectionClasses(sectionId)]);
  const query = await searchParams;
  const selectedClass = classes.find(c => c.id === query.class);
  const initialLearners = selectedClass ? await readClassLearners(supabase, selectedClass.id) : null;
  return <div className="space-y-4"><h2>Add learner</h2><LearnerAdder key={`${sectionId}-${selectedClass?.id ?? ''}-${query.learner ?? ''}`} sectionId={sectionId} sectionName={sectionLabel(section)} members={members} classes={classes} initialClassId={selectedClass?.id} initialLearners={initialLearners} initialLearnerId={query.learner} /></div>;
}
