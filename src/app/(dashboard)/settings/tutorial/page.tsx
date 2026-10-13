import { requireAccess } from '@/lib/auth/access-guard';
import { createClient } from '@/lib/supabase/server';
import { AppTutorial } from '@/features/tutorial/app-tutorial';

export const metadata = { title: 'TeacherCo tutorial' };

export default async function TutorialPage() {
  const { user } = await requireAccess({ onboarded: true });
  const db = await createClient();
  const [classes, sections] = await Promise.all([
    db.from('classes').select('id,name,subject').eq('teacher_id', user.id).order('created_at', { ascending: false }),
    db.from('sections').select('id,name,grade_level').eq('teacher_id', user.id).order('created_at', { ascending: false }),
  ]);
  return <AppTutorial classes={classes.data ?? []} sections={sections.data ?? []} loadError={Boolean(classes.error || sections.error)} />;
}
