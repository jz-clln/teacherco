import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Today" };

export default async function TodayPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const firstName = String(user?.user_metadata?.full_name ?? "Teacher").split(" ")[0];

  return (
    <div className="space-y-6">
      <div><p className="text-sm font-medium text-[#4F6F52]">TODAY</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Good day, {firstName} 👋</h1><p className="mt-2 text-[#606861]">Once your first class is imported, important classroom changes will appear here.</p></div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><p className="text-sm text-[#606861]">Needs attention</p><p className="mt-3 text-3xl font-bold text-[#1A4D2E]">—</p><p className="mt-2 text-sm text-[#8B928C]">No class data yet</p></Card>
        <Card><p className="text-sm text-[#606861]">Recent change</p><p className="mt-3 text-lg font-semibold">Import a class record</p><p className="mt-2 text-sm text-[#8B928C]">TeacherCo will compare future versions.</p></Card>
        <Card className="bg-[#E8DFCA]/55"><p className="text-sm text-[#606861]">Next step</p><p className="mt-3 text-lg font-semibold">Create your first class</p><p className="mt-2 text-sm text-[#606861]">Then import the Excel record you already use.</p></Card>
      </div>
    </div>
  );
}
