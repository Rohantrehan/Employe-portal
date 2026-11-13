"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

function shift(date: string, days: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function DatePicker({ date, today }: { date: string; today: string }) {
  const router = useRouter();
  const go = (d: string) => router.push(d === today ? "/admin/today" : `/admin/today?date=${d}`);
  const btn = "grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-line bg-white text-ink transition-colors hover:bg-app disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex items-center gap-2">
      <button className={btn} onClick={() => go(shift(date, -1))} aria-label="Previous day">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <input
        type="date"
        value={date}
        max={today}
        onChange={(e) => e.target.value && go(e.target.value)}
        aria-label="Pick a date"
        className="h-10 rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink outline-none focus:border-brand focus:ring-4 focus:ring-tint"
      />
      <button className={btn} onClick={() => go(shift(date, 1))} disabled={date >= today} aria-label="Next day">
        <ChevronRight className="h-5 w-5" />
      </button>
      <button
        onClick={() => go(today)}
        className={cn("h-10 cursor-pointer rounded-full px-4 text-sm font-semibold transition-colors", date === today ? "bg-ink text-white" : "border border-line bg-white text-ink hover:bg-app")}
      >
        Today
      </button>
    </div>
  );
}
