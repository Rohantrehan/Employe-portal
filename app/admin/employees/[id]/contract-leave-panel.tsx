"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileClock, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { formatRange } from "@/lib/leave";
import { contractState, daysUntil, durationText, type ContractState } from "@/lib/letters";
import { recordContract, removeContract, setLeaveLeft } from "./contract-actions";

export type PanelContract = {
  id: string;
  starts_on: string;
  ends_on: string;
  source: "letter" | "record";
  note: string | null;
  ref_no: string | null;
};
export type PanelBalance = {
  id: string;
  contract_id: string;
  leave_type_id: string;
  allotted: number;
  carried: number;
  used: number;
  pending: number;
  used_before: number;
  set_by_hr: boolean;
  carried_from: string | null;
};
export type ContractType = { id: string; name: string; color: string; contract_quota: number };

const STATE: Record<ContractState, { label: string; tone: BadgeTone }> = {
  current: { label: "Current", tone: "success" },
  upcoming: { label: "Next", tone: "info" },
  ended: { label: "Ended", tone: "neutral" },
};

const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const left = (b: PanelBalance) => b.allotted + b.carried - b.used - b.pending;

function endAfter(start: string, months: number) {
  const d = new Date(start + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Contract terms and the leave that comes with each one (admin, employee page). */
export function ContractLeavePanel({
  employeeId,
  firstName,
  contracts,
  balances,
  types,
  today,
}: {
  employeeId: string;
  firstName: string;
  contracts: PanelContract[];
  balances: PanelBalance[];
  types: ContractType[];
  today: string;
}) {
  const [record, setRecord] = useState<PanelContract | "new" | null>(null);
  const [editLeft, setEditLeft] = useState<{ b: PanelBalance; c: PanelContract; t: ContractType } | null>(null);
  const [removing, setRemoving] = useState<PanelContract | null>(null);
  const sorted = [...contracts].sort((a, b) => b.starts_on.localeCompare(a.starts_on));
  const quotaText = types.map((t) => `${n(t.contract_quota)} ${t.name}`).join(", ");
  const latest = sorted[0];
  const ending = latest && latest.ends_on >= today && daysUntil(today, latest.ends_on) <= 30 ? latest : null;

  return (
    <Card>
      <CardHeader
        title="Contracts & paid leave"
        description={
          types.length
            ? `Each contract comes with ${quotaText}. Unused days carry over when it's renewed; without a renewal they lapse.`
            : "No leave type follows the contract right now (Leave → Types)."
        }
        action={
          <Button size="sm" variant="secondary" onClick={() => setRecord("new")}>
            <Plus className="h-3.5 w-3.5" /> Record existing contract
          </Button>
        }
      />
      {ending && (
        <p className="mx-5 mt-4 rounded-2xl bg-warning-tint px-4 py-2.5 text-[13px] text-warning sm:mx-6">
          <b>Contract ends {formatDate(ending.ends_on)}</b> ({daysUntil(today, ending.ends_on) === 0 ? "today" : `in ${daysUntil(today, ending.ends_on)} days`}). Renew it to carry the unused leave over, or record {firstName}&apos;s exit.
        </p>
      )}
      {sorted.length === 0 ? (
        <EmptyState
          icon={<FileClock />}
          title="No contract yet"
          description={`Issue a contract above, or if ${firstName} already works here on a paper contract, record it with the leave they have left.`}
        />
      ) : (
        <ul className="divide-y divide-line">
          {sorted.map((c) => {
            const st = contractState(c.starts_on, c.ends_on, today);
            return (
              <li key={c.id} className="px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-ink">{formatRange(c.starts_on, c.ends_on)}</p>
                      <Badge tone={STATE[st].tone} dot={st === "current"}>{STATE[st].label}</Badge>
                    </div>
                    <p className="mt-0.5 text-[13px] text-body">
                      {durationText(c.starts_on, c.ends_on)} · {c.source === "letter" ? `Letter ${c.ref_no ?? ""}` : "Recorded (signed on paper)"}
                      {c.note && ` · ${c.note}`}
                    </p>
                  </div>
                  {c.source === "record" && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setRecord(c)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(c)} aria-label="Remove contract">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                {types.map((t) => {
                  const b = balances.find((x) => x.contract_id === c.id && x.leave_type_id === t.id);
                  if (!b) return null;
                  const l = left(b);
                  const tot = b.allotted + b.carried;
                  return (
                    <div key={t.id} className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-line px-4 py-2.5">
                      <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: t.color }} aria-hidden />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="text-ink">
                          <b>{t.name}:</b> <b className={cn("tabular-nums", st === "ended" ? "text-body line-through decoration-1" : "text-ink")}>{n(l)}</b>{" "}
                          <span className="text-body">left of {n(tot)}</span>
                        </p>
                        <p className="text-[12.5px] text-body">
                          {n(b.allotted)} for this contract
                          {b.carried > 0 && ` + ${n(b.carried)} carried over`}
                          {` · ${n(b.used)} used`}
                          {b.used_before > 0 && ` (${n(b.used_before)} before the portal)`}
                          {b.pending > 0 && ` · ${n(b.pending)} pending`}
                          {b.set_by_hr && " · set by HR"}
                          {st === "ended" && (sorted.some((o) => o.starts_on > c.ends_on) ? " · moved to the next contract" : " · lapsed unless renewed")}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setEditLeft({ b, c, t })}>
                        Set leave left
                      </Button>
                    </div>
                  );
                })}
              </li>
            );
          })}
        </ul>
      )}

      {record && (
        <RecordModal
          employeeId={employeeId}
          firstName={firstName}
          contract={record === "new" ? null : record}
          latest={latest ?? null}
          types={types}
          today={today}
          onClose={() => setRecord(null)}
        />
      )}
      {editLeft && <LeftModal {...editLeft} employeeId={employeeId} firstName={firstName} onClose={() => setEditLeft(null)} />}
      {removing && <RemoveModal contract={removing} employeeId={employeeId} onClose={() => setRemoving(null)} />}
    </Card>
  );
}

