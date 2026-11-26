"use client";

import { useState } from "react";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { durationText } from "@/lib/letters";

export type ContractLeaveType = { id: string; name: string; contract_quota: number };

function endAfter(start: string, months: number) {
  const d = new Date(start + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const TERMS = [
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "1 year" },
];

/** For people who already work here: their current (paper) contract and the leave they have left. */
export function ExistingContractFields({ types, errors = {} }: { types: ContractLeaveType[]; errors?: Record<string, string> }) {
  const [existing, setExisting] = useState(false);
  const [from, setFrom] = useState("");
  const [months, setMonths] = useState<number | "custom">(6);
  const [customTo, setCustomTo] = useState("");
  const to = months === "custom" ? customTo : from ? endAfter(from, months) : "";

  return (
    <div className="space-y-4">
      <input type="hidden" name="existing" value={existing ? "yes" : "no"} />
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="New or existing employee">
        {(
          [
            [false, "New joiner", "Issue their contract letter from their page after creating them."],
            [true, "Already works here", "Enter their current contract and the paid leave they have left."],
          ] as const
        ).map(([value, label, hint]) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={existing === value}
            onClick={() => setExisting(value)}
            className={cn("cursor-pointer rounded-2xl border px-4 py-3 text-left transition", existing === value ? "border-ink bg-soft" : "border-line hover:bg-soft")}
          >
            <span className="block text-sm font-semibold text-ink">{label}</span>
            <span className="block text-[13px] leading-snug text-body">{hint}</span>
          </button>
        ))}
      </div>

      {existing && (
        <div className="animate-enter space-y-4 rounded-2xl border border-line p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Current contract started on"
              type="date"
              name="contract_from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              error={errors.contract_from}
            />
            <div>
              <span className="text-sm font-semibold text-ink">Contract length</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {TERMS.map((t) => (
                  <button
                    key={t.months}
                    type="button"
                    onClick={() => setMonths(t.months)}
                    aria-pressed={months === t.months}
                    className={cn(
                      "cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-semibold",
                      months === t.months ? "border-ink bg-ink text-white" : "border-line text-ink hover:bg-soft",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setMonths("custom")}
                  aria-pressed={months === "custom"}
                  className={cn(
                    "cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-semibold",
                    months === "custom" ? "border-ink bg-ink text-white" : "border-line text-ink hover:bg-soft",
                  )}
                >
                  Other end date
                </button>
              </div>
            </div>
          </div>
          {months === "custom" ? (
            <Input label="Contract ends on" type="date" value={customTo} min={from || undefined} onChange={(e) => setCustomTo(e.target.value)} error={errors.contract_to} />
          ) : (
            errors.contract_to && <p className="text-sm font-medium text-brand">{errors.contract_to}</p>
          )}
          <input type="hidden" name="contract_to" value={to} />
          {from && to && to >= from && (
            <p className="text-[13px] text-body">
              Contract: <b className="text-ink">{new Date(from + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</b> to{" "}
              <b className="text-ink">{new Date(to + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</b> ({durationText(from, to)}). The portal reminds you before it ends.
            </p>
          )}

          {types.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-ink">Unused leave they have right now</p>
              <p className="text-[13px] text-body">
                Everything they can still take on this contract, including leave left over from earlier contracts. Example: 12 a contract, 4 used = 8.
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {types.map((t) => (
                  <Input
                    key={t.id}
                    label={`${t.name} left`}
                    name={`left_${t.id}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={365}
                    step="0.5"
                    defaultValue={t.contract_quota}
                    error={errors[`left_${t.id}`]}
                    hint={`A contract comes with ${t.contract_quota}. Unused days carry over when it's renewed.`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
