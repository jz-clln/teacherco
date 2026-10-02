// src/features/exams/ui.ts

// Shared class names so Check screens match each other.
const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A4D2E]";

export const btnPrimary = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1A4D2E] px-4 py-2.5 text-base font-semibold text-white transition-colors hover:bg-[#153e25] disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;
export const btnSecondary = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#4F6F52]/40 bg-white px-4 py-2.5 text-base font-semibold text-[#1A4D2E] transition-colors hover:bg-[#F5EFE6] disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;
export const btnQuiet = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-base font-medium text-[#4F6F52] transition-colors hover:bg-[#F5EFE6] disabled:opacity-50 ${focus}`;
export const btnDanger = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-base font-medium text-[#9B2C2C] transition-colors hover:bg-[#FBEAEA] disabled:opacity-50 ${focus}`;
export const field = `min-h-11 w-full rounded-xl border border-[#E8DFCA] bg-white px-3 py-2.5 text-base text-[#1F2A22] placeholder:text-[#8A918B] ${focus}`;
export const label = "mb-1 block text-base font-medium text-[#1F2A22]";
export const muted = "text-[#606861]";