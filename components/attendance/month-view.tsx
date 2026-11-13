"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { dayBadge, formatDuration, formatTime, type DayRecord } from "@/lib/attendance";
import { TaskChecklist } from "./task-checklist";

export type MonthDay = DayRecord & { day: string };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const cellTone: Record<string, string> = {
  success: "bg-success-tint text-success",
  warning: "bg-warning-tint text-warning",
  brand: "bg-tint text-brand",
  info: "bg-info-tint text-info",
  neutral: "bg-grey-tile text-body",
  dark: "bg-ink text-white",
};

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Month calendar with a details panel for the selected day. */
export function MonthView({ days, month, today, hrefFor }: { days: MonthDay[]; month: string; today: string; hrefFor: (month: string) => string }) {
  const initial = days.find((d) => d.day === today)?.day ?? [...days].reverse().find((d) => d.clock_in)?.day ?? days[0]?.day;
  const [selected, setSelected] = useState(initial);
  const sel = days.find((d) => d.day === selected);
  const lead = days.length ? (new Date(days[0].day + "T00:00:00Z").getUTCDay() + 6) % 7 : 0; // Monday-first
  const label = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(month + "-01T00:00:00Z"));
  const isFutureMonth = month > today.slice(0, 7);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <Link href={hrefFor(shiftMonth(month, -1))} className="grid h-10 w-10 place-items-center rounded-full border border-line text-ink transition-colors hover:bg-app" aria-label="Previous month">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <p className="text-lg font-extrabold tracking-[-0.02em] text-ink">{label}</p>
          <Link
            href={hrefFor(shiftMonth(month, 1))}
            aria-disabled={isFutureMonth}
            className={cn("grid h-10 w-10 place-items-center rounded-full border border-line text-ink transition-colors hover:bg-app", isFutureMonth && "pointer-events-none opacity-40")}
            aria-label="Next month"
          >
            <ChevronRight className="h-5 w-5" />
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-7 gap-1.5 text-center sm:gap-2">
          {WEEKDAYS.map((w) => (
            <div key={w} className="pb-1 text-[11px] font-bold uppercase tracking-wider text-body">
              {w}
            </div>
          ))}
          {Array.from({ length: lead }).map((_, i) => (
            <div key={`lead-${i}`} />
          ))}
          {days.map((d) => {
            const future = d.day > today;
            const b = dayBadge(d, d.day === today);
            const tone = future ? (d.day_kind === "working" ? "" : cellTone[b.tone]) : d.day_kind === "working" && !d.clock_in && d.day === today ? "bg-grey-tile text-body" : cellTone[b.tone];
            return (
              <button
                key={d.day}
                type="button"
                onClick={() => setSelected(d.day)}
                title={b.label}
                className={cn(
                  "relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl text-sm font-bold transition sm:rounded-2xl",
                  tone || "bg-white text-ink ring-1 ring-line",
                  future && d.day_kind === "working" && "text-body",
                  selected === d.day && "ring-2 ring-ink ring-offset-2",
                )}
              >
                {Number(d.day.slice(8))}
                {d.clock_in && <span className="hidden text-[10px] font-semibold opacity-80 sm:block">{formatDuration(d.worked_minutes ?? null)}</span>}
                {d.day === today && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-brand sm:bottom-1.5" />}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-body">
          {[
            ["bg-success-tint", "Present"],
            ["bg-warning-tint", "Late / half day"],
            ["bg-tint", "Absent / missed"],
            ["bg-info-tint", "Leave / holiday"],
            ["bg-grey-tile", "Weekly off"],
          ].map(([c, l]) => (
            <span key={l} className="inline-flex items-center gap-1.5">
              <span className={cn("h-3 w-3 rounded", c)} /> {l}
            </span>
          ))}
        </div>
      </Card>

      <Card className="h-fit p-6">
        {sel ? <DayDetails d={sel} isToday={sel.day === today} future={sel.day > today} /> : <p className="text-sm text-body">Pick a day.</p>}
      </Card>
    </div>
  );
}

function DayDetails({ d, isToday, future }: { d: MonthDay; isToday: boolean; future: boolean }) {
  const b = dayBadge(d, isToday);
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-body">{isToday ? "Today" : new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(d.day + "T00:00:00Z"))}</p>
      <p className="mt-1 text-xl font-extrabold tracking-[-0.02em] text-ink">{formatDate(d.day)}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {!(future && d.day_kind === "working") && <Badge tone={b.tone}>{b.label}</Badge>}
        {d.clock_in && d.is_late && d.status !== "late" && <Badge tone="warning">Late</Badge>}
        {d.early_leave && <Badge tone="warning">Left early</Badge>}
        {d.clock_in && d.day_kind === "half_leave" && <Badge tone="info">{d.day_label}</Badge>}
      </div>

      {d.clock_in ? (
        <>
          <dl className="mt-5 grid grid-cols-3 gap-3 rounded-2xl bg-soft p-4 text-center">
            {[
              ["In", formatTime(d.clock_in)],
              ["Out", d.clock_out ? formatTime(d.clock_out) : "—"],
              ["Worked", formatDuration(d.worked_minutes)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] font-bold uppercase tracking-wider text-body">{k}</dt>
                <dd className="mt-0.5 text-base font-extrabold text-ink tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-[11px] font-bold uppercase tracking-wider text-body">Tasks</p>
          <TaskChecklist tasks={d.tasks} showStatus={!!d.clock_out} className="mt-2" />
          {d.summary && (
            <>
              <p className="mt-5 text-[11px] font-bold uppercase tracking-wider text-body">Summary</p>
              <p className="mt-2 whitespace-pre-line text-sm text-ink">{d.summary}</p>
            </>
          )}
          {d.admin_note && (
            <p className="mt-4 rounded-2xl bg-soft px-4 py-3 text-sm text-body">
              <b className="text-ink">Admin note:</b> {d.admin_note}
            </p>
          )}
        </>
      ) : (
        <p className="mt-5 text-sm text-body">
          {future
            ? "Upcoming day."
            : d.day_kind === "working"
              ? isToday
                ? "Not clocked in yet."
                : "No attendance recorded for this working day."
              : "No work expected on this day."}
        </p>
      )}
    </div>
  );
}
