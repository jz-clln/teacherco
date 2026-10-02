// src/features/exams/components/check-folders.tsx

"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronDown, Folder, Plus, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { CheckFolder, OverviewRow } from "@/features/exams/queries";
import { btnQuiet, field } from "@/features/exams/ui";

const STORAGE_KEY = "teacherco.check.folders";

const defaultOpen = (f: CheckFolder, total: number) => total === 1 || f.pending > 0;

// A subject with more assessments than this gets its own search box.
const SEARCH_FROM = 6;

// ---------------------------------------------------------------- saved open/closed folders
// The browser's localStorage is an external system, so it is read with useSyncExternalStore.
// That avoids setting state inside an effect and keeps server and first client render identical.

const listeners = new Set<() => void>();
// Used when localStorage is blocked, so folders still open and close during this visit.
let memory: string | null = null;

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== STORAGE_KEY) return;
    memory = null;
    onChange();
  };
  listeners.add(onChange);
  window.addEventListener("storage", onStorage); // another tab changed it
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function readSaved(): string {
  if (memory !== null) return memory;
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

const readSavedOnServer = () => "";

function writeSaved(next: Record<string, boolean>) {
  const raw = JSON.stringify(next);
  memory = raw;
  try {
    localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    /* storage unavailable: the in-memory copy still works for this visit */
  }
  listeners.forEach((notify) => notify());
}

function parseSaved(raw: string): Record<string, boolean> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" ? (value as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function AssessmentCard({ a }: { a: OverviewRow }) {
  const progress = a.roster ? Math.min(100, (a.checked / a.roster) * 100) : 0;
  return (
    <li>
      <Link
        href={a.checked < a.roster ? `/check/${a.id}/score` : `/check/${a.id}`}
        className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A4D2E]"
      >
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="truncate text-base font-semibold">{a.title}</h4>
              {a.date ? <p className="mt-0.5 truncate text-sm text-[#606861]">{a.date}</p> : null}
            </div>
            {a.format === "true_false" ? (
              <span className="shrink-0 rounded-full bg-[#E8DFCA] px-2.5 py-1 text-sm font-medium">True or false</span>
            ) : null}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#E8DFCA]">
            <div className="h-full bg-[#1A4D2E]" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-sm text-[#606861]">
            {a.checked} of {a.roster} checked
            {a.mean !== null ? ` · class average ${a.mean}%` : ""}
            {a.status === "closed" ? " · closed" : ""}
          </p>
        </Card>
      </Link>
    </li>
  );
}

/** Keeps only what matches. A matching class or subject keeps everything inside it. */
function filterFolders(folders: CheckFolder[], query: string): CheckFolder[] {
  const q = query.trim().toLowerCase();
  if (!q) return folders;
  const out: CheckFolder[] = [];
  for (const f of folders) {
    if (f.name.toLowerCase().includes(q) || f.gradeLevel?.toLowerCase().includes(q)) {
      out.push(f);
      continue;
    }
    const subjects = f.subjects
      .map((g) =>
        g.subject.toLowerCase().includes(q)
          ? g
          : { ...g, assessments: g.assessments.filter((a) => a.title.toLowerCase().includes(q)) },
      )
      .filter((g) => g.subject.toLowerCase().includes(q) || g.assessments.length > 0);
    if (subjects.length) out.push({ ...f, subjects });
  }
  return out;
}

