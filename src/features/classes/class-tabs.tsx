"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ClassTabs({ classId }: { classId: string }) {
  const path = usePathname();
  const base = `/classes/${classId}`;
  const tabs = [["Overview", base], ["Learners", `${base}/learners`], ["Assessments", `${base}/assessments`], ["Records", `${base}/records`], ["Scores", `${base}/scores`], ["Term grades", `${base}/term-grades`], ["Ask", "/ask"]];
  return <nav aria-label="Class areas" className="tc-tabs">{tabs.map(([name, href]) => <Link key={href} href={href} aria-current={path === href || (href === `${base}/records` && path.startsWith(`${href}/`)) ? "page" : undefined}>{name}</Link>)}</nav>;
}
