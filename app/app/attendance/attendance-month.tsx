"use client";

import { ClockoutFix, type FixRequest } from "@/components/attendance/clockout-fix";
import { MonthView, type MonthDay } from "@/components/attendance/month-view";

// Client wrapper so functions (href builder, extra renderer) don't cross the server/client boundary.
export function AttendanceMonth({
  days,
  month,
  today,
  requests,
  workEnd,
}: {
  days: MonthDay[];
  month: string;
  today: string;
  requests: FixRequest[];
  workEnd: string;
}) {
  return (
    <MonthView
      key={month}
      days={days}
      month={month}
      today={today}
      hrefFor={(m) => `/app/attendance?month=${m}`}
      renderExtra={(d) =>
        d.attendance_id && d.clock_in && !d.clock_out && d.status === "missed_clock_out" ? (
          <ClockoutFix
            day={{ attendance_id: d.attendance_id, day: d.day, clock_in: d.clock_in, tasks: d.tasks }}
            request={requests.find((r) => r.attendance_id === d.attendance_id)}
            workEnd={workEnd}
          />
        ) : null
      }
    />
  );
}
