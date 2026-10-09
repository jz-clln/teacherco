// src/features/ask/ask-workspace.tsx

"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowRight,
  CalendarX,
  ChevronRight,
  ClipboardList,
  FileText,
  Gauge,
  Lightbulb,
  RotateCcw,
  Send,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Select } from "@/components/ui/select";
import { askTeacherAction } from "./actions";
import type { AskAnswer, AskContext } from "./engine";

type AskClassOption = { id: string; name: string; subject: string };
type Turn = { question: string; answer: AskAnswer };

const MASCOT = "/brand/teacherco-mascot.png";

function evidenceFields(answer: AskAnswer) {
  const learnerSummary = answer.kind === "learner-lookup";
  return {
    average: learnerSummary || ["class-average", "benchmark", "grade-absences", "grade-attendance", "progress"].includes(answer.kind),
    absences: learnerSummary || ["absences", "grade-absences"].includes(answer.kind),
    attendance: learnerSummary || ["good-attendance", "grade-attendance"].includes(answer.kind),
    change: learnerSummary || answer.kind === "progress",
    missing: learnerSummary || answer.kind === "missing-activities",
    competency: learnerSummary || answer.kind === "competency-learners",
  };
}

const examples: { text: string; icon: LucideIcon }[] = [
  { text: "Who is below the benchmark?", icon: Users },
  { text: "Who has 5 or more absences?", icon: CalendarX },
  { text: "What is the class average?", icon: Gauge },
  { text: "Which competency is weakest?", icon: Target },
  { text: "Who has missing activities?", icon: ClipboardList },
  { text: "What should I know about this class?", icon: Lightbulb },
  { text: "Prepare a class report", icon: FileText },
];

const surface = "tc-group";
const pill = "rounded-full bg-[#F1F3F0] px-2.5 py-1 text-xs font-medium text-[#4F5D52]";
const primaryLink =
  "inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A4D2E] px-4 text-sm font-semibold text-white transition hover:bg-[#123820]";

