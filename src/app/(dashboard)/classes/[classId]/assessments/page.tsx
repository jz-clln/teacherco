import Link from "next/link";
import { ownedClass } from "@/features/classes/overview-data";
import { ClassTabs } from "@/features/classes/class-tabs";
import { getAssessmentsOverview } from "@/features/exams/queries";
import { AssessmentRow } from "@/features/exams/components/check-folders";

export default async function ClassAssessmentsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const { classroom } = await ownedClass(classId);
  // Reuse the existing teacher-scoped Check read and row destinations.
  const assessments = await getAssessmentsOverview().then(rows => rows.filter(row => row.classId === classId));
  return <div className="space-y-6">
    <Link href={`/classes/${classId}`} className="tc-button tc-quiet px-0">← Class overview</Link>
    <header className="flex flex-wrap items-center justify-between gap-4"><div className="min-w-0"><p className="text-sm text-[#606861] break-words">{classroom.name}</p><h1 className="mt-1">Assessments</h1></div><Link href={`/check/new?classId=${classId}`} className="tc-button tc-primary">New assessment</Link></header>
    <ClassTabs classId={classId} />
    <div className="flex flex-wrap gap-3"><Link className="tc-button tc-secondary" href={`/classes/${classId}/scores`}>Record scores</Link><Link className="tc-button tc-quiet" href={`/classes/${classId}/term-grades`}>Term grades</Link></div>
    {assessments.length ? <ul className="tc-group tc-rows">{assessments.map(a => <AssessmentRow key={a.id} a={a} />)}</ul> : <div className="tc-group p-5"><h2>No assessments yet</h2><p className="mt-2 text-[#606861]">Create an assessment, record scores, or import your class record to get started.</p></div>}
  </div>;
}
