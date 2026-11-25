import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MarkSeen, ReplyBox, Thread } from "@/components/requests/thread";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { CATEGORY_LABEL, REQUEST_COLUMNS, STATUS_LABEL, STATUS_TONE, unreadForEmployee, type HrRequest, type RequestMessage } from "@/lib/requests";
import { markSeenEmployee, replyAsEmployee } from "../actions";
import { WithdrawButton } from "./withdraw";

export const metadata: Metadata = { title: "Request" };

export default async function MyRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, profile } = await requireRole("employee");
  const [{ data: req }, { data: msgs }] = await Promise.all([
    supabase.from("hr_requests").select(REQUEST_COLUMNS).eq("id", id).eq("employee_id", profile.id).maybeSingle(),
    supabase.from("hr_request_messages").select("id, from_admin, body, created_at, author:profiles!hr_request_messages_author_id_fkey(full_name)").eq("request_id", id).order("created_at"),
  ]);
  if (!req) notFound();
  const r = req as HrRequest;
  const messages: RequestMessage[] = (msgs ?? []).map((m) => ({
    id: m.id,
    from_admin: m.from_admin,
    body: m.body,
    created_at: m.created_at,
    author: (m.author as unknown as { full_name: string } | null)?.full_name ?? null,
  }));

  return (
    <>
      <MarkSeen id={r.id} unread={unreadForEmployee(r)} action={markSeenEmployee} />
      <Link href="/app/requests" className="group -ml-3 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-body transition hover:bg-white hover:text-ink">
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> Requests to HR
      </Link>
      <div className="animate-enter mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-ink">{r.subject}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-body">
            <Badge tone={STATUS_TONE[r.status]} dot>{STATUS_LABEL[r.status]}</Badge>
            <span>{CATEGORY_LABEL[r.category]} · sent {formatDate(r.created_at)}</span>
          </p>
        </div>
        {(r.status === "open" || r.status === "in_progress") && <WithdrawButton id={r.id} />}
      </div>

      <div className="mx-auto mt-8 max-w-3xl space-y-6">
        <Thread messages={messages} side="employee" employeeName={profile.full_name} />
        {r.status === "withdrawn" ? (
          <p className="rounded-2xl border border-line bg-white px-5 py-4 text-sm text-body">You withdrew this request. Start a new one if you still need help.</p>
        ) : (
          <ReplyBox
            id={r.id}
            action={replyAsEmployee}
            placeholder={r.status === "resolved" ? "Not sorted yet? Reply to reopen it." : "Add more details or reply to HR"}
            note={r.status === "resolved" ? "Replying reopens the request." : undefined}
          />
        )}
      </div>
    </>
  );
}