function Avatar({ size = 36 }: { size?: number }) {
  return (
    <Image
      src={MASCOT}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full bg-[#E8DFCA] object-cover"
    />
  );
}

function RowEvidence({ answer }: { answer: AskAnswer }) {
  if (!answer.rows.length) return null;
  const fields = evidenceFields(answer);

  return (
    <ul className="mt-4 divide-y divide-[#E3E5E1] overflow-hidden rounded-xl border border-[#E3E5E1]">
      {answer.rows.map((row) => (
        <li key={`${row.className}-${row.learnerId}`} className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2 px-4 py-3">
          <div className="min-w-0">
            <p className="font-medium">{answer.kind === "class-average" ? row.className : row.learnerName}</p>
            {answer.kind !== "class-average" && <p className="text-sm text-[#606861]">{row.className}</p>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {fields.average && row.average != null && <span className={pill}>Average {row.average}%</span>}
            {fields.average && answer.kind !== "class-average" && row.average != null && (
              <span className={pill}>Benchmark {row.benchmark}%</span>
            )}
            {fields.absences && row.absences != null && (
              <span className={pill}>
                {row.absences} {row.absences === 1 ? "absence" : "absences"}
              </span>
            )}
            {fields.attendance && row.attendanceRate != null && <span className={pill}>{row.attendanceRate}% attendance</span>}
            {fields.change && row.change != null && (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  row.change > 0 ? "bg-green-50 text-green-800" : row.change < 0 ? "bg-red-50 text-red-700" : "bg-[#F1F3F0] text-[#4F5D52]"
                }`}
              >
                {row.change > 0 ? "+" : ""}
                {row.change} points
              </span>
            )}
            {fields.competency && row.competency && (
              <span className={pill}>
                {row.competency.name}: {row.competency.average}% (class {row.competency.classAverage}%)
              </span>
            )}
            {fields.missing && row.missingActivities.length > 0 && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                No score: {row.missingActivities.join(", ")}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function EvidenceDetails({ answer }: { answer: AskAnswer }) {
  if (!answer.evidence.length && !answer.rows.length) return null;
  const fields = evidenceFields(answer);
  return (
    <details className="group mt-4 rounded-xl border border-[#E3E5E1] bg-[#FAFBF9]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold text-[#1A4D2E] [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} className="transition group-open:rotate-90" aria-hidden="true" />
        Show Evidence
      </summary>
      <ul className="list-disc space-y-1.5 border-t border-[#E3E5E1] py-3 pr-4 pl-9 text-sm leading-6 text-[#606861]">
        {answer.evidence.map((item) => (
          <li key={item}>{item}</li>
        ))}
        {answer.rows.map((row) => (
          <li key={`${row.learnerId}-evidence`}>
            {row.learnerName}:{" "}
            {[
              fields.average && row.average != null ? `average ${row.average}% against ${row.benchmark}% benchmark` : null,
              fields.absences && row.absences != null ? `${row.absences} recorded absences` : null,
              fields.attendance && row.attendanceRate != null ? `${row.attendanceRate}% recorded attendance` : null,
              fields.change && row.change != null ? `${row.change} percentage-point change` : null,
              fields.competency && row.competency
                ? `${row.competency.name} ${row.competency.average}% against class ${row.competency.classAverage}%`
                : null,
              fields.missing && row.missingActivities.length ? `no confirmed score for ${row.missingActivities.join(", ")}` : null,
            ]
              .filter(Boolean)
              .join("; ")}
            .
          </li>
        ))}
      </ul>
    </details>
  );
}

function FollowUps({ answer, onAsk }: { answer: AskAnswer; onAsk: (question: string) => void }) {
  const suggestions = answer.context?.competencyName
    ? ["Which learners are struggling with it?"]
    : answer.context?.learnerIds?.length
      ? ["Only show those who also have frequent absences", "Which of them declined?"]
      : [];
  if (!suggestions.length) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => onAsk(suggestion)}
          className="min-h-11 rounded-full border border-[#D5DDD4] bg-white px-4 text-sm font-medium text-[#315F3D] transition hover:border-[#4F6F52] hover:bg-[#F4F7F4]"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-[#4F6F52] motion-safe:animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

export function AskWorkspace({ classes, loadError }: { classes: AskClassOption[]; loadError: boolean }) {
  const [classId, setClassId] = useState("all");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  /** The question being answered right now, so it shows immediately. */
  const [asking, setAsking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const latestRef = useRef<HTMLElement | null>(null);

  // Bring the newest answer into view.
  useEffect(() => {
    if (turns.length === 0) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    latestRef.current?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  }, [turns.length]);

  function changeScope(value: string) {
    setClassId(value);
    setTurns([]);
    setError(null);
  }

  function startOver() {
    setTurns([]);
    setError(null);
  }

  function ask(prompt = question) {
    const text = prompt.trim();
    if (!text || pending) return;
    setError(null);
    setAsking(text);
    const context: AskContext | undefined = turns.at(-1)?.answer.context;
    startTransition(async () => {
      try {
        const result = await askTeacherAction({ classId, question: text, context });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setTurns((current) => [...current, { question: text, answer: result.answer }]);
        setQuestion("");
      } catch {
        setError("TeacherCo couldn’t reach your records. Check your connection and try again.");
      } finally {
        setAsking(null);
      }
    });
  }

  const empty = turns.length === 0 && !asking;

  const composer = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        ask();
      }}
      className={`${surface} tc-input-surface transition`}
    >
      <label htmlFor="ask-question" className="sr-only">
        Your question
      </label>
      <textarea
        id="ask-question"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            ask();
          }
        }}
        maxLength={500}
        rows={3}
        placeholder="Type a question, like “Who is below the benchmark?”"
        className="block w-full resize-none rounded-t-2xl bg-white px-4 pt-4 pb-2 text-base text-[#1F2A22] outline-none placeholder:text-[#8A918B]"
      />
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3">
        <p className="text-xs text-[#747D76]">Classroom questions only · Enter to ask · Shift+Enter for a new line</p>
        <div className="flex items-center gap-3">
          {question.length > 400 ? <span className="text-xs tabular-nums text-[#747D76]">{question.length}/500</span> : null}
          <button
            type="submit"
            disabled={!question.trim() || pending}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A4D2E] px-5 text-sm font-semibold text-white transition hover:bg-[#123820] disabled:cursor-not-allowed disabled:bg-[#C5D0C6]"
          >
            <Send size={16} aria-hidden="true" />
            {pending ? "Checking records" : "Ask"}
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="rounded-b-2xl border-t border-red-100 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </form>
  );

  return (
    <div className="min-w-0 w-full space-y-6 pb-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-wide text-[#4F6F52]">TEACHERCO ASK</p>
          <h1 className="mt-1 text-3xl font-bold">Ask your classroom records</h1>
          <p className="mt-2 max-w-xl text-sm text-[#606861]">
            Answers use confirmed classroom data and show how they were calculated.
          </p>
        </div>
        {classes.length > 0 && (
          <Select
            name="askScope"
            label="Search in"
            compact
            className="w-full sm:w-72"
            value={classId}
            onChange={changeScope}
            options={[
              { value: "all", label: "All active classrooms" },
              ...classes.map((classroom) => ({ value: classroom.id, label: `${classroom.name} · ${classroom.subject}` })),
            ]}
          />
        )}
      </header>

      {loadError ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          TeacherCo couldn’t load your classrooms. Refresh the page and try again.
        </p>
      ) : classes.length === 0 ? (
        <section className={`${surface} flex flex-col items-center p-8 text-center`}>
          <Avatar size={64} />
          <h2 className="mt-4 text-lg font-semibold">Create a class to start asking</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-[#606861]">
            Ask searches your own class records. Once you create a class and add its learners, you can ask about grades,
            attendance, and assessments.
          </p>
          <Link href="/classes/new" className={`${primaryLink} mt-5`}>
            Create a class <ArrowRight size={16} />
          </Link>
        </section>
      ) : empty ? (
        <>
          <section className="flex items-center gap-4 rounded-2xl bg-[#F0E8DC] p-4 sm:p-5">
            <Avatar size={56} />
            <div className="min-w-0">
              <p className="font-semibold">Hi! What would you like to know about your class?</p>
              <p className="mt-0.5 text-sm text-[#606861]">
                Pick a question below or type your own. Every answer shows the records behind it.
              </p>
            </div>
          </section>

          {composer}

          <section aria-label="Example questions">
            <h2 className="text-sm font-semibold text-[#606861]">Try a classroom question</h2>
            <div className="tc-group tc-rows mt-3">
              {examples.map(({ text, icon: Icon }) => (
                <button
                  key={text}
                  type="button"
                  disabled={pending}
                  onClick={() => ask(text)}
                  className="tc-row w-full text-left font-medium disabled:opacity-50"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center text-[#606861]">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  {text}
                </button>
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          {turns.length > 0 ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={startOver}
                disabled={pending}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-[#606861] transition hover:bg-white hover:text-[#1A4D2E] disabled:opacity-50"
              >
                <RotateCcw size={14} aria-hidden="true" /> Start over
              </button>
            </div>
          ) : null}

          <section aria-label="Ask conversation" aria-live="polite" className="space-y-6">
            {turns.map((turn, index) => (
              <article
                key={`${index}-${turn.question}`}
                ref={index === turns.length - 1 ? latestRef : undefined}
                className="scroll-mt-4 space-y-3"
              >
                <div className="flex justify-end">
                  <p className="max-w-xl rounded-2xl rounded-br-md bg-[#1A4D2E] px-4 py-2.5 text-white">{turn.question}</p>
                </div>
                <div className="flex items-start gap-3">
                  <Avatar />
                  <div className={`${surface} min-w-0 flex-1 rounded-tl-md p-4 sm:p-5`}>
                    <p className="inline-block rounded-full bg-[#EAF0EA] px-2.5 py-0.5 text-xs font-semibold text-[#1A4D2E]">
                      From your records
                    </p>
                    <p className="mt-3 whitespace-pre-line leading-7 text-[#28332B]">{turn.answer.text}</p>
                    <RowEvidence answer={turn.answer} />
                    <EvidenceDetails answer={turn.answer} />
                    {turn.answer.action ? (
                      <Link href={turn.answer.action.href} className={`${primaryLink} mt-4`}>
                        {turn.answer.action.label} <ArrowRight size={16} />
                      </Link>
                    ) : null}
                    <FollowUps answer={turn.answer} onAsk={ask} />
                  </div>
                </div>
              </article>
            ))}

            {asking ? (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <p className="max-w-xl rounded-2xl rounded-br-md bg-[#1A4D2E] px-4 py-2.5 text-white">{asking}</p>
                </div>
                <div className="flex items-start gap-3" role="status">
                  <Avatar />
                  <div className={`${surface} rounded-tl-md px-4 py-3`}>
                    <p className="flex items-center gap-2 text-sm text-[#606861]">
                      Checking your records <TypingDots />
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          {composer}
        </>
      )}
    </div>
  );
}
