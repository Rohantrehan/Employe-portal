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
import type { LeaveType } from "@/lib/leave";
import { setAllotment } from "./actions";

type Bal = { id: string; leave_type_id: string; allotted: number; carried: number; used: number; pending: number };
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
      <CardHeader title={`Balances ${year}`} description="Left of total, per employee. Click a cell to give someone more or fewer days." />
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
                const left = b.allotted + b.carried - b.used - b.pending;
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
      {editing && <AllotmentModal {...editing} year={year} onClose={() => setEditing(null)} />}
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
