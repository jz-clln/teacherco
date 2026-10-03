import Link from "next/link";

export function LegalLinks({ footer = false }: { footer?: boolean }) {
  return (
    <div className={footer ? "mt-6 border-t border-[#E3E5E1] pt-5 text-center" : ""}>
      {footer ? <p className="mb-2 text-xs text-[#606861]">TeacherCo &copy; 2026</p> : null}
      <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
        <Link href="/legal/privacy" className="rounded font-medium text-[#1A4D2E] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#4F6F52]">Privacy Notice</Link>
        <Link href="/legal/terms" className="rounded font-medium text-[#1A4D2E] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#4F6F52]">Terms &amp; Conditions</Link>
      </nav>
    </div>
  );
}
