import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { ago, CATEGORY_LABEL, lastActivity, STATUS_LABEL, STATUS_TONE, type HrRequest } from "@/lib/requests";

export type ListRow = HrRequest & { unread: boolean; employee?: { full_name: string; avatar_url: string | null } | null; preview?: string };

export function RequestList({ rows, hrefBase }: { rows: ListRow[]; hrefBase: string }) {
  return (
    <ul className="card divide-y divide-line overflow-hidden">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`${hrefBase}/${r.id}`} className={cn("group flex items-center gap-4 px-5 py-4 transition hover:bg-soft sm:px-6", r.unread && "bg-tint-2/40")}>
            {r.employee !== undefined && <Avatar name={r.employee?.full_name ?? "Former employee"} src={r.employee?.avatar_url} size={40} />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {r.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="New reply" />}
                <p className={cn("truncate text-[15px] text-ink", r.unread ? "font-bold" : "font-semibold")}>{r.subject}</p>
              </div>
              <p className="mt-0.5 truncate text-[13px] text-body">
                {r.employee !== undefined && <b className="font-semibold text-ink">{r.employee?.full_name ?? "Former employee"} · </b>}
                {CATEGORY_LABEL[r.category]} · {ago(lastActivity(r))}
              </p>
            </div>
            <Badge tone={STATUS_TONE[r.status]} dot>{STATUS_LABEL[r.status]}</Badge>
            <ChevronRight className="hidden h-4 w-4 shrink-0 text-body transition group-hover:translate-x-0.5 sm:block" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
