//src\components\ui\card.tsx - Jabez

import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("teacherco-card p-5", className)}>{children}</section>;
}
