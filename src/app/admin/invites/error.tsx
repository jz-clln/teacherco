"use client";
import { Button } from "@/components/ui/button";

export default function InviteAdminError({ reset }: { reset: () => void }) {
  return <main className="min-h-screen bg-[#F5EFE6] p-8"><div className="mx-auto max-w-md rounded-2xl bg-white p-6"><h1 className="text-xl font-semibold text-[#1A4D2E]">Could not load invite administration</h1><p role="alert" className="my-4 text-sm text-[#606861]">Check your connection and administrator access, then try again.</p><Button onClick={reset}>Try again</Button></div></main>;
}
