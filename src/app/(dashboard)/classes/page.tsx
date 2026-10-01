import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Classes" };

export default async function ClassesPage() {
  const supabase = await createClient();
  const { data: classes } = await supabase.from("classes").select("id,name,subject,grade_level,school_year,created_at").order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4"><div><p className="text-sm font-medium text-[#4F6F52]">CLASSES</p><h1 className="mt-1 text-3xl font-bold">Your classrooms</h1></div><Link href="/classes/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A4D2E] px-4 py-2 text-sm font-semibold text-white"><Plus size={18}/>New class</Link></div>
      {!classes?.length ? <Card><h2 className="font-semibold">No classes yet</h2><p className="mt-2 text-sm text-[#606861]">Create a class, then import the Excel record you already use.</p></Card> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{classes.map((item) => <Link key={item.id} href={`/classes/${item.id}`}><Card className="h-full transition hover:-translate-y-0.5 hover:shadow-lg"><p className="text-xs font-semibold uppercase tracking-wide text-[#4F6F52]">{item.grade_level}</p><h2 className="mt-2 text-xl font-bold">{item.name}</h2><p className="mt-1 text-sm text-[#606861]">{item.subject} · {item.school_year}</p></Card></Link>)}</div>
      )}
    </div>
  );
}
