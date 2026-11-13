"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Plus, Timer } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/misc";
import { formatDuration } from "@/lib/attendance";
import { formatDate } from "@/lib/format";
import { LEAVE_STATUS } from "@/lib/leave";
import { formatHours, type OvertimeStatus } from "@/lib/overtime";
import { cancelOvertime, logOvertime } from "./actions";

export type MyEntry = { id: string; date: string; hours: number; description: string; status: OvertimeStatus; reviewNote: string | null };
export type Suggestion = { date: string; workedMinutes: number; extra: number };

export function EmployeeOvertime({
  header,
  stats,
  entries,
  suggestions,
  today,
  minDate,
}: {
  header: React.ReactNode;
  stats: React.ReactNode;
  entries: MyEntry[];
  suggestions: Suggestion[];
  today: string;
  minDate: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<{ date: string; hours: string } | null>(null);
  const [pending, start] = useTransition();

  const cancel = (id: string) =>
    start(async () => {
      const res = await cancelOvertime(id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Entry cancelled");
      router.refresh();
    });

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        {header}
        <Button size="lg" onClick={() => setForm({ date: today, hours: "" })}>
          <Plus className="h-4 w-4" /> Log extra hours
        </Button>
      </div>

      <div className="mt-8">{stats}</div>

      {suggestions.length > 0 && (
        <Card className="mt-6 overflow-hidden">
          <CardHeader title="Long days you haven't logged" description="From your attendance: days over 8 hours. Log them if the extra time was real work." />
          <ul className="divide-y divide-line">
            {suggestions.slice(0, 6).map((s) => (
              <li key={s.date} className="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-warning-tint text-warning">
                  <Lightbulb className="h-4 w-4" />
                </span>
                <p className="min-w-0 flex-1 text-sm text-ink">
                  <b>{formatDate(s.date)}</b> · worked {formatDuration(s.workedMinutes)} · about <b>{formatHours(s.extra)}</b> extra
                </p>
                <Button size="sm" variant="secondary" onClick={() => setForm({ date: s.date, hours: String(s.extra) })}>
                  Log it
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-6 overflow-hidden">
        <CardHeader title="My entries" />
        {entries.length === 0 ? (
          <EmptyState icon={<Timer />} title="No extra hours logged" description="Use “Log extra hours” after a long day." />
        ) : (
          <ul className="divide-y divide-line">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start gap-4 px-5 py-4 sm:px-6">
                <span className="grid h-12 w-16 shrink-0 place-items-center rounded-2xl bg-ink text-sm font-extrabold text-white">{formatHours(e.hours)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-ink">{formatDate(e.date)}</p>
                    <Badge tone={LEAVE_STATUS[e.status].tone} dot={e.status === "pending"}>
                      {LEAVE_STATUS[e.status].label}
                    </Badge>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm text-body">{e.description}</p>
                  {e.reviewNote && <p className="mt-1 text-[13px] text-body">Admin: “{e.reviewNote}”</p>}
                </div>
                {e.status === "pending" && (
                  <Button size="sm" variant="ghost" onClick={() => cancel(e.id)} disabled={pending}>
                    Cancel
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {form && <LogModal initial={form} today={today} minDate={minDate} onClose={() => setForm(null)} />}
    </>
  );
}

function LogModal({ initial, today, minDate, onClose }: { initial: { date: string; hours: string }; today: string; minDate: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(initial.date);
  const [hours, setHours] = useState(initial.hours);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await logOvertime({ date, hours: Number(hours), description });
      if (!res.ok) return setError(res.error);
      toast.success("Extra hours sent for approval");
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      title="Log extra hours"
      description="One entry per day. Your admin approves it before it counts towards pay."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending} disabled={!date || !(Number(hours) > 0) || description.trim().length < 3}>
            Send for approval
          </Button>
        </>
      }
    >
      {error && <p role="alert" className="mb-4 rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Date" type="date" value={date} min={minDate} max={today} onChange={(e) => setDate(e.target.value)} />
        <Input
          label="Extra hours"
          type="number"
          inputMode="decimal"
          min={0.25}
          max={16}
          step="0.25"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder="e.g. 1.5"
          hint={Number(hours) > 0 ? `= ${formatHours(hours)}` : "Quarter hours: 0.25 = 15 min"}
        />
      </div>
      <Textarea
        wrapperClassName="mt-4"
        label="What did you work on?"
        rows={3}
        maxLength={1000}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="e.g. Finished the client's launch creatives after hours"
      />
    </Modal>
  );
}
