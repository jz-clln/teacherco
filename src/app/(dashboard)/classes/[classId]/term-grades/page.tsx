import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getClassTermGrades } from "@/features/grading/queries";
import { TermGradesTable } from "@/features/grading/term-grades-table";

export const metadata = { title: "Term grades" };

export default async function TermGradesPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const supabase = await createClient();
  const classroom = await getClassTermGrades(supabase, classId);
  if (!classroom) notFound();

  return (
    <div className="space-y-5">
      <Link href={`/classes/${classroom.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4F6F52] hover:underline">
        <ArrowLeft size={16} /> Back to class
      </Link>
      <TermGradesTable classroom={classroom} />
    </div>
  );
}
