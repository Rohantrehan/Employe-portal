"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarHeart, CalendarX2, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/misc";
import { DateChip } from "@/components/holidays/bits";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { HOLIDAY_TYPES, SWAP_STATUS, daysBetween, groupByMonth, isSunday, weekday, type Holiday, type SwapStatus } from "@/lib/holidays";
import { cancelSwap, requestSwap } from "./actions";

export type MySwap = {
  id: string;
  holidayId: string;
  holidayName: string;
  holidayDate: string;
  newDate: string;
  reason: string | null;
  status: SwapStatus;
  reviewNote: string | null;
};

type MyDay = { date: string; name: string; type: Holiday["type"]; moved?: boolean };

export function EmployeeHolidays({ holidays, swaps, today, year }: { holidays: Holiday[]; swaps: MySwap[]; today: string; year: number }) {
  const [moving, setMoving] = useState<Holiday | null>(null);
  const live = (hId: string) => swaps.find((s) => s.holidayId === hId && (s.status === "pending" || s.status === "approved"));

  // My actual days off: holidays I didn't move away, plus the days I moved them to.
  const myDays = useMemo<MyDay[]>(() => {
    const approved = swaps.filter((s) => s.status === "approved");
    const days: MyDay[] = holidays
      .filter((h) => !approved.some((s) => s.holidayId === h.id))
      .map((h) => ({ date: h.date, name: h.name, type: h.type }));
    approved.forEach((s) => days.push({ date: s.newDate, name: s.holidayName, type: "floating", moved: true }));
    return days.sort((a, b) => a.date.localeCompare(b.date));
  }, [holidays, swaps]);

  const next = myDays.find((d) => d.date >= today);
  const remaining = myDays.filter((d) => d.date >= today && !isSunday(d.date)).length;
  const groups = groupByMonth(holidays);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        {next && <NextHoliday day={next} today={today} remaining={remaining} />}

        <Card className="overflow-hidden">
          <CardHeader title={`${year} holidays`} description={`${holidays.length} in total · floating ones can be moved to another working day`} />
          {holidays.length === 0 ? (
            <EmptyState icon={<CalendarX2 />} title="No holidays announced yet" description="Your admin hasn't added holidays for this year." />
          ) : (
            <div className="divide-y divide-line">
              {groups.map((g) => (
                <section key={g.key} className="px-5 py-4 sm:px-6">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-body">{g.label}</h3>
                  <ul className="mt-3 space-y-2">
                    {g.items.map((h) => {
                      const past = h.date < today;
                      const swap = live(h.id);
                      const movedAway = swap?.status === "approved";
                      return (
                        <li key={h.id} className={cn("flex flex-wrap items-center gap-3 rounded-2xl p-2", past && "opacity-60")}>
                          <DateChip date={h.date} muted={past || movedAway} tone={h.type === "festival" ? "brand" : "ink"} />
                          <div className="min-w-0 flex-1">
                            <p className={cn("truncate font-semibold text-ink", movedAway && "text-body line-through")}>{h.name}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <Badge tone={HOLIDAY_TYPES[h.type].tone}>{HOLIDAY_TYPES[h.type].label}</Badge>
                              {isSunday(h.date) && <span className="text-xs text-body">Sunday</span>}
                              {swap && (
                                <span className="text-xs font-semibold text-body">
                                  {swap.status === "approved" ? "Moved to " : "Move to "}
                                  {formatDate(swap.newDate)}
                                  {swap.status === "pending" && " (pending)"}
                                </span>
                              )}
                            </div>
                          </div>
                          {h.type === "floating" && !past && !swap && (
                            <Button size="sm" variant="secondary" onClick={() => setMoving(h)}>
                              <Repeat className="h-3.5 w-3.5" /> Move
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Card>
      </div>

      <MySwaps swaps={swaps} />

      {moving && <MoveModal holiday={moving} today={today} onClose={() => setMoving(null)} />}
    </div>
  );
}

function NextHoliday({ day, today, remaining }: { day: MyDay; today: string; remaining: number }) {
  const inDays = daysBetween(today, day.date);
  return (
    <div className="animate-enter relative overflow-hidden rounded-[28px] bg-rail p-7 text-white sm:p-8">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/30 blur-3xl" aria-hidden />
      <div className="relative flex flex-wrap items-center justify-between gap-6">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-white/60">Next holiday</p>
          <p className="mt-2 text-[30px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[36px]">{day.name}</p>
          <p className="mt-1 text-rail-text">
            {weekday(day.date, "long")}, {formatDate(day.date)}
            {day.moved && " · your moved floating holiday"}
          </p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-2xl bg-white/[0.07] px-5 py-3 text-center">
            <p className="text-[32px] font-extrabold leading-none">{inDays === 0 ? "🎉" : inDays}</p>
            <p className="mt-1 text-xs font-semibold text-white/60">{inDays === 0 ? "Today" : inDays === 1 ? "day to go" : "days to go"}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.07] px-5 py-3 text-center">
            <p className="text-[32px] font-extrabold leading-none">{remaining}</p>
            <p className="mt-1 text-xs font-semibold text-white/60">left this year</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MySwaps({ swaps }: { swaps: MySwap[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const cancel = (id: string) =>
    start(async () => {
      const res = await cancelSwap(id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Request cancelled");
      router.refresh();
    });

  return (
    <Card className="h-fit overflow-hidden">
      <CardHeader title="My swap requests" description="Moving a floating holiday needs admin approval." />
      {swaps.length === 0 ? (
        <EmptyState icon={<CalendarHeart />} title="No requests yet" description="Use “Move” on a floating holiday to pick another day off." className="py-8" />
      ) : (
        <ul className="divide-y divide-line">
          {swaps.map((s) => (
            <li key={s.id} className="px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-ink">{s.holidayName}</p>
                <Badge tone={SWAP_STATUS[s.status].tone} dot={s.status === "pending"}>
                  {SWAP_STATUS[s.status].label}
                </Badge>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-body">
                {formatDate(s.holidayDate)} <ArrowRight className="h-3.5 w-3.5 text-brand" /> <b className="text-ink">{formatDate(s.newDate)}</b>
              </p>
              {s.reason && <p className="mt-1 text-[13px] text-body">Your reason: {s.reason}</p>}
              {s.reviewNote && <p className="mt-1 text-[13px] text-body">Admin: “{s.reviewNote}”</p>}
              {s.status === "pending" && (
                <Button size="sm" variant="ghost" className="-ml-3 mt-1" onClick={() => cancel(s.id)} disabled={pending}>
                  Cancel request
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MoveModal({ holiday, today, onClose }: { holiday: Holiday; today: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const yr = holiday.date.slice(0, 4);
  const min = today > `${yr}-01-01` ? today : `${yr}-01-01`;

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await requestSwap(holiday.id, date, reason);
      if (!res.ok) return setError(res.error);
      toast.success("Request sent to your admin");
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      title={`Move ${holiday.name}`}
      description={`Work on ${formatDate(holiday.date)} and take another day off instead. Your admin needs to approve it.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending} disabled={!date}>
            Send request
          </Button>
        </>
      }
    >
      {error && <p role="alert" className="mb-4 rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">{error}</p>}
      <Input
        label="New day off"
        type="date"
        value={date}
        min={min}
        max={`${yr}-12-31`}
        onChange={(e) => setDate(e.target.value)}
        hint={date ? (isSunday(date) ? "That's a Sunday, which is already off. Pick a working day." : `${weekday(date, "long")}, ${formatDate(date)}`) : `Any working day in ${yr}.`}
      />
      <Textarea wrapperClassName="mt-4" label="Reason (optional)" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family function on that day" />
    </Modal>
  );
}
