import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { weekday } from "@/lib/holidays";

/** Calendar-style date chip: weekday on top, day number below. */
export function DateChip({ date, muted, tone = "ink" }: { date: string; muted?: boolean; tone?: "ink" | "brand" }) {
  return (
    <span
      className={cn(
        "grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-center leading-none",
        muted ? "bg-grey-tile text-body" : tone === "brand" ? "bg-brand text-white" : "bg-ink text-white",
      )}
    >
      <span>
        <span className="block text-[10px] font-bold uppercase tracking-wider opacity-70">{weekday(date)}</span>
        <span className="mt-0.5 block text-lg font-extrabold">{Number(date.slice(8))}</span>
      </span>
    </span>
  );
}

export function YearSwitch({ year, hrefFor, min = 2024, max }: { year: number; hrefFor: (y: number) => string; min?: number; max: number }) {
  const btn = "grid h-10 w-10 place-items-center rounded-full border border-line bg-white text-ink transition-colors hover:bg-app";
  return (
    <div className="flex items-center gap-2">
      <Link href={hrefFor(year - 1)} aria-label="Previous year" className={cn(btn, year <= min && "pointer-events-none opacity-40")}>
        <ChevronLeft className="h-5 w-5" />
      </Link>
      <span className="min-w-16 text-center text-lg font-extrabold tabular-nums text-ink">{year}</span>
      <Link href={hrefFor(year + 1)} aria-label="Next year" className={cn(btn, year >= max && "pointer-events-none opacity-40")}>
        <ChevronRight className="h-5 w-5" />
      </Link>
    </div>
  );
}
