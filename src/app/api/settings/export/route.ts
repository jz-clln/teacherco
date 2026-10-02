// src/app/api/settings/export/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;

// Every table that holds the teacher's data, with a stable sort so paging never skips or repeats rows.
const TABLES: { name: string; order: string[] }[] = [
  { name: "profiles", order: ["id"] },
  { name: "classes", order: ["id"] },
  { name: "learners", order: ["id"] },
  { name: "class_enrollments", order: ["id"] },
  { name: "competencies", order: ["id"] },
  { name: "assessments", order: ["id"] },
  { name: "assessment_items", order: ["id"] },
  { name: "assessment_competencies", order: ["assessment_item_id", "competency_id"] },
  { name: "submissions", order: ["id"] },
  { name: "submission_answers", order: ["id"] },
  { name: "attendance_entries", order: ["id"] },
  { name: "record_imports", order: ["id"] },
  { name: "record_versions", order: ["id"] },
  { name: "teacher_notes", order: ["id"] },
  { name: "attention_rules", order: ["id"] },
  { name: "attention_flags", order: ["id"] },
  { name: "reports", order: ["id"] },
];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const data: Record<string, unknown[]> = {};

  for (const table of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = supabase.from(table.name).select("*");
      for (const column of table.order) query = query.order(column);
      const { data: page, error } = await query.range(from, from + PAGE_SIZE - 1);
      if (error) return NextResponse.json({ error: `Could not export ${table.name}.` }, { status: 500 });
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    data[table.name] = rows;
  }

  const body = JSON.stringify({ exportedAt: new Date().toISOString(), account: { id: user.id, email: user.email }, data }, null, 2);
  const filename = `teacherco-export-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}