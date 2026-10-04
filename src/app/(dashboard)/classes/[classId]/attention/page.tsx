import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ownedClass, currentOverview } from "@/features/classes/overview-data";
import { ATTENTION_RULES } from "@/features/classes/insights";
import { overviewLink } from "@/features/classes/overview-view";

export default async function ClassAttentionPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const { classroom } = await ownedClass(classId);
  const { insights } = await currentOverview(classId);
  return <div className="space-y-5"><Link href={`/classes/${classId}`} className={overviewLink}>← Class overview</Link><div><p className="text-sm text-[#606861]">{classroom.name}</p><h1 className="text-2xl font-bold">Needs attention</h1></div>
    <p className="text-sm leading-6 text-[#606861]">Existing class rules: score average below {classroom.benchmark}%, {ATTENTION_RULES.streak} consecutive recorded absences, or attendance below {ATTENTION_RULES.lowAttendance}% across the latest {ATTENTION_RULES.recentDays} recorded days (at least {ATTENTION_RULES.minDaysForRate} counted days). Attendance checks look back 60 calendar days; excused days do not count toward the attendance rate.</p>
    <Card>{!insights ? <p role="status">Attention checks could not be loaded. Refresh to try again.</p> : !insights.attention.length ? <p className="text-sm text-[#606861]">No concerns found in available scores and recent attendance.</p> : <ul className="divide-y divide-[#E3E5E1]">{insights.attention.map(item => <li key={item.learnerId} className="py-3"><h2 className="break-words font-semibold">{item.name}</h2><ul className="mt-1 space-y-1 text-sm text-[#606861]">{item.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></li>)}</ul>}</Card>
    <div className="flex flex-wrap gap-5"><Link href={`/classes/${classId}/term-grades`} className={overviewLink}>Review grades</Link><Link href={`/classes/${classId}/attendance`} className={overviewLink}>Review attendance</Link></div>
  </div>;
}
