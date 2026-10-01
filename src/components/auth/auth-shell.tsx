import Image from "next/image";
import { BookOpenCheck, ShieldCheck, Sparkles } from "lucide-react";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#F5EFE6] lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-[#1A4D2E] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/5" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[#E8DFCA]/10" />

        <div className="relative z-10 flex items-center gap-3">
          <Image
            src="/brand/teacherco-mascot.png"
            alt="TeacherCo"
            width={54}
            height={54}
            className="rounded-2xl ring-1 ring-white/20"
            priority
          />
          <div>
            <p className="text-xl font-bold">TeacherCo</p>
            <p className="text-sm text-white/65">Your classroom companion</p>
          </div>
        </div>

        <div className="relative z-10 max-w-xl py-12">
          <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#E8DFCA]">
            Built around teachers
          </span>
          <h1 className="mt-6 text-4xl font-bold leading-tight xl:text-5xl">
            Less time sorting records. More time teaching.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/72">
            Bring the class records you already use. TeacherCo helps organize them, surface useful patterns, and keep the evidence easy to verify.
          </p>

          <div className="mt-9 grid gap-3">
            <Benefit icon={BookOpenCheck} text="Import existing class records instead of re-encoding learners." />
            <Benefit icon={Sparkles} text="Turn classroom data into clear, teacher-ready insights." />
            <Benefit icon={ShieldCheck} text="Keep the teacher in control of every important decision." />
          </div>
        </div>

        <p className="relative z-10 text-xs text-white/45">TeacherCo · Calm, practical classroom intelligence</p>
      </section>

      <section className="flex min-h-screen items-center justify-center p-5 sm:p-8 lg:p-12">
        <div className="w-full max-w-[460px]">{children}</div>
      </section>
    </main>
  );
}

function Benefit({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  text: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10 text-[#E8DFCA]">
        <Icon size={18} strokeWidth={1.8} />
      </span>
      <p className="text-sm leading-6 text-white/80">{text}</p>
    </div>
  );
}
