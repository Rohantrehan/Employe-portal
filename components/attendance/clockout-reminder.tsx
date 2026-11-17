"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlarmClock, X } from "lucide-react";
import { formatTime } from "@/lib/attendance";

const TZ = "Asia/Kolkata";
const SNOOZE_MS = 30 * 60 * 1000;

/** Minutes since midnight and the date, both in IST. */
function nowIST() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return { minutes: Number(get("hour")) * 60 + Number(get("minute")), date: `${get("year")}-${get("month")}-${get("day")}` };
}

/**
 * Banner shown on every employee page when they are still clocked in
 * 15 minutes after the office closes. Re-checks every 30 s; "Later" snoozes it for 30 minutes.
 */
export function ClockOutReminder({ date, clockIn, workEnd }: { date: string; clockIn: string; workEnd: string }) {
  const pathname = usePathname();
  const key = `clockout-reminder-snooze:${date}`;
  const [show, setShow] = useState(false);

  useEffect(() => {
    const [h, m] = workEnd.split(":").map(Number);
    const due = h * 60 + m + 15;
    const tick = () => {
      const n = nowIST();
      let snoozed = 0;
      try {
        snoozed = Number(localStorage.getItem(key) ?? 0);
      } catch {}
      setShow(n.date === date && n.minutes >= due && Date.now() > snoozed);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [date, workEnd, key]);

  if (!show) return null;

  const snooze = () => {
    try {
      localStorage.setItem(key, String(Date.now() + SNOOZE_MS));
    } catch {}
    setShow(false);
  };

  return (
    <div role="alert" className="animate-pop mb-6 flex flex-wrap items-center gap-3 rounded-2xl bg-rail px-4 py-3 text-white shadow-pop sm:px-5">
      <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand animate-pulse-ring">
        <AlarmClock className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1 basis-[200px] text-sm">
        <p className="font-bold">You&apos;re still clocked in</p>
        <p className="text-rail-text">
          Since {formatTime(clockIn)}. The office closed at {workEnd}. Clock out before you leave so today counts.
        </p>
      </div>
      <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
        {pathname !== "/app" && (
          <Link href="/app" className="btn-primary !min-h-9 !px-4 text-[13px]">
            Clock out
          </Link>
        )}
        <button type="button" onClick={snooze} className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-white/70 hover:bg-white/10 hover:text-white">
          <X className="h-3.5 w-3.5" /> Later
        </button>
      </div>
    </div>
  );
}
