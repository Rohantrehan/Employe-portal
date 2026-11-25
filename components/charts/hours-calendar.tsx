import { cn } from "@/lib/cn";
import { formatDuration, type DayKind } from "@/lib/attendance";
import { BLUE_RAMP } from "./chart-utils";

export type CalendarDay = {
  day: string;
  day_kind: DayKind;
  day_label: string | null;
  clock_in: string | null;
  clock_out: string | null;
  worked_minutes: number | null;
  is_late: boolean | null;
};

const BINS = [
  { min: 0, label: "Under 4h" },
  { min: 240, label: "4–6h" },
  { min: 360, label: "6–8h" },
  { min: 480, label: "8h+" },
];
const binOf = (m: number) => BINS.reduce((acc, b, i) => (m >= b.min ? i : acc), 0);
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HATCH = "repeating-linear-gradient(45deg, #eef0f3 0 4px, #ffffff 4px 8px)";

/** Month heat-map: each working day shaded by hours worked (one hue, light → dark). Off days, holidays and leave are labelled. */
export function HoursCalendar({ days, today }: { days: CalendarDay[]; today: string }) {
  if (!days.length) return null;
  const first = new Date(days[0].day + "T00:00:00Z").getUTCDay(); // 0 = Sun
  const lead = (first + 6) % 7; // Monday-first grid

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-body">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} aria-hidden />
        ))}
        {days.map((d) => {
          const n = Number(d.day.slice(8));
          const future = d.day > today;
          const isToday = d.day === today;
          const open = !!d.clock_in && !d.clock_out;
          const mins = d.worked_minutes ?? 0;
          const worked = !!d.clock_in && !open;
          const bin = worked ? binOf(mins) : -1;
          const off = d.day_kind === "weekly_off" || d.day_kind === "holiday";
          const leave = d.day_kind === "leave";
          const absent = !future && !isToday && !d.clock_in && (d.day_kind === "working" || d.day_kind === "half_leave");

          let tag = "";
          if (d.day_kind === "holiday") tag = "Hol";
          else if (d.day_kind === "weekly_off") tag = "Off";
          else if (leave) tag = "Leave";
          else if (d.day_kind === "untracked" && !d.clock_in) tag = "—";
          else if (open) tag = "Now";
          else if (absent) tag = "Absent";

          const detail = worked
            ? `${formatDuration(mins)} worked${d.is_late ? " · late" : ""}`
            : open
              ? "Clocked in, day in progress"
              : d.day_label ?? (absent ? "No attendance" : d.day_kind === "untracked" ? "Attendance not tracked" : future ? "Upcoming" : "Working day");

          return (
            <div
              key={d.day}
              tabIndex={0}
              aria-label={`${d.day}: ${detail}`}
              className={cn(
                "group relative flex h-11 flex-col sm:h-12 items-center justify-center rounded-xl text-[12px] font-bold outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-brand",
                worked ? (bin >= 2 ? "text-white" : "text-ink") : "text-body",
                !worked && !off && !leave && "border border-line bg-white",
                future && "opacity-50",
                isToday && "ring-2 ring-ink ring-offset-1",
                absent && "border-dashed",
              )}
              style={{
                background: worked ? BLUE_RAMP[bin] : off ? "#f3f4f6" : leave ? HATCH : undefined,
              }}
            >
              <span>{n}</span>
              {tag && <span className="text-[8.5px] font-semibold uppercase leading-none tracking-wide opacity-80">{tag}</span>}
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-max max-w-[200px] -translate-x-1/2 rounded-lg border border-line bg-white px-2.5 py-1.5 text-left text-[11.5px] font-medium text-ink shadow-pop group-hover:block group-focus-visible:block">
                <span className="block font-bold">{new Date(d.day + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</span>
                <span className="text-body">{detail}</span>
              </span>
            </div>
          );
        })}
      </div>

      <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px] text-body" aria-label="Legend">
        {BINS.map((b, i) => (
          <li key={b.label} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded" style={{ background: BLUE_RAMP[i] }} aria-hidden /> {b.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-line" style={{ background: HATCH }} aria-hidden /> Leave
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-grey-tile" aria-hidden /> Off / holiday
        </li>
      </ul>
    </div>
  );
}
