import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listSyncVersions, readSyncVersionHeader, type SyncVersion } from "@/features/records/sync-actions";
import { RecordSync } from "@/features/records/record-sync";

export default async function RecordSyncPage({ params, searchParams }: { params: Promise<{ classId: string }>; searchParams: Promise<{ version?: string }> }) {
  const { classId } = await params;
  const { version } = await searchParams;
  const db = await createClient();
  const { data: classroom } = await db.from("classes").select("id,name").eq("id", classId).maybeSingle();
  if (!classroom) notFound();
  const history = await listSyncVersions(classId);
  const versions = history.ok ? history.data : [];
  let versionError: string | undefined;
  let focusedVersion: SyncVersion | undefined;
  if (version && !versions.some(v => v.id === version)) {
    const requested = await readSyncVersionHeader(classId, version);
    if (requested.ok) focusedVersion = requested.data;
    else versionError = requested.error;
  }
  return <div className="min-w-0 w-full space-y-6">
    <Link href={`/classes/${classId}/records`} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4F6F52]"><ArrowLeft size={16} />Back to class records</Link>
    <div><p className="text-sm font-medium text-[#4F6F52]">{classroom.name} · Class record sync</p><h1 className="mt-1 text-3xl font-bold">Keep your class record up to date</h1><p className="mt-2 text-[#606861]">Keep working in Excel. Upload your updated record, review what changed, then save it to TeacherCo.</p></div>
    {versionError && <p role="status" className="text-sm text-[#606861]">{versionError}</p>}
    <RecordSync classId={classId} className={classroom.name} initialVersions={versions} focusedVersion={focusedVersion} initialOpenVersion={versions.some(v => v.id === version) || focusedVersion ? version : undefined} historyError={history.ok ? undefined : history.error} />
  </div>;
}