function RecordModal({
  employeeId,
  firstName,
  contract,
  latest,
  types,
  today,
  onClose,
}: {
  employeeId: string;
  firstName: string;
  contract: PanelContract | null;
  latest: PanelContract | null;
  types: ContractType[];
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(contract?.starts_on ?? "");
  const [to, setTo] = useState(contract?.ends_on ?? "");
  const [note, setNote] = useState(contract?.note ?? "");
  const [left, setLeft] = useState<Record<string, string>>(() => Object.fromEntries(types.map((t) => [t.id, String(t.contract_quota)])));
  const isNew = !contract;
  const before = latest && from && latest.ends_on < from;

  const save = () =>
    start(async () => {
      setError(null);
      const leftNums: Record<string, number> = {};
      if (isNew) {
        for (const t of types) {
          const raw = left[t.id]?.trim();
          if (raw === "" || raw == null) continue;
          const v = Number(raw);
          if (!Number.isFinite(v)) return setError(`Enter the ${t.name} left as a number.`);
          leftNums[t.id] = v;
        }
      }
      const res = await recordContract({ id: contract?.id ?? null, employeeId, from, to, note, left: isNew ? leftNums : undefined });
      if (!res.ok) return setError(res.error);
      toast.success(isNew ? "Contract recorded" : "Contract updated");
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      title={isNew ? "Record existing contract" : "Edit recorded contract"}
      description={
        isNew
          ? `For a contract ${firstName} signed on paper before the portal. No letter is created. New contracts should be issued as letters instead.`
          : "Change the dates or the note. Leave left is changed on the contract's leave row."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} loading={pending}>
            {isNew ? "Record contract" : "Save"}
          </Button>
        </>
      }
    >
      {error && <p role="alert" className="mb-4 rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Starts on" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        <Input label="Ends on" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
      </div>
      {from && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-body">Length:</span>
          {[3, 6, 12].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setTo(endAfter(from, m))}
              className={cn(
                "cursor-pointer rounded-full border px-3 py-1 font-semibold",
                to === endAfter(from, m) ? "border-ink bg-ink text-white" : "border-line text-ink hover:bg-soft",
              )}
            >
              {m === 12 ? "1 year" : `${m} months`}
            </button>
          ))}
          {from && to && to >= from && <span className="text-body">· {durationText(from, to)}</span>}
        </div>
      )}
      {isNew && types.length > 0 && (
        <div className="mt-5 rounded-2xl border border-line p-4">
          <p className="text-sm font-semibold text-ink">Leave left on this contract today</p>
          <p className="mt-0.5 text-[13px] text-body">
            What {firstName} can still take, including anything carried over from earlier contracts. Example: 4 of 12 used = 8 left.
            {to && to < today && " This contract has ended, so this is what carries over to the next one."}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {types.map((t) => (
              <Input
                key={t.id}
                label={`${t.name} left`}
                type="number"
                inputMode="decimal"
                min={0}
                max={365}
                step="0.5"
                value={left[t.id] ?? ""}
                onChange={(e) => setLeft((p) => ({ ...p, [t.id]: e.target.value }))}
                hint={`A contract comes with ${n(t.contract_quota)}.`}
              />
            ))}
          </div>
          {before && <p className="mt-3 text-[12.5px] text-body">The earlier contract&apos;s unused leave would normally carry over. The number you enter here replaces that.</p>}
        </div>
      )}
      <div className="mt-4">
        <Input label="Note (optional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Signed copy in the HR folder" />
      </div>
    </Modal>
  );
}

