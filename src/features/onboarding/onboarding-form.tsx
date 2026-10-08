"use client";

import { Select } from '@/components/ui/select';
import Image from "next/image";
import { useActionState, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Building2,
  Check,
  GraduationCap,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { completeOnboarding, type OnboardingState } from "@/features/onboarding/actions";
import { cn } from "@/lib/utils";

const initialState: OnboardingState = {};

const gradeBandOptions = [
  { value: "elementary", label: "Elementary" },
  { value: "jhs", label: "Junior High" },
  { value: "shs", label: "Senior High" },
] as const;

function getDefaultSchoolYear() {
  const now = new Date();
  const year = now.getFullYear();
  const startYear = now.getMonth() >= 5 ? year : year - 1;
  return `${startYear}–${startYear + 1}`;
}

export function OnboardingForm({
  fullName,
  existingPreferredName,
}: {
  fullName: string;
  existingPreferredName?: string | null;
}) {
  const [state, formAction, pending] = useActionState(completeOnboarding, initialState);
  const [step, setStep] = useState(0);
  const [schoolType, setSchoolType] = useState<"public" | "private" | "">("");
  const [gradeBands, setGradeBands] = useState<string[]>([]);
  const [skipClass, setSkipClass] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const defaultPreferredName = useMemo(() => {
    if (existingPreferredName) return existingPreferredName;
    return fullName.trim().split(/\s+/)[0] || fullName;
  }, [existingPreferredName, fullName]);

  function continueProfile() {
    if (!schoolType || gradeBands.length === 0) {
      setLocalError("Choose your school type and at least one teaching level.");
      return;
    }
    setLocalError(null);
    setStep(2);
  }

  function toggleGradeBand(value: string) {
    setGradeBands((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  return (
    <main className="min-h-screen bg-[#F5EFE6] px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/brand/teacherco-mascot.png"
              alt="TeacherCo"
              width={46}
              height={46}
              className="rounded-2xl"
              priority
            />
            <div>
              <p className="font-bold text-[#1A4D2E]">TeacherCo</p>
              <p className="text-xs text-[#8B928C]">Let’s set up your workspace</p>
            </div>
          </div>
          <p className="hidden text-sm text-[#8B928C] sm:block">About 2 minutes</p>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[260px_1fr] lg:gap-8">
          <aside className="teacherco-card h-fit p-4 sm:p-5">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-[#8B928C]">Setup</p>
            <StepIndicator current={step} index={0} title="Welcome" description="How TeacherCo works" />
            <StepIndicator current={step} index={1} title="Teaching profile" description="Personalize your workspace" />
            <StepIndicator current={step} index={2} title="First class" description="Start with a real classroom" />
          </aside>

          <form action={formAction} className="teacherco-card overflow-hidden">
            <input type="hidden" name="createFirstClass" value={skipClass ? "false" : "true"} />

            <section className={cn("p-6 sm:p-8 lg:p-10", step !== 0 && "hidden")}>
              <span className="grid size-12 place-items-center rounded-2xl bg-[#EAF0EA] text-[#1A4D2E]">
                <BookOpenCheck size={23} strokeWidth={1.8} />
              </span>
              <p className="mt-6 text-sm font-semibold text-[#4F6F52]">WELCOME TO TEACHERCO</p>
              <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-[-0.035em] text-[#1E2420] sm:text-4xl">
                Keep your way of teaching. Let TeacherCo handle the repetitive parts.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#606861] sm:text-base">
                You can create a class, bring in the records you already use, and let TeacherCo organize them into a workspace you can understand and verify.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <Promise icon={UploadCloud} title="Import" text="Bring your existing class record." />
                <Promise icon={GraduationCap} title="Understand" text="See useful classroom patterns." />
                <Promise icon={Check} title="Stay in control" text="You review important decisions." />
              </div>

              <div className="mt-9 flex justify-end">
                <Button type="button" onClick={() => setStep(1)} className="gap-2 px-5">
                  Get started <ArrowRight size={17} />
                </Button>
              </div>
            </section>

            <section className={cn("p-6 sm:p-8 lg:p-10", step !== 1 && "hidden")}>
              <p className="text-sm font-semibold text-[#4F6F52]">YOUR TEACHING PROFILE</p>
              <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-[#1E2420]">Make TeacherCo feel familiar</h1>
              <p className="mt-3 text-sm leading-6 text-[#606861]">
                These details help us use the right language and classroom terminology. You can change them later.
              </p>

              <div className="mt-7 grid gap-5">
                <label className="block text-sm font-semibold text-[#313832]">
                  What should TeacherCo call you?
                  <input
                    name="preferredName"
                    defaultValue={defaultPreferredName}
                    required
                    className="mt-1.5 w-full rounded-xl border border-[#E3E5E1] bg-white px-3.5 py-3 text-sm outline-none transition focus:border-[#4F6F52] focus:ring-4 focus:ring-[#4F6F52]/10"
                  />
                </label>

                <div>
                  <p className="text-sm font-semibold text-[#313832]">Where do you teach?</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {[
                      { value: "public", label: "Public school", icon: Building2 },
                      { value: "private", label: "Private school", icon: Building2 },
                    ].map(({ value, label, icon: Icon }) => {
                      const active = schoolType === value;
                      return (
                        <label
                          key={value}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition",
                            active
                              ? "border-[#4F6F52] bg-[#F4F7F4] ring-4 ring-[#4F6F52]/8"
                              : "border-[#E3E5E1] bg-white hover:border-[#D5E0D5]",
                          )}
                        >
                          <input
                            type="radio"
                            name="schoolType"
                            value={value}
                            checked={active}
                            onChange={() => setSchoolType(value as "public" | "private")}
                            className="sr-only"
                          />
                          <span className="grid size-10 place-items-center rounded-xl bg-[#EAF0EA] text-[#1A4D2E]">
                            <Icon size={19} />
                          </span>
                          <span className="text-sm font-semibold text-[#313832]">{label}</span>
                          {active ? <Check size={18} className="ml-auto text-[#1A4D2E]" /> : null}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <label className="block text-sm font-semibold text-[#313832]">
                  School name <span className="font-normal text-[#8B928C]">(optional)</span>
                  <input
                    name="schoolName"
                    placeholder="e.g. San Isidro Elementary School"
                    className="mt-1.5 w-full rounded-xl border border-[#E3E5E1] bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-[#A0A6A1] focus:border-[#4F6F52] focus:ring-4 focus:ring-[#4F6F52]/10"
                  />
                </label>

                <div>
                  <p className="text-sm font-semibold text-[#313832]">Which levels do you teach?</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {gradeBandOptions.map((option) => {
                      const active = gradeBands.includes(option.value);
                      return (
                        <label
                          key={option.value}
                          className={cn(
                            "cursor-pointer rounded-full border px-4 py-2.5 text-sm font-medium transition",
                            active
                              ? "border-[#4F6F52] bg-[#1A4D2E] text-white"
                              : "border-[#E3E5E1] bg-white text-[#606861] hover:border-[#D5E0D5]",
                          )}
                        >
                          <input
                            type="checkbox"
                            name="gradeBands"
                            value={option.value}
                            checked={active}
                            onChange={() => toggleGradeBand(option.value)}
                            className="sr-only"
                          />
                          {option.label}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <Select name="preferredLanguage" label="Preferred language" defaultValue="en"
                  options={[{value:'en',label:'English'},{value:'fil',label:'Filipino'}]} />
              </div>

              {localError ? (
                <p className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {localError}
                </p>
              ) : null}

              <div className="mt-8 flex items-center justify-between gap-3">
                <Button type="button" variant="ghost" onClick={() => setStep(0)} className="gap-2">
                  <ArrowLeft size={17} /> Back
                </Button>
                <Button type="button" onClick={continueProfile} className="gap-2 px-5">
                  Continue <ArrowRight size={17} />
                </Button>
              </div>
            </section>

            <section className={cn("p-6 sm:p-8 lg:p-10", step !== 2 && "hidden")}>
              <p className="text-sm font-semibold text-[#4F6F52]">YOUR FIRST CLASS</p>
              <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-[#1E2420]">Create the workspace, not the roster</h1>
              <p className="mt-3 text-sm leading-6 text-[#606861]">
                Add the class details now. You will import learners from the record you already use—no manual learner entry required.
              </p>

              <div className="mt-7">
                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-[#E3E5E1] bg-[#FAFAF8] p-4">
                  <div>
                    <p className="text-sm font-semibold text-[#313832]">I’ll create my first class later</p>
                    <p className="mt-1 text-xs leading-5 text-[#8B928C]">You can finish onboarding and start from the Today screen.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={skipClass}
                    onChange={(event) => setSkipClass(event.target.checked)}
                    className="size-4 accent-[#1A4D2E]"
                  />
                </label>
              </div>

              <fieldset disabled={skipClass} className={cn("mt-5 grid gap-4 transition", skipClass && "opacity-45")}>
                <label className="block text-sm font-semibold text-[#313832]">
                  Class / section
                  <input
                    name="className"
                    required={!skipClass}
                    placeholder="Grade 6 Einstein"
                    className="mt-1.5 w-full rounded-xl border border-[#E3E5E1] bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-[#A0A6A1] focus:border-[#4F6F52] focus:ring-4 focus:ring-[#4F6F52]/10"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold text-[#313832]">
                    Grade level
                    <input
                      name="gradeLevel"
                      required={!skipClass}
                      placeholder="Grade 6"
                      className="mt-1.5 w-full rounded-xl border border-[#E3E5E1] bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-[#A0A6A1] focus:border-[#4F6F52] focus:ring-4 focus:ring-[#4F6F52]/10"
                    />
                  </label>

                  <label className="block text-sm font-semibold text-[#313832]">
                    Subject
                    <input
                      name="subject"
                      required={!skipClass}
                      placeholder="Mathematics"
                      className="mt-1.5 w-full rounded-xl border border-[#E3E5E1] bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-[#A0A6A1] focus:border-[#4F6F52] focus:ring-4 focus:ring-[#4F6F52]/10"
                    />
                  </label>
                </div>

                <label className="block text-sm font-semibold text-[#313832]">
                  School year
                  <input
                    name="schoolYear"
                    required={!skipClass}
                    defaultValue={getDefaultSchoolYear()}
                    className="mt-1.5 w-full rounded-xl border border-[#E3E5E1] bg-white px-3.5 py-3 text-sm outline-none transition focus:border-[#4F6F52] focus:ring-4 focus:ring-[#4F6F52]/10"
                  />
                </label>
              </fieldset>

              {state.error ? (
                <p className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                  {state.error}
                </p>
              ) : null}

              <div className="mt-8 flex items-center justify-between gap-3">
                <Button type="button" variant="ghost" onClick={() => setStep(1)} className="gap-2">
                  <ArrowLeft size={17} /> Back
                </Button>
                <Button type="submit" disabled={pending} className="gap-2 px-5">
                  {pending ? "Setting up…" : skipClass ? "Finish setup" : "Create class & continue"}
                  {!pending ? <ArrowRight size={17} /> : null}
                </Button>
              </div>
            </section>
          </form>
        </div>
      </div>
    </main>
  );
}

function StepIndicator({
  current,
  index,
  title,
  description,
}: {
  current: number;
  index: number;
  title: string;
  description: string;
}) {
  const complete = current > index;
  const active = current === index;

  return (
    <div className="flex gap-3 py-3">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full border text-xs font-bold transition",
          complete && "border-[#1A4D2E] bg-[#1A4D2E] text-white",
          active && "border-[#4F6F52] bg-[#EAF0EA] text-[#1A4D2E]",
          !active && !complete && "border-[#E3E5E1] bg-white text-[#8B928C]",
        )}
      >
        {complete ? <Check size={15} /> : index + 1}
      </span>
      <div>
        <p className={cn("text-sm font-semibold", active || complete ? "text-[#1E2420]" : "text-[#8B928C]")}>{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-[#8B928C]">{description}</p>
      </div>
    </div>
  );
}

function Promise({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-[#E3E5E1] bg-[#FAFAF8] p-4">
      <span className="grid size-9 place-items-center rounded-xl bg-[#EAF0EA] text-[#1A4D2E]">
        <Icon size={18} strokeWidth={1.8} />
      </span>
      <p className="mt-3 text-sm font-semibold text-[#313832]">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[#8B928C]">{text}</p>
    </div>
  );
}
