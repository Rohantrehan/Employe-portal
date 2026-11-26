"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { usable, type Balance, type LeaveType } from "@/lib/leave";
import { setLeaveLeft } from "@/app/admin/employees/[id]/contract-actions";
import { setAllotment } from "./actions";

type Bal = Balance & { id: string };
export type BalanceRow = { employeeId: string; name: string; empCode: string; avatar: string | null; balances: Bal[] };

export function BalancesPanel({ rows, types, year }: { rows: BalanceRow[]; types: LeaveType[]; year: number }) {
  const [editing, setEditing] = useState<{ row: BalanceRow; type: LeaveType; bal: Bal } | null>(null);

  if (!rows.length) {
    return (
      <Card>
        <EmptyState icon={<Users />} title="No active employees" />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader title={`Balances ${year}`} description="Left of total, per employee. Contract leave shows the current contract. Click a cell to change it." />
      <Table>
        <THead>
          <tr>
            <TH>Employee</TH>
            {types.map((t) => (
              <TH key={t.id}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                  {t.name}
                </span>
              </TH>
            ))}
          </tr>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.employeeId}>
              <TD>
                <Link href={`/admin/employees/${row.employeeId}`} className="flex items-center gap-3 hover:text-brand">
                  <Avatar name={row.name} src={row.avatar} size={32} />
                  <span>
                    <span className="block font-semibold">{row.name}</span>
                    <span className="block font-mono text-xs text-body">{row.empCode}</span>
                  </span>
                </Link>
              </TD>
              {types.map((t) => {
                const b = row.balances.find((x) => x.leave_type_id === t.id);
                if (!b) return <TD key={t.id} className="text-body">—</TD>;
                const left = usable(b);
                const contract = b.state && b.state !== "year";
                return (
                  <TD key={t.id}>
                    <button
                      type="button"
                      onClick={() => setEditing({ row, type: t, bal: b })}
                      className="group inline-flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1 -mx-2 text-left transition-colors hover:bg-app"
                      title="Change allotment"
                    >
                      <span>
                        <b className="tabular-nums text-ink">{left}</b>
                        <span className="text-body"> / {b.allotted + b.carried}</span>
                        {b.pending > 0 && <span className="block text-xs text-warning">{b.pending} pending</span>}
                        {contract && b.ends_on && (
                          <span className={`block text-xs ${b.state === "ended" ? "text-warning" : "text-body"}`}>
                            {b.state === "ended" ? "Ended " : b.state === "upcoming" ? "Starts " : "Until "}
                            {formatDate(b.state === "upcoming" ? b.starts_on! : b.ends_on)}
                          </span>
                        )}
                      </span>
                      <Pencil className="h-3.5 w-3.5 text-body opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  </TD>
                );
              })}
            </TR>
          ))}
        </TBody>
      </Table>
      {editing && (editing.bal.state && editing.bal.state !== "year" ? <LeftModal {...editing} onClose={() => setEditing(null)} /> : <AllotmentModal {...editing} year={year} onClose={() => setEditing(null)} />)}
    </Card>
  );
}

function AllotmentModal({ row, type, bal, year, onClose }: { row: BalanceRow; type: LeaveType; bal: Bal; year: number; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(String(bal.allotted));
  const [error, setError] = useState<string | null>(null);
  const min = bal.used + bal.pending;

  const save = () =>
    start(async () => {
      setError(null);
      const res = await setAllotment(bal.id, Number(value));
      if (!res.ok) return setError(res.error);
      toast.success(`${row.name}: ${type.name} set to ${value} days`);
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      size="sm"
      onClose={() => !pending && onClose()}
      title={`${type.name} for ${row.name}`}
      description={`Days given for ${year}. ${bal.used} used, ${bal.pending} pending.`}
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
      <Input
        label="Days for the year"
        type="number"
        inputMode="decimal"
        min={min}
        max={365}
        step="0.5"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={error ?? undefined}
        hint={`Minimum ${min} (already used or pending).`}
      />
    </Modal>
  );
}

function LeftModal({ row, type, bal, onClose }: { row: BalanceRow; type: LeaveType; bal: Bal; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const [value, setValue] = useState(fmt(bal.allotted + bal.carried - bal.used - bal.pending));
  const [error, setError] = useState<string | null>(null);

  const save = () =>
    start(async () => {
      setError(null);
      const v = Number(value);
      if (!Number.isFinite(v)) return setError("Enter a number.");
      const res = await setLeaveLeft(bal.id, row.employeeId, v);
      if (!res.ok) return setError(res.error);
      toast.success(`${row.name}: ${type.name} left set to ${fmt(v)}`);
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      size="sm"
      onClose={() => !pending && onClose()}
      title={`${type.name} for ${row.name}`}
      description={`Contract ${formatDate(bal.starts_on)} – ${formatDate(bal.ends_on)}. ${fmt(bal.allotted)} for the contract${bal.carried ? ` + ${fmt(bal.carried)} carried over` : ""}, ${fmt(bal.used)} used${bal.pending ? `, ${fmt(bal.pending)} pending` : ""}.`}
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
        hint="Replaces the automatic number. All contracts are on the employee's page."
      />
    </Modal>
  );
}
