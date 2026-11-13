"use client";

import { MonthView, type MonthDay } from "@/components/attendance/month-view";

// Client wrapper so the href builder (a function) doesn't cross the server/client boundary.
export function AttendanceMonth({ days, month, today }: { days: MonthDay[]; month: string; today: string }) {
  return <MonthView key={month} days={days} month={month} today={today} hrefFor={(m) => `/app/attendance?month=${m}`} />;
}
