"use client";

/** Floating tooltip positioned inside a relative chart container. Flips left near the right edge. */
export function ChartTooltip({
  x,
  y,
  width,
  title,
  rows,
}: {
  x: number;
  y: number;
  width: number;
  title: string;
  rows: { label: string; value: string; color?: string }[];
}) {
  const flip = x > width - 180;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-[140px] rounded-xl border border-line bg-white px-3 py-2 text-[12px] shadow-pop animate-pop"
      style={{ left: flip ? undefined : x + 12, right: flip ? width - x + 12 : undefined, top: Math.max(0, y - 8) }}
    >
      <p className="font-bold text-ink">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-4 text-body">
            <span className="flex items-center gap-1.5">
              {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} aria-hidden />}
              {r.label}
            </span>
            <span className="font-semibold tabular-nums text-ink">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
