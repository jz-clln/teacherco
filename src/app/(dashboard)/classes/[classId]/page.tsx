import Link from "next/link";
import { notFound } from "next/navigation";
import { Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function ClassOverviewPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const supabase = await createClient();
  const { data: classroom } = await supabase.from("classes").select("id,name,subject,grade_level,school_year").eq("id", classId).single();
  if (!classroom) notFound();
  const { count } = await supabase.from("class_enrollments").select("id", { count: "exact", head: true }).eq("class_id", classId).eq("status", "active");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#4F6F52]">{classroom.grade_level} · {classroom.school_year}</p><h1 className="mt-1 text-3xl font-bold">{classroom.name}</h1><p className="mt-1 text-[#606861]">{classroom.subject}</p></div><Link href={`/classes/${classId}/records`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A4D2E] px-4 py-2 text-sm font-semibold text-white"><Upload size={18}/>Import record</Link></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Card><p className="text-sm text-[#606861]">Learners</p><p className="mt-2 text-3xl font-bold text-[#1A4D2E]">{count ?? 0}</p></Card><Card><p className="text-sm text-[#606861]">Class average</p><p className="mt-2 text-3xl font-bold">—</p></Card><Card><p className="text-sm text-[#606861]">Below benchmark</p><p className="mt-2 text-3xl font-bold">—</p></Card><Card><p className="text-sm text-[#606861]">Attendance</p><p className="mt-2 text-3xl font-bold">—</p></Card><Card className="bg-[#E8DFCA]/55"><p className="text-sm text-[#606861]">Lowest competency</p><p className="mt-2 text-lg font-bold">Import data first</p></Card></div>
      <div className="grid gap-4 lg:grid-cols-2"><Card><h2 className="text-lg font-semibold">Needs attention</h2><p className="mt-2 text-sm text-[#606861]">Transparent teacher rules and evidence-backed flags will appear here.</p></Card><Card><h2 className="text-lg font-semibold">Recent changes</h2><p className="mt-2 text-sm text-[#606861]">TeacherCo will compare record versions after your second import.</p></Card></div>
    </div>
  );
}
