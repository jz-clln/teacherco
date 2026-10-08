// src/app/(dashboard)/classes/new/page.tsx

import { sectionAccess } from "@/features/sections/action-helpers";
import { readSubjectOptions } from "@/features/classes/subject-options";
import { CreateClassForm } from "@/features/classes/create-class-form";
import { Select } from "@/components/ui/select";

export const metadata = { title: "New class" };

const GRADES = ["Kindergarten", ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)];



export default async function NewClassPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const {supabase,user}=await sectionAccess();
  const subjects=await readSubjectOptions(supabase,user.id);
  return (
    <div className="min-w-0 w-full">
      <p className="text-sm font-medium text-[#4F6F52]">NEW CLASS</p>
      <h1 className="mt-1 text-3xl font-bold">Create a classroom workspace</h1>
      <p className="mt-2 text-[#606861]">You will import learners from an existing record later. No manual roster entry required.</p>
      <CreateClassForm>
        {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <label className="block text-sm font-medium">
          Class / section
          <input
            name="name"
            placeholder="Grade 6 Einstein"
            required
            className="mt-1.5 w-full rounded-xl border border-[#E3E5E1] px-3 py-3 outline-none focus:border-[#4F6F52]"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select name="gradeLevel" label="Grade level" options={GRADES} placeholder="Select grade" required />
          <Select
            name="subject"
            label="Subject"
            options={subjects}
            placeholder="Select subject"
            required
            allowCustom
            customPlaceholder="Type the subject"
          />
        </div>
        <label className="block text-sm font-medium">
          School year
          <input
            name="schoolYear"
            placeholder="SY 2026–2027"
            required
            className="mt-1.5 w-full rounded-xl border border-[#E3E5E1] px-3 py-3 outline-none focus:border-[#4F6F52]"
          />
        </label>
      </CreateClassForm>
    </div>
  );
}
