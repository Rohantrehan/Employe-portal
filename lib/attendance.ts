import type { BadgeTone } from "@/components/ui/badge";

export type DayKind = "working" | "weekly_off" | "holiday" | "leave" | "half_leave" | "untracked";
export type Schedule = "standard" | "custom" | "none";

/** The hours that apply to the signed-in employee (from my_shift()). */
export type MyShift = { tracked: boolean; start: string; end: string; minutes: number; overnight: boolean; day: string; ends_at: string };

/** "09:00–17:00", "22:00–06:00 (next day)"; short: "22:00–06:00 night" */
export function shiftText(start: string, end: string, short = false) {
  return `${start}–${end}${end < start ? (short ? " night" : " (next day)") : ""}`;
}
export type AttendanceStatus = "present" | "late" | "half_day" | "missed_clock_out";
export type Task = { id: string; title: string; planned: boolean; done: boolean };

export type DayRecord = {
  day_kind: DayKind;
  day_label: string | null;
  attendance_id: string | null;
  clock_in: string | null;
  clock_out: string | null;
  status: AttendanceStatus | null;
  is_late: boolean | null;
  early_leave: boolean | null;
  worked_minutes: number | null;
  summary: string | null;
  admin_note: string | null;
  tasks: Task[];
};

const TZ = "Asia/Kolkata";

/** "09:04" in IST. */
export function formatTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }).format(new Date(iso));
}

/** "HH:mm" in IST, for <input type="time">. */
export function toTimeInput(iso: string | null | undefined) {
  return iso ? formatTime(iso) : "";
}

/** "7h 32m" */
export function formatDuration(minutes: number | null | undefined) {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.max(0, Math.round(minutes % 60));
  return h ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}

export function minutesSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

/** Badge text + tone for one day. */
export function dayBadge(d: Pick<DayRecord, "day_kind" | "day_label" | "status" | "clock_in" | "clock_out">, isToday: boolean): {
  label: string;
  tone: BadgeTone;
} {
  if (d.clock_in) {
    if (!d.clock_out && d.status !== "missed_clock_out") return { label: "Working", tone: "success" };
    switch (d.status) {
      case "late":
        return { label: "Late", tone: "warning" };
      case "half_day":
        return { label: "Half day", tone: "warning" };
      case "missed_clock_out":
        return { label: "Missed clock-out", tone: "brand" };
      default:
        return { label: "Present", tone: "success" };
    }
  }
  switch (d.day_kind) {
    case "weekly_off":
      return { label: "Weekly off", tone: "neutral" };
    case "holiday":
      return { label: d.day_label ?? "Holiday", tone: "info" };
    case "leave":
      return { label: d.day_label ?? "On leave", tone: "info" };
    case "half_leave":
      return { label: d.day_label ?? "Half-day leave", tone: "info" };
    case "untracked":
      return d.day_label ? { label: d.day_label, tone: "info" } : { label: "Not tracked", tone: "neutral" };
    default:
      return isToday ? { label: "Not clocked in", tone: "neutral" } : { label: "Absent", tone: "brand" };
  }
}
