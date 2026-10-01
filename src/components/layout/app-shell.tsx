"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenCheck, ClipboardCheck, FileText, Home, MessageCircle, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/today", label: "Today", icon: Home },
  { href: "/classes", label: "Classes", icon: BookOpenCheck },
  { href: "/check", label: "Check", icon: ClipboardCheck },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/ask", label: "Ask", icon: MessageCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-[#E3E5E1] bg-white p-5 md:flex md:flex-col">
        <Link href="/today" className="mb-8 flex items-center gap-3">
          <Image src="/brand/teacherco-mascot.png" alt="TeacherCo" width={42} height={42} className="rounded-xl" />
          <div>
            <div className="text-lg font-bold text-[#1A4D2E]">TeacherCo</div>
            <div className="text-xs text-[#8B928C]">Your classroom companion</div>
          </div>
        </Link>
        <nav className="space-y-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition",
                active ? "bg-[#EAF0EA] text-[#1A4D2E]" : "text-[#606861] hover:bg-[#F4F7F4] hover:text-[#1A4D2E]",
              )}>
                <Icon size={19} strokeWidth={1.8} />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center border-b border-[#E3E5E1]/80 bg-[#F5EFE6]/90 px-4 backdrop-blur md:hidden">
          <Image src="/brand/teacherco-mascot.png" alt="TeacherCo" width={36} height={36} className="rounded-xl" />
          <span className="ml-2 font-bold text-[#1A4D2E]">TeacherCo</span>
        </header>
        <main className="mx-auto w-full max-w-7xl p-4 pb-24 md:p-8">{children}</main>
        <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-6 rounded-2xl border border-[#E3E5E1] bg-white/95 p-1.5 shadow-xl backdrop-blur md:hidden">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} className={cn("flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px]", active ? "bg-[#EAF0EA] text-[#1A4D2E]" : "text-[#606861]") }>
                <Icon size={18} strokeWidth={1.8} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
