"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlarmClock, X } from "lucide-react";
import { formatTime } from "@/lib/attendance";

const SNOOZE_MS = 30 * 60 * 1000;

/**
 * Banner shown on every employee page when they are still clocked in
 * 15 minutes after their shift ends (the next morning for a night shift). Re-checks every 30 s; "Later" snoozes it for 30 minutes.
 */
export function ClockOutReminder({ date, clockIn, workEnd, endsAt }: { date: string; clockIn: string; workEnd: string; endsAt: string }) {
  const pathname = usePathname();
  const key = `clockout-reminder-snooze:${date}`;
  const [show, setShow] = useState(false);

  useEffect(() => {
    const due = new Date(endsAt).getTime() + 15 * 60_000;
    const tick = () => {
      let snoozed = 0;
      try {
        snoozed = Number(localStorage.getItem(key) ?? 0);
      } catch {}
      setShow(Date.now() >= due && Date.now() > snoozed);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [endsAt, key]);

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
          Since {formatTime(clockIn)}. Your shift ended at {workEnd}. Clock out before you leave so today counts.
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
