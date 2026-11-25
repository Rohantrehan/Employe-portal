import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { RequestList, type ListRow } from "@/components/requests/request-list";
import { requireRole } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { lastActivity, REQUEST_COLUMNS, unreadForAdmin, type HrRequest } from "@/lib/requests";

export const metadata: Metadata = { title: "Requests" };

const TABS = [
  { value: "active", label: "Needs attention" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
] as const;
type Tab = (typeof TABS)[number]["value"];

export default async function AdminRequestsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { supabase } = await requireRole("admin");
  const sp = await searchParams;
  const tab: Tab = sp.tab === "resolved" || sp.tab === "all" ? sp.tab : "active";
  const { data } = await supabase
    .from("hr_requests")
    .select(`${REQUEST_COLUMNS}, employee:profiles!hr_requests_employee_id_fkey(full_name, avatar_url)`)
    .order("updated_at", { ascending: false })
    .limit(500);

  const all: ListRow[] = ((data ?? []) as unknown as (HrRequest & { employee: { full_name: string; avatar_url: string | null } | null })[])
    .map((r) => ({ ...r, unread: unreadForAdmin(r) }))
    .sort((a, b) => Number(b.unread) - Number(a.unread) || lastActivity(b).localeCompare(lastActivity(a)));
  const isActive = (r: ListRow) => r.status === "open" || r.status === "in_progress" || r.unread;
  const count: Record<Tab, number> = {
    active: all.filter(isActive).length,
    resolved: all.filter((r) => r.status === "resolved" || r.status === "withdrawn").length,
    all: all.length,
  };
  const rows = tab === "active" ? all.filter(isActive) : tab === "resolved" ? all.filter((r) => r.status === "resolved" || r.status === "withdrawn") : all;

  return (
    <>
      <PageHeader eyebrow="People" title="Requests" description="Letters, payslip and attendance questions, access problems and concerns from the team." />
      <nav aria-label="Filter" className="mt-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-white p-1">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === "active" ? "/admin/requests" : `/admin/requests?tab=${t.value}`}
            aria-current={tab === t.value ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              tab === t.value ? "bg-ink text-white" : "text-body hover:bg-app hover:text-ink",
            )}
          >
            {t.label}
            <span className={cn("rounded-full px-1.5 text-[11px] font-bold", tab === t.value ? "bg-brand text-white" : "bg-grey-tile text-body")}>{count[t.value]}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Inbox />}
              title={tab === "active" ? "All caught up" : "Nothing here"}
              description={tab === "active" ? "No requests are waiting. Employees send them from Requests to HR." : undefined}
            />
          </Card>
        ) : (
          <RequestList rows={rows} hrefBase="/admin/requests" />
        )}
      </div>
    </>
  );
}
