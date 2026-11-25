import type { Metadata } from "next";
import { MessageSquareText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { RequestList } from "@/components/requests/request-list";
import { requireRole } from "@/lib/auth";
import { lastActivity, REQUEST_COLUMNS, unreadForEmployee, type HrRequest } from "@/lib/requests";
import { NewRequestButton } from "./new-request";

export const metadata: Metadata = { title: "Requests to HR" };

export default async function MyRequestsPage() {
  const { supabase, profile } = await requireRole("employee");
  // RLS returns only this employee's requests.
  const { data } = await supabase.from("hr_requests").select(REQUEST_COLUMNS).eq("employee_id", profile.id).limit(200);
  const rows = ((data ?? []) as HrRequest[])
    .map((r) => ({ ...r, unread: unreadForEmployee(r) }))
    .sort((a, b) => Number(b.unread) - Number(a.unread) || lastActivity(b).localeCompare(lastActivity(a)));
  const openCount = rows.filter((r) => r.status === "open" || r.status === "in_progress").length;
  const active = rows.filter((r) => r.status === "open" || r.status === "in_progress");
  const closed = rows.filter((r) => r.status === "resolved" || r.status === "withdrawn");
  const limit = openCount >= 5 ? "You already have 5 open requests. Wait for a reply, or add to one of them." : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Me"
        title="Requests to HR"
        description="Ask for a letter, report a payslip or attendance problem, or raise a concern. HR replies here."
        actions={rows.length > 0 ? <NewRequestButton disabled={limit} /> : undefined}
      />

      {rows.length === 0 ? (
        <Card className="mt-8">
          <EmptyState
            icon={<MessageSquareText />}
            title="No requests yet"
            description="Need something from HR? Send a request and track the reply here instead of chasing it on chat."
            action={<NewRequestButton />}
          />
        </Card>
      ) : (
        <>
          {active.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.14em] text-body">Open ({active.length})</h2>
              <RequestList rows={active} hrefBase="/app/requests" />
            </section>
          )}
          {closed.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.14em] text-body">Closed</h2>
              <RequestList rows={closed} hrefBase="/app/requests" />
            </section>
          )}
        </>
      )}
    </>
  );
}
