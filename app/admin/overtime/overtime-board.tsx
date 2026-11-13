"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Inbox, Timer, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDuration } from "@/lib/attendance";
import { formatDate } from "@/lib/format";
import { LEAVE_STATUS } from "@/lib/leave";
import { formatHours, type OvertimeStatus } from "@/lib/overtime";
import { reviewOvertime } from "./actions";

export type AdminEntry = {
  id: string;
  employeeId: string;
  employee: string;
  empCode: string;
  avatar: string | null;
  date: string;
  hours: number;
  description: string;
  status: OvertimeStatus;
  reviewNote: string | null;
  workedMinutes: number | null;
};

export function OvertimeBoard({ pending, monthEntries, monthName }: { pending: AdminEntry[]; monthEntries: AdminEntry[]; monthName: string }) {
  const [decline, setDecline] = useState<{ entry: AdminEntry; revoke: boolean } | null>(null);

  const summary = useMemo(() => {
    const map = new Map<string, { id: string; name: string; code: string; avatar: string | null; approved: number; pending: number; days: number }>();
    for (const e of monthEntries) {
      if (e.status !== "approved" && e.status !== "pending") continue;
      const row = map.get(e.employeeId) ?? { id: e.employeeId, name: e.employee, code: e.empCode, avatar: e.avatar, approved: 0, pending: 0, days: 0 };
      if (e.status === "approved") {
        row.approved += e.hours;
        row.days += 1;
      } else row.pending += e.hours;
      map.set(e.employeeId, row);
    }
    return [...map.values()].sort((a, b) => b.approved - a.approved);
  }, [monthEntries]);

  const decided = monthEntries.filter((e) => e.status !== "pending");

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <Card className="overflow-hidden">
          <CardHeader title="Waiting for approval" description="Worked time from attendance is shown for each day to help you check." />
          {pending.length === 0 ? (
            <EmptyState icon={<Inbox />} title="All caught up" description="New extra-hour entries will appear here." className="py-10" />
          ) : (
            <ul className="divide-y divide-line">
              {pending.map((e) => (
                <PendingRow key={e.id} e={e} onReject={() => setDecline({ entry: e, revoke: false })} />
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title={`Decisions · ${monthName}`} />
          {decided.length === 0 ? (
            <EmptyState icon={<Timer />} title="Nothing decided this month" className="py-10" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Employee</TH>
                  <TH>Date</TH>
                  <TH>Hours</TH>
                  <TH>Status</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {decided.map((e) => (
                  <TR key={e.id}>
                    <TD>
                      <Link href={`/admin/employees/${e.employeeId}`} className="font-semibold hover:text-brand">
                        {e.employee}
                      </Link>
                      <p className="max-w-xs truncate text-xs text-body" title={e.description}>
                        {e.description}
                      </p>
                    </TD>
                    <TD className="whitespace-nowrap text-body">{formatDate(e.date)}</TD>
                    <TD className="font-semibold tabular-nums">{formatHours(e.hours)}</TD>
                    <TD>
                      <Badge tone={LEAVE_STATUS[e.status].tone}>{LEAVE_STATUS[e.status].label}</Badge>
                      {e.reviewNote && <p className="mt-1 max-w-[200px] truncate text-xs text-body">“{e.reviewNote}”</p>}
                    </TD>
                    <TD className="text-right">
                      {e.status === "approved" && (
                        <Button size="sm" variant="ghost" onClick={() => setDecline({ entry: e, revoke: true })}>
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
        <CardHeader title={`Totals · ${monthName}`} description="Approved hours feed into payroll." />
        {summary.length === 0 ? (
          <p className="px-6 py-6 text-sm text-body">No extra hours this month.</p>
        ) : (
          <ul className="divide-y divide-line">
            {summary.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                <Avatar name={s.name} src={s.avatar} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{s.name}</p>
                  <p className="text-[13px] text-body">
                    {s.days} day{s.days === 1 ? "" : "s"}
                    {s.pending > 0 && <span className="text-warning"> · {formatHours(s.pending)} pending</span>}
                  </p>
                </div>
                <span className="text-lg font-extrabold tabular-nums text-ink">{formatHours(s.approved)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {decline && <DeclineModal entry={decline.entry} revoke={decline.revoke} onClose={() => setDecline(null)} />}
    </div>
  );
}

function PendingRow({ e, onReject }: { e: AdminEntry; onReject: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const approve = () =>
    start(async () => {
      const res = await reviewOvertime(e.id, true, "");
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Approved ${formatHours(e.hours)} for ${e.employee}`);
      router.refresh();
    });

  return (
    <li className="flex flex-wrap items-start gap-4 px-5 py-4 sm:px-6">
      <Avatar name={e.employee} src={e.avatar} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/employees/${e.employeeId}`} className="font-bold text-ink hover:text-brand">
            {e.employee}
          </Link>
          <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-white">{formatHours(e.hours)}</span>
        </div>
        <p className="mt-1 text-sm text-ink">
          {formatDate(e.date)}
          <span className="text-body">
            {" · "}
            {e.workedMinutes != null ? `attendance shows ${formatDuration(e.workedMinutes)} worked` : "no attendance that day"}
          </span>
        </p>
        <p className="mt-1 whitespace-pre-line text-sm text-body">“{e.description}”</p>
      </div>
      <div className="flex shrink-0 gap-2">
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

function DeclineModal({ entry, revoke, onClose }: { entry: AdminEntry; revoke: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = () =>
    start(async () => {
      setError(null);
      const res = await reviewOvertime(entry.id, false, note);
      if (!res.ok) return setError(res.error);
      toast.success(revoke ? "Approval revoked" : "Entry rejected");
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      title={revoke ? "Revoke approved hours?" : "Reject extra hours?"}
      description={`${entry.employee} · ${formatHours(entry.hours)} on ${formatDate(entry.date)}.`}
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
      <Textarea label="Reason" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. This was within normal hours" hint="The employee sees this." />
    </Modal>
  );
}
