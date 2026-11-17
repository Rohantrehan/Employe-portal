import { Table as TableIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { BRAND, formatValue, type Unit } from "./chart-utils";

/** Card wrapper for a chart: title, optional headline figure, the chart, and a "Show data" table for accessibility. */
export function ChartCard({
  title,
  description,
  headline,
  action,
  table,
  className,
  children,
}: {
  title: string;
  description?: string;
  headline?: React.ReactNode;
  action?: React.ReactNode;
  table?: { columns: string[]; rows: (string | number)[][] };
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("card flex flex-col p-5 sm:p-6", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold tracking-[-0.01em] text-ink">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-body">{description}</p>}
        </div>
        {action}
      </header>
      {headline && <div className="mt-3">{headline}</div>}
      <div className="mt-4 flex-1">{children}</div>
      {table && table.rows.length > 0 && (
        <details className="group mt-4 border-t border-line pt-3">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[12px] font-semibold text-body hover:text-ink [&::-webkit-details-marker]:hidden">
            <TableIcon className="h-3.5 w-3.5" aria-hidden />
            <span className="group-open:hidden">Show data</span>
            <span className="hidden group-open:inline">Hide data</span>
          </summary>
          <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-line">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-soft">
                <tr>
                  {table.columns.map((c, i) => (
                    <th key={c} className={cn("px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-body", i > 0 && "text-right")}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, ri) => (
                  <tr key={ri} className="border-t border-line">
                    {r.map((v, i) => (
                      <td key={i} className={cn("px-3 py-1.5", i > 0 ? "text-right tabular-nums" : "font-medium text-ink")}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

/** Big headline number above a chart. */
export function Headline({ value, sub }: { value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-[28px] font-extrabold leading-none tracking-[-0.03em] text-ink tabular-nums">{value}</span>
      {sub && <span className="text-[13px] text-body">{sub}</span>}
    </p>
  );
}

/** Ranked horizontal bars (HTML). Good for named categories: leave types, people. */
export function BarList({
  items,
  unit,
  color = BRAND,
  target,
  empty = "Nothing to show yet.",
}: {
  items: { label: string; value: number; note?: string }[];
  unit: Unit;
  color?: string;
  target?: { value: number; label: string };
  empty?: string;
}) {
  if (!items.length) return <p className="py-10 text-center text-sm text-body">{empty}</p>;
  const max = Math.max(target?.value ?? 0, ...items.map((i) => i.value)) || 1;
  return (
    <ul className="space-y-3">
      {items.map((it) => (
        <li key={it.label}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate font-semibold text-ink">{it.label}</span>
            <span className="shrink-0 tabular-nums text-body">
              <span className="font-bold text-ink">{formatValue(it.value, unit)}</span>
              {it.note && <span> · {it.note}</span>}
            </span>
          </div>
          <div className="relative mt-1.5 h-2 rounded-full bg-grey-tile">
            <div
              className="h-2 rounded-full transition-[width] duration-700 ease-[var(--ease-deck)]"
              style={{ width: `${Math.max(it.value > 0 ? 1.5 : 0, (it.value / max) * 100)}%`, background: color }}
            />
            {target && (
              <span
                className="absolute -top-1 h-4 w-[2px] rounded-full bg-ink"
                style={{ left: `calc(${(target.value / max) * 100}% - 1px)` }}
                title={target.label}
                aria-hidden
              />
            )}
          </div>
        </li>
      ))}
      {target && (
        <li className="flex items-center gap-1.5 pt-1 text-[11px] text-body">
          <span className="h-3 w-[2px] rounded-full bg-ink" aria-hidden /> {target.label}
        </li>
      )}
    </ul>
  );
}
