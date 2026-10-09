//src\app\(auth)\login\page.tsx

import Image from "next/image";
import Link from "next/link";
import { signIn } from "@/features/auth/actions";
import {PendingSubmit} from "@/components/ui/pending-submit";
import { LegalLinks } from "@/features/legal/legal-links";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-[#F5EFE6] p-5">
      <div className="w-full max-w-md rounded-2xl border border-[#E3E5E1] bg-white p-7">
        <div className="mb-7 flex items-center gap-3">
          <Image src="/brand/teacherco-mascot.png" alt="TeacherCo" width={52} height={52} className="rounded-2xl" />
          <div><h1 className="text-2xl font-bold text-[#1A4D2E]">TeacherCo</h1><p className="text-sm text-[#606861]">Welcome back, teacher.</p></div>
        </div>
        {error ? <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <form action={signIn} className="space-y-4">
          <label className="block text-sm font-medium">Email<input name="email" type="email" required className="mt-1.5 w-full rounded-xl border border-[#E3E5E1] px-3 py-3 outline-none focus:border-[#4F6F52]" /></label>
          <label className="block text-sm font-medium">Password<input name="password" type="password" required minLength={8} className="mt-1.5 w-full rounded-xl border border-[#E3E5E1] px-3 py-3 outline-none focus:border-[#4F6F52]" /></label>
          <PendingSubmit pendingLabel="Signing in..." className="w-full">Sign in</PendingSubmit>
        </form>
        <p className="mt-5 text-center text-sm text-[#606861]">New to TeacherCo? <Link href="/signup" className="font-semibold text-[#1A4D2E]">Create an account</Link></p>
        <footer><LegalLinks footer /></footer>
      </div>
    </main>
  );
}
