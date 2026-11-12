"use client";

import { cn } from "@/lib/cn";

export type TabItem = { value: string; label: React.ReactNode; count?: number };

/** Pill tabs (controlled). */
export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-white p-1", className)}>
      {items.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              active ? "bg-ink text-white" : "text-body hover:bg-app hover:text-ink",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn("rounded-full px-1.5 text-[11px] font-bold", active ? "bg-brand text-white" : "bg-grey-tile text-body")}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
