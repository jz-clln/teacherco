"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { ActionDisclosure } from "@/components/ui/action-disclosure";

export function ClassMoreMenu({ classId }: { classId: string }) {
  return <ActionDisclosure label="More" icon={<MoreHorizontal size={18} aria-hidden />}>
    <Link className="tc-button tc-quiet w-full justify-start text-left" href={`/settings?class=${classId}#grading`}>Grading settings</Link>
  </ActionDisclosure>;
}
