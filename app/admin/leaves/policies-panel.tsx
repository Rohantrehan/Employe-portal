"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import type { LeaveType } from "@/lib/leave";
import { saveLeaveType, setContractQuota, setQuota } from "./actions";

const COLORS = ["#0069a4", "#15803d", "#b45309", "#6b7280", "#d4000f", "#7c3aed", "#db2777", "#0d9488"];

export function PoliciesPanel({ types, policies, year }: { types: LeaveType[]; policies: { leave_type_id: string; default_quota: number }[]; year: number }) {
  const [quotaFor, setQuotaFor] = useState<LeaveType | null>(null);
  const [typeFor, setTypeFor] = useState<LeaveType | "new" | null>(null);
  const quotaOf = (id: string) => policies.find((p) => p.leave_type_id === id)?.default_quota;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={`Leave types & quotas · ${year}`}
        description="Each type with a limit is either per year (unused days don't carry forward) or per contract (every contract gets the days, unused ones carry over on renewal)."
        action={
          <Button size="sm" onClick={() => setTypeFor("new")}>
            <Plus className="h-4 w-4" /> Add leave type
          </Button>
        }
      />
      <ul className="divide-y divide-line">
        {types.map((t) => {
          const q = quotaOf(t.id);
          return (
            <li key={t.id} className={cn("flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6", !t.is_active && "opacity-60")}>
              <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: t.color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-ink">{t.name}</p>
                  <span className="font-mono text-xs text-body">{t.code}</span>
                  {!t.is_active && <Badge>Hidden</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge tone={t.is_paid ? "success" : "neutral"}>{t.is_paid ? "Paid" : "Unpaid"}</Badge>
                  {!t.tracks_balance && <Badge tone="info">No limit</Badge>}
                  {t.requires_attachment && <Badge tone="warning">Document required</Badge>}
                  {t.tracks_balance && t.contract_quota != null && <Badge tone="dark">Follows the contract</Badge>}
                </div>
              </div>
              {t.tracks_balance && (
                <button
                  type="button"
                  onClick={() => setQuotaFor(t)}
                  disabled={!t.is_active}
                  className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-line px-4 py-2 text-left transition-colors hover:border-brand hover:bg-tint-2 disabled:cursor-not-allowed"
                >
                  <span>
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-body">{t.contract_quota != null ? "Days / contract" : "Days / year"}</span>
                    <span className="block text-xl font-extrabold tabular-nums text-ink">{t.contract_quota != null ? Number(t.contract_quota) : (q ?? "—")}</span>
                  </span>
                  <Pencil className="h-4 w-4 text-body group-hover:text-brand" />
                </button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setTypeFor(t)}>
                Edit
              </Button>
            </li>
          );
        })}
      </ul>

      {quotaFor && <QuotaModal type={quotaFor} current={quotaOf(quotaFor.id) ?? 0} year={year} onClose={() => setQuotaFor(null)} />}
      {typeFor && <TypeModal type={typeFor === "new" ? null : typeFor} year={year} onClose={() => setTypeFor(null)} />}
    </Card>
  );
}

function QuotaModal({ type, current, year, onClose }: { type: LeaveType; current: number; year: number; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"year" | "contract">(type.contract_quota != null ? "contract" : "year");
  const [value, setValue] = useState(String(type.contract_quota != null ? Number(type.contract_quota) : current));
  const [applyAll, setApplyAll] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const save = () =>
    start(async () => {
      setError(null);
      if (mode === "contract") {
        const res = await setContractQuota(type.id, Number(value));
        if (!res.ok) return setError(res.error);
        toast.success(`${type.name}: ${value} days per contract`);
      } else {
        if (type.contract_quota != null) {
          const r1 = await setContractQuota(type.id, null);
          if (!r1.ok) return setError(r1.error);
        }
        const res = await setQuota(type.id, year, Number(value), applyAll);
        if (!res.ok) return setError(res.error);
        toast.success(`${type.name}: ${value} days for ${year}`);
      }
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      size="sm"
      onClose={() => !pending && onClose()}
      title={`${type.name} quota`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} loading={pending}>
            Save
          </Button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="How the days are given">
        {(
          [
            ["contract", "Per contract", "Every contract gets the days. Unused ones carry over on renewal."],
            ["year", "Per year", `Days for ${year}. Unused ones don't carry forward.`],
          ] as const
        ).map(([m, label, hint]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => {
              setMode(m);
              setValue(String(m === "contract" ? (type.contract_quota != null ? Number(type.contract_quota) : 12) : current));
            }}
            className={cn(
              "cursor-pointer rounded-2xl border px-3 py-2.5 text-left transition",
              mode === m ? "border-ink bg-soft" : "border-line hover:bg-soft",
            )}
          >
            <span className="block text-sm font-semibold text-ink">{label}</span>
            <span className="block text-[12px] leading-snug text-body">{hint}</span>
          </button>
        ))}
      </div>
      <Input
        label={mode === "contract" ? "Days per contract" : `Days per employee in ${year}`}
        type="number"
        inputMode="decimal"
        min={0}
        max={365}
        step="0.5"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={error ?? undefined}
        hint={mode === "contract" ? "Same for 3-month, 6-month and 1-year contracts. Updates contracts that haven't ended, except ones HR set by hand. People without a contract keep the yearly days." : undefined}
      />
      {mode === "year" && (
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-line px-4 py-3">
          <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} className="mt-1 accent-[#d4000f]" />
          <span>
            <span className="block text-sm font-semibold text-ink">Apply to all current employees</span>
            <span className="block text-[13px] text-body">Resets everyone&apos;s {year} allotment to this number, replacing individual changes. Otherwise it only applies to new employees.</span>
          </span>
        </label>
      )}
    </Modal>
  );
}

function TypeModal({ type, year, onClose }: { type: LeaveType | null; year: number; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState({
    name: type?.name ?? "",
    code: type?.code ?? "",
    is_paid: type?.is_paid ?? true,
    tracks_balance: type?.tracks_balance ?? true,
    requires_attachment: type?.requires_attachment ?? false,
    color: type?.color ?? COLORS[5],
    is_active: type?.is_active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));

  const save = () =>
    start(async () => {
      setError(null);
      const res = await saveLeaveType(type?.id ?? null, v, year);
      if (!res.ok) return setError(res.error);
      toast.success(type ? "Leave type updated" : "Leave type added");
      onClose();
      router.refresh();
    });

  const toggles: { key: "is_paid" | "tracks_balance" | "requires_attachment" | "is_active"; label: string; hint: string }[] = [
    { key: "is_paid", label: "Paid", hint: "Salary is not cut for these days." },
    { key: "tracks_balance", label: "Has a limit", hint: "Off = unlimited, like Unpaid Leave. Set the days with the quota button." },
    { key: "requires_attachment", label: "Document required", hint: "e.g. a medical certificate." },
    { key: "is_active", label: "Available to employees", hint: "Hide it to stop new requests. History is kept." },
  ];

  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      title={type ? `Edit ${type.name}` : "Add leave type"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} loading={pending}>
            Save
          </Button>
        </>
      }
    >
      {error && <p role="alert" className="mb-4 rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <Input label="Name" value={v.name} maxLength={40} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Maternity Leave" />
        <Input label="Code" value={v.code} maxLength={6} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="ML" disabled={!!type} />
      </div>
      <div className="mt-4">
        <span className="text-sm font-semibold text-ink">Colour</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => set("color", c)}
              aria-label={`Colour ${c}`}
              aria-pressed={v.color === c}
              className={cn("h-8 w-8 cursor-pointer rounded-full ring-offset-2 transition", v.color === c && "ring-2 ring-ink")}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        {toggles.map((t) => (
          <label key={t.key} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line px-4 py-3 hover:bg-soft">
            <input type="checkbox" checked={v[t.key]} onChange={(e) => set(t.key, e.target.checked)} className="mt-1 accent-[#d4000f]" />
            <span>
              <span className="block text-sm font-semibold text-ink">{t.label}</span>
              <span className="block text-[13px] text-body">{t.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </Modal>
  );
}
