import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listSyncVersions } from "@/features/records/sync-actions";
import { RecordSync } from "@/features/records/record-sync";

export default async function RecordSyncPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const db = await createClient();
  const { data: classroom } = await db.from("classes").select("id,name").eq("id", classId).maybeSingle();
  if (!classroom) notFound();
  const history = await listSyncVersions(classId);
  return <div className="mx-auto max-w-4xl space-y-6">
    <Link href={`/classes/${classId}/records`} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4F6F52]"><ArrowLeft size={16} />Back to class records</Link>
    <div><p className="text-sm font-medium text-[#4F6F52]">{classroom.name} · Class record sync</p><h1 className="mt-1 text-3xl font-bold">Keep your class record up to date</h1><p className="mt-2 text-[#606861]">Keep working in Excel. Upload your updated record, review what changed, then save it to TeacherCo.</p></div>
    <RecordSync classId={classId} className={classroom.name} initialVersions={history.ok ? history.data : []} historyError={history.ok ? undefined : history.error} />
  </div>;
}
