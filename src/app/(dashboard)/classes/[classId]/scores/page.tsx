// src/app/(dashboard)/classes/[classId]/scores/page.tsx

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { NewActivityForm } from "@/features/scores/new-activity-form";
import { ScoreSheet, type ScoreRow } from "@/features/scores/score-sheet";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export const metadata = { title: "Record scores" };

export default async function RecordScoresPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ a?: string }>;
}) {
  const { classId } = await params;
  const { a } = await searchParams;
  if (!z.string().uuid().safeParse(classId).success) notFound();

  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: classroom } = await supabase.from("classes").select("id, name, subject").eq("id", classId).maybeSingle();
  if (!classroom) notFound();

  const [{ data: manual }, { count: lockedCount }] = await Promise.all([
    supabase
      .from("assessments")
      .select("id, title, total_points")
      .eq("class_id", classId)
      .eq("source", "manual")
      .order("created_at"),
    supabase
      .from("assessments")
      .select("id", { count: "exact", head: true })
      .eq("class_id", classId)
      .neq("source", "manual"),
  ]);

  const activities = manual ?? [];
  const selected = activities.find((item) => String(item.id) === a) ?? activities[activities.length - 1] ?? null;

  let rows: ScoreRow[] = [];
  if (selected) {
    const [{ data: enrollments }, { data: saved }] = await Promise.all([
      supabase
        .from("class_enrollments")
        .select("learner:learners(id, display_name)")
        .eq("class_id", classId)
        .eq("status", "active")
        .limit(1000),
      supabase.from("submissions").select("learner_id, score").eq("assessment_id", selected.id).limit(2000),
    ]);

    const scoreByLearner = new Map<string, number>();
    for (const row of saved ?? []) {
      const score = row.score == null ? null : Number(row.score);
      if (score != null && Number.isFinite(score)) scoreByLearner.set(String(row.learner_id), score);
    }

    rows = (enrollments ?? [])
      .flatMap((enrollment) => {
        const learner = Array.isArray(enrollment.learner) ? enrollment.learner[0] : enrollment.learner;
        return learner?.id
          ? [{ id: String(learner.id), name: String(learner.display_name), score: scoreByLearner.get(String(learner.id)) ?? null }]
          : [];
      })
      .sort((x, y) => x.name.localeCompare(y.name));
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href={`/classes/${classId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4F6F52] hover:underline">
        <ArrowLeft size={16} /> Back to class
      </Link>

      <div>
        <p className="text-sm font-medium text-[#4F6F52]">Record scores</p>
        <h1 className="mt-1 text-3xl font-bold">{classroom.name}</h1>
        <p className="mt-1 text-[#606861]">{classroom.subject}</p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#606861]">
          For activities with no answer sheet or Excel column, such as oral recitations. Reports and class averages include these scores
          automatically.
        </p>
      </div>

      <Card className="sm:p-6">
        <h2 className="font-semibold text-[#1E2420]">New activity</h2>
        <div className="mt-5">
          <NewActivityForm key={selected ? String(selected.id) : "none"} classId={classId} />
        </div>
      </Card>

      {activities.length > 0 ? (
        <div className="space-y-4">
          {/* Only needed to switch between activities. With one, the title is already in the card below. */}
          {activities.length > 1 ? (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Activities">
              {activities.map((item) => {
                const active = selected != null && String(item.id) === String(selected.id);
                return (
                  <Link
                    key={String(item.id)}
                    href={`/classes/${classId}/scores?a=${item.id}`}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "rounded-full bg-[#1A4D2E] px-3.5 py-2 text-sm font-semibold text-white"
                        : "rounded-full border border-[#E3E5E1] bg-white px-3.5 py-2 text-sm font-medium text-[#1A4D2E] hover:bg-[#F5F6F4]"
                    }
                  >
                    {String(item.title)}
                  </Link>
                );
              })}
            </div>
          ) : null}

          {selected ? (
            <ScoreSheet
              key={String(selected.id)}
              assessmentId={String(selected.id)}
              title={String(selected.title)}
              total={Number(selected.total_points)}
              learners={rows}
            />
          ) : null}
        </div>
      ) : (
        <Card className="text-center">
          <p className="py-6 text-sm text-[#606861]">No typed-in activities yet. Create one above to start recording scores.</p>
        </Card>
      )}

      {(lockedCount ?? 0) > 0 ? (
        <p className="text-xs leading-5 text-[#8B928C]">
          {lockedCount} other {lockedCount === 1 ? "activity comes" : "activities come"} from your Excel record or the Check screen, so{" "}
          {lockedCount === 1 ? "it is" : "they are"} not editable here. Fix those in your workbook and import again, or on the Check
          screen.
        </p>
      ) : null}
    </div>
  );
}