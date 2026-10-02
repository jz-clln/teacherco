// src/features/learners/import-loader.tsx

"use client";

import { cn } from "@/lib/utils";

/**
 * Cute loading state for the import screen: a little spreadsheet buddy that
 * bounces, blinks, and fills its cells while the file is being read.
 * Pure CSS, no dependencies. Respects "reduce motion".
 */
export function ImportLoader({
  message,
  detail,
  compact = false,
  className,
}: {
  /** Main line, e.g. "Finding your learners…". */
  message: string;
  /** Small line under it, e.g. the file name. */
  detail?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        compact
          ? "flex items-center gap-3 rounded-xl bg-[#EAF0EA] px-4 py-3"
          : "teacherco-card flex flex-col items-center justify-center p-10 text-center",
        className,
      )}
    >
      <style>{`
        @keyframes tc-hop { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-12px) } }
        @keyframes tc-shadow { 0%,100% { transform: scaleX(1); opacity: .25 } 50% { transform: scaleX(.7); opacity: .12 } }
        @keyframes tc-cell { 0%,100% { background: #E3E5E1 } 40%,60% { background: #4F6F52 } }
        @keyframes tc-blink { 0%,90%,100% { transform: scaleY(1) } 95% { transform: scaleY(.1) } }
        @keyframes tc-dot { 0%,80%,100% { transform: translateY(0); opacity: .35 } 40% { transform: translateY(-4px); opacity: 1 } }
        .tc-hop { animation: tc-hop 1.2s ease-in-out infinite }
        .tc-shadow { animation: tc-shadow 1.2s ease-in-out infinite }
        .tc-cell { animation: tc-cell 1.8s ease-in-out infinite }
        .tc-blink { animation: tc-blink 3s infinite }
        .tc-dot { animation: tc-dot 1.2s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) {
          .tc-hop, .tc-shadow, .tc-blink, .tc-dot { animation: none }
        }
      `}</style>

      <div className={cn("relative shrink-0", compact ? "h-10 w-10" : "h-28 w-28")}>
        <div
          className={cn(
            "tc-hop absolute inset-x-0 top-0 flex flex-col rounded-2xl border-2 border-[#1A4D2E] bg-white",
            compact ? "h-9 gap-0.5 p-1" : "h-24 gap-2 p-3",
          )}
        >
          {/* face */}
          <div className="flex items-center justify-center gap-3">
            <span className={cn("tc-blink rounded-full bg-[#1A4D2E]", compact ? "h-1 w-1" : "h-2 w-2")} />
            <span className={cn("tc-blink rounded-full bg-[#1A4D2E]", compact ? "h-1 w-1" : "h-2 w-2")} />
          </div>
          {/* cells fill up like it is reading rows */}
          <div className="grid flex-1 grid-cols-3 gap-1">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="tc-cell rounded-[3px]" style={{ animationDelay: `${i * 0.18}s` }} />
            ))}
          </div>
        </div>
        {!compact ? (
          <span className="tc-shadow absolute inset-x-3 bottom-0 h-2 rounded-full bg-[#1A4D2E]" />
        ) : null}
      </div>

      <div className={compact ? "" : "mt-5"}>
        <p className="font-semibold text-[#1A4D2E]">
          {message}
          <span className="ml-1 inline-flex gap-0.5 align-middle" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="tc-dot inline-block h-1 w-1 rounded-full bg-[#4F6F52]"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </span>
        </p>
        {detail ? <p className="mt-1 max-w-xs truncate text-sm text-[#606861]">{detail}</p> : null}
      </div>
    </div>
  );
}