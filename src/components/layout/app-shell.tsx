"use client";

import Image from "next/image";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenCheck, ClipboardCheck, FileText, Home, LoaderCircle, MessageCircle, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AccountMenu } from "./account-menu";

const nav = [
  { href: "/today", label: "Today", icon: Home },
  { href: "/classes", label: "Classes", icon: BookOpenCheck },
  { href: "/check", label: "Check", icon: ClipboardCheck },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/ask", label: "Ask", icon: MessageCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavigationIcon({ icon: Icon, size, label }: { icon: LucideIcon; size: number; label: string }) {
  const { pending } = useLinkStatus();
  return pending
    ? <span role="status" aria-label={`Opening ${label}`}><LoaderCircle size={size} strokeWidth={1.8} className="animate-spin motion-reduce:animate-none" aria-hidden /></span>
    : <Icon size={size} strokeWidth={1.8} aria-hidden />;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="tc-app min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="hidden border-r border-[#E3E5E1] bg-white p-5 md:flex md:flex-col">
        <Link href="/today" className="mb-8 flex items-center gap-3">
          <Image src="/brand/teacherco-mascot.png" alt="TeacherCo" width={42} height={42} className="rounded-xl" />
          <div>
            <div className="tc-brand text-lg font-bold text-[#1A4D2E]">TeacherCo</div>
            <div className="text-xs text-[#606861]">Your classroom companion</div>
          </div>
        </Link>
        <nav aria-label="Main navigation" className="space-y-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition",
                active ? "bg-[#EAF0EA] text-[#1A4D2E]" : "text-[#606861] hover:bg-[#F4F7F4] hover:text-[#1A4D2E]",
              )}>
                <NavigationIcon icon={Icon} size={19} label={label} />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="relative z-20 flex min-h-16 items-center justify-between gap-2 border-b border-[#E3E5E1] bg-[#F5EFE6] px-5 md:justify-end md:border-0 md:px-8">
          <Link href="/today" className="tc-brand flex min-h-11 items-center gap-2 font-bold text-[#1A4D2E] md:hidden"><Image src="/brand/teacherco-mascot.png" alt="" width={36} height={36} />TeacherCo</Link>
          <AccountMenu />
        </header>
        <main className="mx-auto w-full max-w-[1200px] px-5 pt-6 pb-[calc(96px+env(safe-area-inset-bottom))] md:px-8 md:pt-4 md:pb-8">{children}</main>
        <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[#E3E5E1] bg-white px-2 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] md:hidden">
          {nav.slice(0, 5).map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-xs", active ? "font-semibold text-[#1A4D2E]" : "text-[#606861]") }>
                <NavigationIcon icon={Icon} size={18} label={label} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
