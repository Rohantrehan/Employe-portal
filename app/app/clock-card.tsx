"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, CalendarHeart, CheckCircle2, Circle, Coffee, LogOut, Plane } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/field";
import { TaskListEditor } from "@/components/attendance/task-list-editor";
import { TaskChecklist } from "@/components/attendance/task-checklist";
import { cn } from "@/lib/cn";
import { dayBadge, formatDuration, formatTime, minutesSince, type DayRecord } from "@/lib/attendance";
import { clockInAction, clockOutAction } from "./attendance-actions";

export function ClockCard({ today, workStart, workEnd }: { today: DayRecord; workStart: string; workEnd: string }) {
  const off = !today.clock_in && (today.day_kind === "weekly_off" || today.day_kind === "holiday" || today.day_kind === "leave");
  if (off) return <OffDayCard today={today} />;
  if (!today.clock_in) return <ClockInCard today={today} workStart={workStart} workEnd={workEnd} />;
  if (!today.clock_out && today.status !== "missed_clock_out") return <WorkingCard today={today} workStart={workStart} workEnd={workEnd} />;
  return <DoneCard today={today} />;
}

/* ------------------------------------------------------------------ */

function OffDayCard({ today }: { today: DayRecord }) {
  const Icon = today.day_kind === "leave" ? Plane : today.day_kind === "holiday" ? CalendarHeart : Coffee;
  const title = today.day_kind === "leave" ? "You're on leave today" : today.day_kind === "holiday" ? `Holiday: ${today.day_label}` : "Office closed today";
  const text =
    today.day_kind === "leave" ? `Approved ${today.day_label ?? "leave"}. Enjoy your day off.` : today.day_kind === "holiday" ? "No clock-in needed today." : "It's the weekly off. See you on Monday.";
  return (
    <div className="card animate-enter flex items-center gap-4 p-6">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-info-tint text-info">
        <Icon className="h-6 w-6" />
      </span>
      <div>
        <p className="text-lg font-extrabold tracking-[-0.02em] text-ink">{title}</p>
        <p className="text-sm text-body">{text}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ClockInCard({ today, workStart, workEnd }: { today: DayRecord; workStart: string; workEnd: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const filled = tasks.filter((t) => t.trim()).length;

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await clockInAction(tasks);
      if (!res.ok) return setError(res.error);
      setOpen(false);
      toast.success("Clocked in. Have a productive day!");
      router.refresh();
    });

  return (
    <>
      <div className="animate-enter relative overflow-hidden rounded-[28px] bg-rail p-7 text-white sm:p-9">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-brand/15 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-white/60">Not clocked in yet</p>
            <p className="mt-2 text-[30px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[36px]">Ready for today?</p>
            <p className="mt-1.5 max-w-md text-rail-text">
              Write what you plan to finish, then clock in. Office hours are {workStart}–{workEnd}.
              {today.day_kind === "half_leave" && <span className="text-white"> You have {today.day_label} today.</span>}
            </p>
          </div>
          <Button size="lg" onClick={() => setOpen(true)}>
            Clock in <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Clock in"
        description="What do you plan to get done today?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending} disabled={!filled}>
              Clock in{filled ? ` with ${filled} task${filled > 1 ? "s" : ""}` : ""}
            </Button>
          </>
        }
      >
        {error && <ErrorNote>{error}</ErrorNote>}
        <TaskListEditor label="Task" value={tasks} onChange={setTasks} />
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */

function WorkingCard({ today, workStart, workEnd }: { today: DayRecord; workStart: string; workEnd: string }) {
  const router = useRouter();
  const [mins, setMins] = useState(() => minutesSince(today.clock_in!));
  const [open, setOpen] = useState(false);
  const planned = today.tasks.filter((t) => t.planned);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState<string[]>([""]);
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const fullShift = toMin(workEnd) - toMin(workStart);
  // On a half-day leave only half the shift is owed.
  const shift = today.day_kind === "half_leave" ? Math.floor(fullShift / 2) : fullShift;
  const clearAt = formatTime(new Date(new Date(today.clock_in!).getTime() + shift * 60_000).toISOString());

  useEffect(() => {
    const t = setInterval(() => setMins(minutesSince(today.clock_in!)), 30_000);
    return () => clearInterval(t);
  }, [today.clock_in]);

  const toggle = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await clockOutAction({ done: [...done], extra, summary });
      if (!res.ok) return setError(res.error);
      setOpen(false);
      toast.success("Clocked out. Great work today!");
      router.refresh();
    });

  return (
    <>
      <div className="card animate-enter overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line p-6">
          <div className="flex items-center gap-4">
            <span className="relative grid h-12 w-12 place-items-center rounded-full bg-success-tint">
              <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-success-dot opacity-60" />
              <span className="relative h-3 w-3 rounded-full bg-success-dot" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-extrabold tracking-[-0.02em] text-ink">Working</p>
                {today.is_late && <Badge tone="warning">Late</Badge>}
              </div>
              <p className="text-sm text-body">
                Clocked in at <b className="text-ink">{formatTime(today.clock_in)}</b> · {formatDuration(mins)} so far · office closes at {workEnd}
              </p>
              {today.is_late && (
                <p className="mt-1 text-sm text-body">
                  Work a full {formatDuration(shift)} (until <b className="text-ink">{clearAt}</b>) and the late mark goes away.
                </p>
              )}
            </div>
          </div>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            <LogOut className="h-4 w-4" /> Clock out
          </Button>
        </div>
        <div className="p-6">
          <p className="text-[11px] font-bold uppercase tracking-wider text-body">Today&apos;s plan</p>
          <TaskChecklist tasks={planned} showStatus={false} className="mt-3" />
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        size="lg"
        title="Clock out"
        description={`You've worked ${formatDuration(mins)} today. Tick what you finished.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending} disabled={summary.trim().length < 3}>
              <LogOut className="h-4 w-4" /> Clock out
            </Button>
          </>
        }
      >
        {error && <ErrorNote>{error}</ErrorNote>}
        <p className="text-sm font-semibold text-ink">Planned tasks</p>
        <ul className="mt-2 space-y-2">
          {planned.map((t) => {
            const isDone = done.has(t.id);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => toggle(t.id)}
                  aria-pressed={isDone}
                  className={cn(
                    "flex w-full cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] transition-colors",
                    isDone ? "border-success/30 bg-success-tint text-ink" : "border-line bg-white text-ink hover:bg-soft",
                  )}
                >
                  {isDone ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-body/50" />}
                  {t.title}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="mt-6 text-sm font-semibold text-ink">Anything else you did? <span className="font-normal text-body">(optional)</span></p>
        <div className="mt-2">
          <TaskListEditor label="Extra task" value={extra} onChange={setExtra} placeholder="e.g. Helped with client call" />
        </div>

        <Textarea
          wrapperClassName="mt-6"
          label="Summary of the day"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="What got done, what's pending and why, anything the team should know."
          hint="Required. Your admin sees this on the team board."
        />
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */

function DoneCard({ today }: { today: DayRecord }) {
  const badge = dayBadge(today, true);
  const planned = today.tasks.filter((t) => t.planned);
  const doneCount = planned.filter((t) => t.done).length;
  return (
    <div className="card animate-enter overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 border-b border-line p-6">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-success-tint text-success">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-extrabold tracking-[-0.02em] text-ink">
              {today.status === "missed_clock_out" ? "You didn't clock out" : "Day complete"}
            </p>
            <Badge tone={badge.tone}>{badge.label}</Badge>
            {today.is_late && today.status !== "late" && <Badge tone="warning">Late</Badge>}
            {today.early_leave && <Badge tone="warning">Left early</Badge>}
          </div>
          <p className="text-sm text-body">
            {formatTime(today.clock_in)} – {formatTime(today.clock_out)} · <b className="text-ink">{formatDuration(today.worked_minutes)}</b> worked
            {planned.length > 0 && ` · ${doneCount}/${planned.length} planned tasks done`}
          </p>
        </div>
      </div>
      <div className="grid gap-6 p-6 md:grid-cols-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-body">Tasks</p>
          <TaskChecklist tasks={today.tasks} className="mt-3" />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-body">Summary</p>
          <p className="mt-3 whitespace-pre-line text-sm text-ink">{today.summary ?? "—"}</p>
          {today.admin_note && (
            <p className="mt-4 rounded-2xl bg-soft px-4 py-3 text-sm text-body">
              <b className="text-ink">Admin note:</b> {today.admin_note}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="animate-pop mb-4 flex items-start gap-2.5 rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      {children}
    </div>
  );
}
