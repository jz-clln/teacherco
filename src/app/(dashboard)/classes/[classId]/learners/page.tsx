import { ClassTabs } from "@/features/classes/class-tabs";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { AddStudentDialog } from "@/features/learners/add-student-dialog";
import { DeleteStudentButton } from "@/features/learners/delete-student-button";
import { ownedClass, classRoster } from "@/features/classes/overview-data";
import { overviewLink } from "@/features/classes/overview-view";

export default async function ClassLearnersPage({ params, searchParams }: { params: Promise<{ classId: string }>; searchParams: Promise<{ error?: string; added?: string; removed?: string }> }) {
  const { classId } = await params;
  const { classroom } = await ownedClass(classId);
  const { error, added, removed } = await searchParams;
  const learners = await classRoster(classId).catch(() => null);
  return <div className="space-y-5"><Link href={`/classes/${classId}`} className={overviewLink}>← Class overview</Link>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="break-words text-sm text-[#606861]">{classroom.name}</p><h1 className="text-2xl font-bold">Learners</h1></div><AddStudentDialog key={`${added ?? ""}|${error ?? ""}`} classId={classId} error={error} /></div>
    <ClassTabs classId={classId} />
    {(added || removed) && <p role="status" className="rounded-xl bg-[#EAF0EA] p-3 text-sm">{added ? `${added} was added to this class.` : `${removed} was removed.`}</p>}
    <Card>{learners === null ? <p role="alert">Learners could not be loaded. Refresh to try again.</p> : !learners.length ? <p className="text-sm text-[#606861]">No learners yet. Add a learner or <Link className={overviewLink} href={`/classes/${classId}/records`}>import your class record</Link>.</p> : <><p className="mb-2 text-xs text-[#606861]">{learners.length} active learners</p><ul className="divide-y divide-[#E3E5E1]">{learners.map(l => <li key={l.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words text-sm font-medium">{l.name}</p><p className="mt-1 text-xs text-[#606861]">Added {new Date(l.addedAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}</p></div><DeleteStudentButton classId={classId} learnerId={l.id} name={l.name} /></li>)}</ul></>}</Card>
  </div>;
}
