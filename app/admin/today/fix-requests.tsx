"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlarmClockOff, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { formatDate } from "@/lib/format";
import { formatDuration, formatTime, toTimeInput } from "@/lib/attendance";
import { reviewClockoutFix } from "./actions";

export type PendingFix = {
  id: string;
  work_date: string;
  clock_out: string;
  summary: string;
  reason: string;
  done_task_ids: string[];
  created_at: string;
  employee: { full_name: string; emp_code: string; avatar_url: string | null };
  attendance: { clock_in: string; tasks: { id: string; title: string; planned: boolean }[] };
};

const weekday = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));

/** Admin list of "Forgot to clock out?" requests waiting for a decision. */
export function FixRequests({ items }: { items: PendingFix[] }) {
  const [active, setActive] = useState<{ item: PendingFix; approve: boolean } | null>(null);
  if (!items.length) return null;

  return (
    <section className="card mt-6 overflow-hidden" aria-label="Missed clock-out requests">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4 sm:px-6">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold tracking-[-0.01em] text-ink">
            <AlarmClockOff className="h-4 w-4 text-brand" /> Missed clock-out requests
            <Badge tone="brand">{items.length}</Badge>
          </h2>
          <p className="mt-0.5 text-sm text-body">Employees who forgot to clock out and sent their leaving time.</p>
        </div>
      </header>
      <ul className="divide-y divide-line">
        {items.map((it) => {
          const mins = Math.round((Date.parse(it.clock_out) - Date.parse(it.attendance.clock_in)) / 60000);
          return (
            <li key={it.id} className="flex flex-wrap items-start gap-4 px-5 py-4 sm:px-6">
              <Avatar name={it.employee.full_name} src={it.employee.avatar_url} size={40} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">
                  {it.employee.full_name} <span className="font-normal text-body">· {it.employee.emp_code}</span>
                </p>
                <p className="mt-0.5 text-sm text-body">
                  {weekday(it.work_date)}, {formatDate(it.work_date)} · in <b className="text-ink">{formatTime(it.attendance.clock_in)}</b> → out{" "}
                  <b className="text-ink">{formatTime(it.clock_out)}</b> ({formatDuration(mins)})
                </p>
                <p className="mt-1.5 line-clamp-2 text-sm text-ink">{it.summary}</p>
                <p className="mt-1 text-[13px] text-body">
                  <span className="font-semibold">Why missed:</span> {it.reason}
                </p>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button size="sm" variant="secondary" onClick={() => setActive({ item: it, approve: false })}>
                  <X className="h-3.5 w-3.5" /> Reject
                </Button>
                <Button size="sm" onClick={() => setActive({ item: it, approve: true })}>
                  <Check className="h-3.5 w-3.5" /> Review & approve
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {active && <ReviewModal item={active.item} approve={active.approve} onClose={() => setActive(null)} />}
    </section>
  );
}

function ReviewModal({ item, approve, onClose }: { item: PendingFix; approve: boolean; onClose: () => void }) {
  const [time, setTime] = useState(toTimeInput(item.clock_out));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const done = item.attendance.tasks.filter((t) => item.done_task_ids.includes(t.id));
  const planned = item.attendance.tasks.filter((t) => t.planned);

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await reviewClockoutFix({ id: item.id, approve, note, time: approve ? time : "" });
      if (!res.ok) return setError(res.error);
      toast.success(approve ? `Clock-out added for ${item.employee.full_name}` : "Request rejected");
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      onClose={onClose}
      title={approve ? "Approve clock-out" : "Reject request"}
      description={`${item.employee.full_name} · ${weekday(item.work_date)}, ${formatDate(item.work_date)} · clocked in ${formatTime(item.attendance.clock_in)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            {approve ? "Approve" : "Reject"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && (
          <p role="alert" className="animate-pop rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">
            {error}
          </p>
        )}
        <div className="rounded-2xl bg-soft p-4 text-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-body">What they did</p>
          <p className="mt-1 whitespace-pre-line text-ink">{item.summary}</p>
          {planned.length > 0 && (
            <p className="mt-3 text-body">
              Planned tasks finished: <b className="text-ink">{done.length} of {planned.length}</b>
              {done.length > 0 && <span> ({done.map((t) => t.title).join(", ")})</span>}
            </p>
          )}
          <p className="mt-3 text-body">
            <span className="font-semibold text-ink">Why missed:</span> {item.reason}
          </p>
        </div>
        {approve && <Input label="Clock-out time" type="time" value={time} onChange={(e) => setTime(e.target.value)} hint="Change it if you know the real leaving time." />}
        <Textarea
          label={approve ? "Note (optional)" : "Reason for rejecting"}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder={approve ? "Confirmed with the team lead" : "Left at 15:00 per CCTV; please talk to me"}
          required={!approve}
        />
      </div>
    </Modal>
  );
}
