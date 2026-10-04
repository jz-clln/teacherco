//src\app\(auth)\signup\page.tsx

import Link from "next/link";
import { signUp } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { LegalLinks } from "@/features/legal/legal-links";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-[#F5EFE6] p-5">
      <div className="w-full max-w-md rounded-[28px] border border-[#E3E5E1] bg-white p-7 shadow-xl shadow-[#123820]/5">
        <h1 className="text-2xl font-bold text-[#1A4D2E]">Create your TeacherCo account</h1>
        <p className="mt-1 text-sm text-[#606861]">Start with one class. Import instead of re-encoding.</p>
        {error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <form action={signUp} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">Full name<input name="fullName" required className="mt-1.5 w-full rounded-xl border border-[#E3E5E1] px-3 py-3 outline-none focus:border-[#4F6F52]" /></label>
          <label className="block text-sm font-medium">Email<input name="email" type="email" required className="mt-1.5 w-full rounded-xl border border-[#E3E5E1] px-3 py-3 outline-none focus:border-[#4F6F52]" /></label>
          <label className="block text-sm font-medium">Password<input name="password" type="password" required minLength={8} className="mt-1.5 w-full rounded-xl border border-[#E3E5E1] px-3 py-3 outline-none focus:border-[#4F6F52]" /></label>
          <Button type="submit" className="w-full">Create account</Button>
          <p className="text-center text-xs leading-5 text-[#606861]">
            By creating an account, you agree to the{" "}
            <Link href="/legal/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1A4D2E] underline underline-offset-2">Terms &amp; Conditions<span className="sr-only"> (opens in a new tab)</span></Link>{" "}
            and acknowledge that you have read the{" "}
            <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1A4D2E] underline underline-offset-2">Privacy Notice<span className="sr-only"> (opens in a new tab)</span></Link>.
          </p>
        </form>
        <p className="mt-5 text-center text-sm text-[#606861]">Already have an account? <Link href="/login" className="font-semibold text-[#1A4D2E]">Sign in</Link></p>
        <footer><LegalLinks footer /></footer>
      </div>
    </main>
  );
}
