import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { MarkSeen, ReplyBox, Thread } from "@/components/requests/thread";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { CATEGORY_LABEL, REQUEST_COLUMNS, STATUS_LABEL, STATUS_TONE, unreadForAdmin, type HrRequest, type RequestMessage } from "@/lib/requests";
import { markSeenAdmin, replyAsAdmin } from "../actions";
import { StatusButtons } from "./status-buttons";

export const metadata: Metadata = { title: "Request" };

export default async function AdminRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireRole("admin");
  const [{ data: req }, { data: msgs }] = await Promise.all([
    supabase
      .from("hr_requests")
      .select(`${REQUEST_COLUMNS}, employee:profiles!hr_requests_employee_id_fkey(full_name, emp_code, designation, avatar_url), resolver:profiles!hr_requests_resolved_by_fkey(full_name)`)
      .eq("id", id)
      .maybeSingle(),
    supabase.from("hr_request_messages").select("id, from_admin, body, created_at, author:profiles!hr_request_messages_author_id_fkey(full_name)").eq("request_id", id).order("created_at"),
  ]);
  if (!req) notFound();
  const r = req as unknown as HrRequest & {
    employee: { full_name: string; emp_code: string; designation: string | null; avatar_url: string | null } | null;
    resolver: { full_name: string } | null;
  };
  const name = r.employee?.full_name ?? "Former employee";
  const messages: RequestMessage[] = (msgs ?? []).map((m) => ({
    id: m.id,
    from_admin: m.from_admin,
    body: m.body,
    created_at: m.created_at,
    author: (m.author as unknown as { full_name: string } | null)?.full_name ?? null,
  }));

  return (
    <>
      <MarkSeen id={r.id} unread={unreadForAdmin(r)} action={markSeenAdmin} />
      <Link href="/admin/requests" className="group -ml-3 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-body transition hover:bg-white hover:text-ink">
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> Requests
      </Link>
      <div className="animate-enter mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-ink">{r.subject}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-body">
            <Badge tone={STATUS_TONE[r.status]} dot>{r.status === "open" ? "New" : STATUS_LABEL[r.status]}</Badge>
            <span>{CATEGORY_LABEL[r.category]} · sent {formatDate(r.created_at)}</span>
            {r.status === "resolved" && r.resolver && <span>· resolved by {r.resolver.full_name}</span>}
          </p>
        </div>
        <StatusButtons id={r.id} status={r.status} />
      </div>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-6">
          <Thread messages={messages} side="admin" employeeName={name} />
          {r.status === "withdrawn" ? (
            <p className="rounded-2xl border border-line bg-white px-5 py-4 text-sm text-body">{name} withdrew this request.</p>
          ) : (
            <ReplyBox id={r.id} action={replyAsAdmin} placeholder={`Reply to ${name.split(" ")[0]}`} note={r.status === "open" ? "Replying marks it as in progress." : undefined} />
          )}
        </div>
        <aside className="card p-5">
          <div className="flex items-center gap-3">
            <Avatar name={name} src={r.employee?.avatar_url} size={44} />
            <div className="min-w-0">
              <p className="truncate font-bold text-ink">{name}</p>
              <p className="truncate text-[13px] text-body">{[r.employee?.emp_code, r.employee?.designation].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          {r.employee && (
            <Link href={`/admin/employees/${r.employee_id}`} className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-body hover:text-ink">
              Open their profile <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}
