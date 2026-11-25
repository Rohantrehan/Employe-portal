"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { saveSettings, type SettingsState } from "./actions";

export type Settings = { company_name: string; work_start: string; work_end: string; grace_minutes: number; half_day_min_hours: number };

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
const fmt = (mins: number) => `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

export function SettingsForm({ initial }: { initial: Settings }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, undefined);
  const [v, setV] = useState(initial);
  const last = useRef<SettingsState>(undefined);
  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.ok) toast.success("Settings saved. New rules apply to clock-ins from now on.");
    else if (state.error) toast.error(state.error);
  }, [state]);

  const dayMins = toMin(v.work_end) - toMin(v.work_start);
  const lateAfter = fmt(toMin(v.work_start) + (Number(v.grace_minutes) || 0));
  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  return (
    <form action={action} className="mt-8 grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader title="Company" />
          <CardBody>
            <Input label="Company name" name="company_name" value={v.company_name} onChange={set("company_name")} required maxLength={120} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Office hours" description="Monday to Saturday. Sunday is the weekly off." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Input label="Opens at" name="work_start" type="time" value={v.work_start} onChange={set("work_start")} required />
            <Input label="Closes at" name="work_end" type="time" value={v.work_end} onChange={set("work_end")} required hint="Leaving before this is marked “early leave”. Anyone with custom hours on their profile uses those instead." />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Attendance rules" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Grace period (minutes)"
              name="grace_minutes"
              type="number"
              min={0}
              max={180}
              step={1}
              value={v.grace_minutes}
              onChange={set("grace_minutes")}
              required
              hint={`Clock-in after ${lateAfter} is marked late, unless they still work the full ${Math.floor(dayMins / 60)}h${dayMins % 60 ? ` ${dayMins % 60}m` : ""}.`}
            />
            <Input
              label="Half-day below (hours)"
              name="half_day_min_hours"
              type="number"
              min={0.5}
              max={12}
              step={0.25}
              value={v.half_day_min_hours}
              onChange={set("half_day_min_hours")}
              required
              hint="Days worked shorter than this count as a half day."
            />
          </CardBody>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="card p-6">
          <p className="text-[11px] font-bold uppercase tracking-wider text-body">Summary</p>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex justify-between gap-3">
              <span className="text-body">Working day</span>
              <span className="font-bold text-ink">
                {v.work_start}–{v.work_end} {dayMins > 0 && `(${Math.floor(dayMins / 60)}h${dayMins % 60 ? ` ${dayMins % 60}m` : ""})`}
              </span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-body">Late after</span>
              <span className="font-bold text-ink">{lateAfter}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-body">Half day under</span>
              <span className="font-bold text-ink">{v.half_day_min_hours}h</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-body">Weekly off</span>
              <span className="font-bold text-ink">Sunday</span>
            </li>
          </ul>
          {dayMins <= 0 && <p className="mt-4 text-[13px] font-semibold text-brand">Closing time must be after opening time.</p>}
          <Button type="submit" block className="mt-6" loading={pending} disabled={dayMins <= 0}>
            Save settings
          </Button>
          <p className="mt-3 text-[12px] text-body">Changes apply to new clock-ins and clock-outs. Past days keep their status unless edited.</p>
        </div>
      </aside>
    </form>
  );
}
