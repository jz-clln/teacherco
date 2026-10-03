import Image from "next/image";
import Link from "next/link";
import { LegalLinks } from "@/features/legal/legal-links";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F5EFE6] px-4 py-6 text-[#1F2A22] sm:px-6 sm:py-10">
      <a href="#legal-content" className="sr-only focus:not-sr-only focus:mb-4 focus:block">Skip to content</a>
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 font-bold text-[#1A4D2E]">
            <Image src="/brand/teacherco-mascot.png" alt="" width={44} height={44} className="rounded-xl" />
            <span className="text-xl">TeacherCo</span>
          </Link>
          <nav aria-label="Account" className="flex items-center gap-4 text-sm font-semibold text-[#1A4D2E]">
            <Link href="/login" className="underline-offset-4 hover:underline">Sign in</Link>
            <Link href="/signup" className="rounded-xl border border-[#4F6F52]/30 bg-white px-4 py-2.5 hover:bg-[#F4F7F4]">Create account</Link>
          </nav>
        </header>
        <main id="legal-content">{children}</main>
        <footer><LegalLinks footer /></footer>
      </div>
    </div>
  );
}
