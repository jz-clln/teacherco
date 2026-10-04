import Link from "next/link";
import type { ReactNode } from "react";

export function GroupedSection({ title, href, linkLabel = "See all", children }: { title: string; href?: string; linkLabel?: string; children: ReactNode }) {
  return <section className="min-w-0">
    <div className="tc-section-heading"><h2>{title}</h2>{href && <Link className="tc-button tc-quiet shrink-0 px-1" href={href} aria-label={`${linkLabel}: ${title}`}>{linkLabel}</Link>}</div>
    <div className="tc-group">{children}</div>
  </section>;
}