function LeftModal({
  b,
  c,
  t,
  employeeId,
  firstName,
  onClose,
}: {
  b: PanelBalance;
  c: PanelContract;
  t: ContractType;
  employeeId: string;
  firstName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(n(left(b)));
  const [error, setError] = useState<string | null>(null);

  const save = (v: number | null) =>
    start(async () => {
      setError(null);
      if (v !== null && !Number.isFinite(v)) return setError("Enter a number.");
      const res = await setLeaveLeft(b.id, employeeId, v);
      if (!res.ok) return setError(res.error);
      toast.success(v === null ? "Back to automatic carry-over" : `${t.name} left set to ${n(v)}`);
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      size="sm"
      onClose={() => !pending && onClose()}
      title={`${t.name} left · ${firstName}`}
      description={`Contract ${formatRange(c.starts_on, c.ends_on)}. ${n(b.used - b.used_before)} used in the portal${b.pending ? `, ${n(b.pending)} pending` : ""}.`}
      footer={
        <>
          {b.set_by_hr && (
            <Button variant="ghost" onClick={() => save(null)} disabled={pending} className="mr-auto">
              Back to automatic
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => save(Number(value))} loading={pending}>
            Save
          </Button>
        </>
      }
    >
      <Input
        label="Days left"
        type="number"
        inputMode="decimal"
        min={0}
        max={365}
        step="0.5"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={error ?? undefined}
        hint="Replaces the automatic number (carried over from the last contract). Later contracts carry over from this."
      />
    </Modal>
  );
}

function RemoveModal({ contract, employeeId, onClose }: { contract: PanelContract; employeeId: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () =>
    start(async () => {
      const res = await removeContract(contract.id, employeeId);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Contract removed");
      onClose();
      router.refresh();
    });
  return (
    <Modal
      open
      size="sm"
      onClose={() => !pending && onClose()}
      title="Remove this contract?"
      description={`${formatRange(contract.starts_on, contract.ends_on)}. Its leave is removed too, and the next contract carries over from the one before it.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Keep it
          </Button>
          <Button variant="danger" onClick={remove} loading={pending}>
            Remove
          </Button>
        </>
      }
    />
  );
}
