"use client";

import Link, { useLinkStatus } from "next/link";
import { LoaderCircle } from "lucide-react";
import { usePathname } from "next/navigation";

function TabLabel({ name }: { name: string }) {
  const { pending } = useLinkStatus();
  return <span className="inline-flex items-center gap-2">{name}{pending && <span role="status" aria-label={`Opening ${name}`}><LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /></span>}</span>;
}

export function ClassTabs({ classId }: { classId: string }) {
  const path = usePathname();
  const base = `/classes/${classId}`;
  const tabs = [["Overview", base], ["Learners", `${base}/learners`], ["Assessments", `${base}/assessments`], ["Records", `${base}/records`], ["Scores", `${base}/scores`], ["Term grades", `${base}/term-grades`], ["Ask", "/ask"]];
  return <nav aria-label="Class areas" className="tc-tabs">{tabs.map(([name, href]) => <Link key={href} href={href} aria-current={path === href || (href === `${base}/records` && path.startsWith(`${href}/`)) ? "page" : undefined}><TabLabel name={name}/></Link>)}</nav>;
}
