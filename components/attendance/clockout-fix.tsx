"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlarmClockOff, Clock4, X } from "lucide-react";
import { toast } from "sonner";
import { cancelClockoutFix, requestClockoutFix } from "@/app/app/clockout-fix-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { formatTime, type Task } from "@/lib/attendance";

export type FixRequest = {
  id: string;
  attendance_id: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  clock_out: string;
  review_note: string | null;
};

export type MissedDay = {
  attendance_id: string;
  day: string;
  clock_in: string;
  tasks: Task[];
};

const weekday = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));

/**
 * Status + action for one missed clock-out day.
 * No request (or last one rejected/cancelled) → "Forgot to clock out?" button.
 * Pending → shows the requested time with a Cancel button.
 */
export function ClockoutFix({ day, request, workEnd = "17:00", compact }: { day: MissedDay; request?: FixRequest | null; workEnd?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const cancel = () =>
    start(async () => {
      if (!request) return;
      const res = await cancelClockoutFix(request.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Request withdrawn");
      router.refresh();
    });

  if (request?.status === "pending") {
    return (
      <div className={cn("rounded-2xl border border-line bg-soft p-4", compact && "p-3")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Clock4 className="h-4 w-4 text-warning" />
            <span className="text-body">
              Asked to add clock-out at <b className="text-ink">{formatTime(request.clock_out)}</b>
            </span>
            <Badge tone="warning" dot>
              Waiting for admin
            </Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={cancel} loading={pending}>
            <X className="h-3.5 w-3.5" /> Withdraw
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl border border-brand/20 bg-tint-2 p-4", compact && "p-3")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <AlarmClockOff className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-ink">
              {compact ? `${weekday(day.day)}, ${formatDate(day.day)}: no clock-out` : "You didn't clock out this day"}
            </p>
            <p className="text-body">
              {request?.status === "rejected"
                ? `Your last request was rejected${request.review_note ? `: “${request.review_note}”` : "."} You can send a new one.`
                : `Clocked in at ${formatTime(day.clock_in)}. Tell your admin when you left so your hours count.`}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          Forgot to clock out?
        </Button>
      </div>
      {open && <FixModal day={day} workEnd={workEnd} onClose={() => setOpen(false)} />}
    </div>
  );
}

function FixModal({ day, workEnd, onClose }: { day: MissedDay; workEnd: string; onClose: () => void }) {
  const planned = day.tasks.filter((t) => t.planned);
  const [time, setTime] = useState(workEnd);
  const [done, setDone] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await requestClockoutFix({ attendanceId: day.attendance_id, time, done, summary, reason });
      if (!res.ok) return setError(res.error);
      toast.success("Request sent to your admin");
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      onClose={onClose}
      title="Forgot to clock out?"
      description={`${weekday(day.day)}, ${formatDate(day.day)} · clocked in at ${formatTime(day.clock_in)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            Send to admin
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
        <Input label="When did you leave?" type="time" value={time} onChange={(e) => setTime(e.target.value)} required hint="Your admin can adjust this when approving." />

        {planned.length > 0 && (
          <fieldset>
            <legend className="text-sm font-semibold text-ink">Which planned tasks did you finish?</legend>
            <ul className="mt-2 space-y-1.5">
              {planned.map((t) => {
                const on = done.includes(t.id);
                return (
                  <li key={t.id}>
                    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors", on ? "border-success/40 bg-success-tint" : "border-line hover:bg-soft")}>
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-[var(--color-success)]"
                        checked={on}
                        onChange={() => setDone(on ? done.filter((x) => x !== t.id) : [...done, t.id])}
                      />
                      <span className={cn("text-ink", on && "font-semibold")}>{t.title}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}

        <Textarea label="What did you get done?" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} placeholder="Finished the reel edit, sent drafts to the client…" required />
        <Textarea label="Why was the clock-out missed?" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Left in a hurry for a client shoot" required />
      </div>
    </Modal>
  );
}
