import Link from "next/link";
import { requireAdmin } from "@/lib/auth/access-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { CodeControls, GenerateCodeForm, RequestControls } from "@/features/invites/components/admin-controls";

export const metadata = { title: "Invite administration" };
export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(value)) : "—";
const pageNumber = (value?: string) => /^\d{1,6}$/.test(value ?? "") ? Math.max(1, Number(value)) : 1;
type Params = { codes?: string; history?: string; requests?: string };

function Pagination({ name, page, total, params }: { name: keyof Params; page: number; total: number; params: Params }) {
  function href(next: number) {
    const search = new URLSearchParams();
    for (const key of ["codes", "history", "requests"] as const) search.set(key, String(key === name ? next : pageNumber(params[key])));
    return `/admin/invites?${search}#${name}`;
  }
  return <nav aria-label={`${name} pages`} className="mt-4 flex items-center gap-4 text-sm text-[#4F6F52]">
    {page > 1 ? <Link href={href(page - 1)} className="tc-button tc-quiet font-semibold">Previous</Link> : null}
    <span>Page {page} · {total} records</span>
    {page * PAGE_SIZE < total ? <Link href={href(page + 1)} className="tc-button tc-quiet font-semibold">Next</Link> : null}
  </nav>;
}

export default async function AdminInvitesPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const pages = { codes: pageNumber(params.codes), history: pageNumber(params.history), requests: pageNumber(params.requests) };
  const db = createAdminClient();
  const [codes, history, requests] = await Promise.all([
    db.from("invite_codes").select("id,code,email_restriction,is_active,redeemed_at,invite_code_redemptions(redeemed_email)", { count: "exact" }).order("created_at", { ascending: false }).order("id").range((pages.codes - 1) * PAGE_SIZE, pages.codes * PAGE_SIZE - 1),
    db.from("invite_code_redemptions").select("id,code,redeemed_email,redeemed_at,invite_code_id", { count: "exact" }).order("redeemed_at", { ascending: false }).order("id").range((pages.history - 1) * PAGE_SIZE, pages.history * PAGE_SIZE - 1),
    db.from("access_requests").select("id,name,email,message,status,created_at", { count: "exact" }).order("created_at", { ascending: false }).order("id").range((pages.requests - 1) * PAGE_SIZE, pages.requests * PAGE_SIZE - 1),
  ]);
  if (codes.error || history.error || requests.error) throw new Error("Could not load invite administration. Please try again.");
  const cell = "border-b border-[#E3E5E1] px-3 py-3 text-left align-top";
  return <main className="min-h-screen bg-[#F5EFE6] px-4 py-8 text-[#1F2A22] sm:px-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href="/today" className="tc-button tc-quiet inline-flex min-h-11 items-center text-sm font-semibold text-[#4F6F52]">← Back to TeacherCo</Link>
      <header><p className="text-sm font-semibold text-[#4F6F52]">TEACHERCO ADMIN</p><h1 className="mt-1 text-3xl font-bold text-[#1A4D2E]">Invite codes</h1><p className="mt-2 text-sm text-[#606861]">Generate invitations and review requests. Deleting or disabling a code does not revoke access already activated.</p></header>
      <Card><GenerateCodeForm /></Card>
      <Card>
        <h2 id="codes" className="text-xl font-semibold">Codes</h2>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Code", "Status", "Restricted email", "Redeemed by", "Redeemed at (Manila)", "Actions"].map((h) => <th key={h} className={cell}>{h}</th>)}</tr></thead>
          <tbody>{codes.data?.map((code) => {
            const redemption = Array.isArray(code.invite_code_redemptions) ? code.invite_code_redemptions[0] : code.invite_code_redemptions;
            return <tr key={code.id}>
              <td className={`${cell} whitespace-nowrap font-mono font-semibold`}>{code.code}</td>
              <td className={cell}>{code.redeemed_at ? `Used${code.is_active ? "" : " · Disabled"}` : code.is_active ? "Unused" : "Disabled"}</td>
              <td className={cell}>{code.email_restriction ?? "None"}</td><td className={cell}>{redemption?.redeemed_email ?? "—"}</td><td className={cell}>{date(code.redeemed_at)}</td>
              <td className={cell}><CodeControls id={code.id} code={code.code} active={code.is_active} /></td>
            </tr>;
          })}</tbody></table></div>
        {!codes.data?.length ? <p className="mt-4 text-sm text-[#606861]">No codes on this page.</p> : null}
        <Pagination name="codes" page={pages.codes} total={codes.count ?? 0} params={params} />
      </Card>
      <Card>
        <h2 id="requests" className="text-xl font-semibold">Access requests</h2><p className="mt-2 text-sm text-[#606861]">Approval records your decision only. Generate and share a code separately; nothing is sent automatically.</p>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Name / email", "Message", "Status", "Requested (Manila)", "Review"].map((h) => <th key={h} className={cell}>{h}</th>)}</tr></thead><tbody>
          {requests.data?.map((request) => <tr key={request.id}><td className={cell}>{request.name}<br />{request.email}</td><td className={`${cell} min-w-48 whitespace-pre-wrap wrap-break-word`}>{request.message ?? "—"}</td><td className={cell}>{request.status}</td><td className={cell}>{date(request.created_at)}</td><td className={cell}><RequestControls id={request.id} /></td></tr>)}
        </tbody></table></div>
        {!requests.data?.length ? <p className="mt-4 text-sm text-[#606861]">No requests on this page.</p> : null}
        <Pagination name="requests" page={pages.requests} total={requests.count ?? 0} params={params} />
      </Card>
      <Card>
        <h2 id="history" className="text-xl font-semibold">Redemption history</h2>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Code", "Redeemed by", "Redeemed at (Manila)", "Code record"].map((h) => <th key={h} className={cell}>{h}</th>)}</tr></thead><tbody>
          {history.data?.map((entry) => <tr key={entry.id}><td className={`${cell} whitespace-nowrap font-mono`}>{entry.code}</td><td className={cell}>{entry.redeemed_email}</td><td className={cell}>{date(entry.redeemed_at)}</td><td className={cell}>{entry.invite_code_id ? "Retained" : "Deleted"}</td></tr>)}
        </tbody></table></div>
        {!history.data?.length ? <p className="mt-4 text-sm text-[#606861]">No redemptions on this page.</p> : null}
        <Pagination name="history" page={pages.history} total={history.count ?? 0} params={params} />
      </Card>
    </div>
  </main>;
}