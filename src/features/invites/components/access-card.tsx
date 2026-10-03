//src\features\invites\components\access-card.tsx

import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/features/auth/actions";
import { LegalLinks } from "@/features/legal/legal-links";

export function AccessCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#F5EFE6] px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-[#E3E5E1] bg-white shadow-xl shadow-[#123820]/5">
        <div className="h-1.5 bg-[#1A4D2E]" aria-hidden />
        <div className="p-6 sm:p-8">
          <Link
            href="/"
            className="flex items-center justify-center gap-3 rounded-xl text-xl font-bold text-[#1A4D2E] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1A4D2E]"
          >
            <Image src="/brand/teacherco-mascot.png" alt="" width={48} height={48} className="rounded-xl" />
            TeacherCo
          </Link>

          <div className="mt-6 text-center">
            <h1 className="text-2xl font-bold text-[#1A4D2E]">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-[#606861]">{description}</p>
          </div>

          <div className="mt-6">{children}</div>

          <form action={signOut} className="mt-6 border-t border-[#E3E5E1] pt-3 text-center">
            <button className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-semibold text-[#4F6F52] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A4D2E]">
              Sign out / use another account
            </button>
          </form>
          <LegalLinks footer />
        </div>
      </div>
    </main>
  );
}