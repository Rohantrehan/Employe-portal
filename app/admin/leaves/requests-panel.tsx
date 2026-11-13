"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FileText, Inbox, Plane, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { LEAVE_STATUS, formatDays, formatRange, type DayPart, type LeaveStatus, type LeaveType } from "@/lib/leave";
import { attachmentUrl, reviewLeave } from "./actions";

export type AdminRequest = {
  id: string;
  typeId: string;
  start: string;
  end: string;
  part: DayPart;
  days: number;
  reason: string;
  attachment: string | null;
  status: LeaveStatus;
  reviewNote: string | null;
  createdAt: string;
  employeeId: string;
  employee: string;
  empCode: string;
  avatar: string | null;
};

export function RequestsPanel({ requests, types, today }: { requests: AdminRequest[]; types: LeaveType[]; today: string }) {
  const typeById = useMemo(() => Object.fromEntries(types.map((t) => [t.id, t])), [types]);
  const [decline, setDecline] = useState<{ req: AdminRequest; revoke: boolean } | null>(null);
  const [filter, setFilter] = useState<"all" | LeaveStatus>("all");
  const [, start] = useTransition();

  const pending = requests.filter((r) => r.status === "pending").sort((a, b) => a.start.localeCompare(b.start));
  const soon = requests
    .filter((r) => r.status === "approved" && r.end >= today && r.start <= addDays(today, 14))
    .sort((a, b) => a.start.localeCompare(b.start));
  const history = requests.filter((r) => r.status !== "pending" && (filter === "all" || r.status === filter));

  const openFile = (path: string) =>
    start(async () => {
      const res = await attachmentUrl(path);
      if (!res.ok) return void toast.error(res.error);
      window.open(res.url, "_blank", "noopener");
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <Card className="overflow-hidden">
          <CardHeader title="Waiting for approval" description="Oldest dates first. Approving takes the days from their balance." />
          {pending.length === 0 ? (
            <EmptyState icon={<Inbox />} title="All caught up" description="New leave requests will appear here." className="py-10" />
          ) : (
            <ul className="divide-y divide-line">
              {pending.map((r) => (
                <PendingRow key={r.id} r={r} type={typeById[r.typeId]} today={today} onReject={() => setDecline({ req: r, revoke: false })} onFile={openFile} />
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="History"
            action={
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
                aria-label="Filter by status"
                className="h-9 cursor-pointer rounded-full border border-line bg-white px-3 text-sm font-semibold text-ink outline-none focus:border-brand focus:ring-4 focus:ring-tint"
              >
                <option value="all">All decisions</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
            }
          />
          {history.length === 0 ? (
            <EmptyState icon={<Plane />} title="Nothing here yet" className="py-10" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Employee</TH>
                  <TH>Type</TH>
                  <TH>Dates</TH>
                  <TH>Days</TH>
                  <TH>Status</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {history.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/admin/employees/${r.employeeId}`} className="font-semibold hover:text-brand">
                        {r.employee}
                      </Link>
                    </TD>
                    <TD>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: typeById[r.typeId]?.color }} />
                        {typeById[r.typeId]?.name}
                      </span>
                    </TD>
                    <TD className="whitespace-nowrap text-body">{formatRange(r.start, r.end, r.part)}</TD>
                    <TD className="tabular-nums">{r.days}</TD>
                    <TD>
                      <Badge tone={LEAVE_STATUS[r.status].tone}>{LEAVE_STATUS[r.status].label}</Badge>
                      {r.reviewNote && <p className="mt-1 max-w-[220px] truncate text-xs text-body" title={r.reviewNote}>“{r.reviewNote}”</p>}
                    </TD>
                    <TD className="text-right">
                      {r.status === "approved" && r.end >= today && (
                        <Button size="sm" variant="ghost" onClick={() => setDecline({ req: r, revoke: true })}>
                          Revoke
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      <Card className="h-fit overflow-hidden">
        <CardHeader title="On leave · next 14 days" />
        {soon.length === 0 ? (
          <p className="px-6 py-6 text-sm text-body">Nobody has approved leave coming up.</p>
        ) : (
          <ul className="divide-y divide-line">
            {soon.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                <Avatar name={r.employee} src={r.avatar} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{r.employee}</p>
                  <p className="text-[13px] text-body">{formatRange(r.start, r.end, r.part)}</p>
                </div>
                {r.start <= today ? <Badge tone="info" dot>Now</Badge> : <span className="h-2.5 w-2.5 rounded-full" style={{ background: typeById[r.typeId]?.color }} title={typeById[r.typeId]?.name} />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {decline && <DeclineModal req={decline.req} revoke={decline.revoke} typeName={typeById[decline.req.typeId]?.name ?? "Leave"} onClose={() => setDecline(null)} />}
    </div>
  );
}

function addDays(d: string, n: number) {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

function PendingRow({
  r,
  type,
  today,
  onReject,
  onFile,
}: {
  r: AdminRequest;
  type?: LeaveType;
  today: string;
  onReject: () => void;
  onFile: (p: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const approve = () =>
    start(async () => {
      const res = await reviewLeave(r.id, true, "");
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Approved ${formatDays(r.days)} for ${r.employee}`);
      router.refresh();
    });

  return (
    <li className="flex flex-wrap items-start gap-4 px-5 py-4 sm:px-6">
      <Avatar name={r.employee} src={r.avatar} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/employees/${r.employeeId}`} className="font-bold text-ink hover:text-brand">
            {r.employee}
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-soft px-2.5 py-0.5 text-xs font-bold text-ink">
            <span className="h-2 w-2 rounded-full" style={{ background: type?.color }} />
            {type?.name}
          </span>
          {r.start < today && <Badge tone="warning">Dates already started</Badge>}
        </div>
        <p className="mt-1 text-sm text-ink">
          {formatRange(r.start, r.end, r.part)} · <b>{formatDays(r.days)}</b>
        </p>
        <p className="mt-1 text-sm text-body">“{r.reason}”</p>
        <p className="mt-1 text-xs text-body">Asked {formatDate(r.createdAt)}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {r.attachment && (
          <Button size="sm" variant="ghost" onClick={() => onFile(r.attachment!)}>
            <FileText className="h-3.5 w-3.5" /> File
          </Button>
        )}
        <Button size="sm" onClick={approve} loading={pending}>
          <Check className="h-4 w-4" /> Approve
        </Button>
        <Button size="sm" variant="secondary" onClick={onReject} disabled={pending}>
          <X className="h-4 w-4" /> Reject
        </Button>
      </div>
    </li>
  );
}

function DeclineModal({ req, revoke, typeName, onClose }: { req: AdminRequest; revoke: boolean; typeName: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = () =>
    start(async () => {
      setError(null);
      const res = await reviewLeave(req.id, false, note);
      if (!res.ok) return setError(res.error);
      toast.success(revoke ? "Leave revoked and balance restored" : "Request rejected");
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      title={revoke ? "Revoke approved leave?" : "Reject leave request?"}
      description={`${req.employee} · ${typeName}, ${formatRange(req.start, req.end, req.part)} (${formatDays(req.days)}).${revoke ? " The days go back to their balance." : ""}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending} disabled={note.trim().length < 2}>
            {revoke ? "Revoke" : "Reject"}
          </Button>
        </>
      }
    >
      {error && <p role="alert" className="mb-4 rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">{error}</p>}
      <Textarea label="Reason" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Client launch that week" hint="The employee sees this." />
    </Modal>
  );
}