export function CheckFolders({ folders }: { folders: CheckFolder[] }) {
  const [query, setQuery] = useState("");
  // What the teacher typed in each subject's own search box.
  const [subjectQuery, setSubjectQuery] = useState<Record<string, string>>({});
  // Folders the teacher opened or closed by hand. Anything missing uses the default.
  const raw = useSyncExternalStore(subscribe, readSaved, readSavedOnServer);
  const saved = useMemo(() => parseSaved(raw), [raw]);

  const searching = query.trim().length > 0;
  const visible = useMemo(() => filterFolders(folders, query), [folders, query]);
  const isOpen = (f: CheckFolder) => searching || (saved[f.key] ?? defaultOpen(f, folders.length));

  function setAll(open: boolean) {
    writeSaved(Object.fromEntries(folders.map((f) => [f.key, open])));
  }

  const showControls = folders.length > 1;

  return (
    <div className="space-y-4">
      {showControls ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-52 flex-1 sm:max-w-sm">
            <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8A918B]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search class, subject or assessment"
              aria-label="Search classes, subjects and assessments"
              className={`${field} pl-9`}
            />
          </div>
          {!searching ? (
            <div className="flex items-center gap-1">
              <button type="button" className={btnQuiet} onClick={() => setAll(true)}>Expand all</button>
              <button type="button" className={btnQuiet} onClick={() => setAll(false)}>Collapse all</button>
            </div>
          ) : null}
        </div>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {searching ? `${visible.length} ${visible.length === 1 ? "class" : "classes"} found` : ""}
      </p>

      {searching && visible.length === 0 ? (
        <Card>
          <h2 className="font-semibold">Nothing found</h2>
          <p className="mt-2 text-sm text-[#606861]">No class, subject or assessment matches “{query.trim()}”.</p>
        </Card>
      ) : null}

      {visible.map((folder) => (
        <details
          key={folder.key}
          open={isOpen(folder)}
          onToggle={(e) => {
            if (searching) return;
            const open = e.currentTarget.open;
            if (open !== isOpen(folder)) writeSaved({ ...saved, [folder.key]: open });
          }}
          className="teacherco-card overflow-hidden"
        >
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 p-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#1A4D2E] [&::-webkit-details-marker]:hidden">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF0EA] text-[#1A4D2E]">
              <Folder size={20} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-lg font-bold">{folder.name}</span>
              <span className="block truncate text-sm text-[#606861]">
                {[
                  folder.gradeLevel,
                  `${folder.subjects.length} ${folder.subjects.length === 1 ? "subject" : "subjects"}`,
                  `${folder.total} ${folder.total === 1 ? "assessment" : "assessments"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            {folder.pending > 0 ? (
              <span className="shrink-0 rounded-full bg-[#E8DFCA] px-2.5 py-1 text-sm font-medium">
                {folder.pending} to check
              </span>
            ) : null}
            <ChevronDown size={20} aria-hidden className="shrink-0 text-[#606861] transition-transform [details[open]_&]:rotate-180" />
          </summary>

          <div className="space-y-4 border-t border-[#E8DFCA] p-4">
            {folder.subjects.map((group) => {
              const key = `${folder.key}|${group.subject}`;
              const typed = subjectQuery[key] ?? "";
              const q = typed.trim().toLowerCase();
              const shown = q ? group.assessments.filter((a) => a.title.toLowerCase().includes(q)) : group.assessments;
              return (
                <section key={group.subject} aria-label={`${folder.name}, ${group.subject}`} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-[#4F6F52]">{group.subject}</h3>
                    <Link href={`/check/new?classId=${group.classId}`} className={btnQuiet}>
                      <Plus size={16} aria-hidden /> New assessment
                    </Link>
                  </div>
                  {group.assessments.length > SEARCH_FROM ? (
                    <div className="relative">
                      <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8A918B]" />
                      <input
                        type="search"
                        value={typed}
                        onChange={(e) => setSubjectQuery((cur) => ({ ...cur, [key]: e.target.value }))}
                        placeholder="Search assessments"
                        aria-label={`Search ${group.subject} assessments`}
                        className={`${field} pl-9`}
                      />
                    </div>
                  ) : null}
                  {group.assessments.length === 0 ? (
                    <p className="text-sm text-[#606861]">No assessments in {group.subject} yet.</p>
                  ) : shown.length === 0 ? (
                    <p role="status" className="text-sm text-[#606861]">No assessment matches “{typed.trim()}”.</p>
                  ) : (
                    <ul className="grid gap-3 md:grid-cols-2">
                      {shown.map((a) => (
                        <AssessmentCard key={a.id} a={a} />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}