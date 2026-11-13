"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Download, Eye, Info, MoreHorizontal, Save, Send, Trash2, Undo2, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { formatDate, formatINR } from "@/lib/format";
import { formatHours } from "@/lib/overtime";
import type { PaymentStatus, PayslipStatus } from "@/lib/payroll";
import { deleteDraft, saveDrafts, setPaid, setPublished } from "./actions";

export type PayrollRow = {
  employeeId: string;
  name: string;
  empCode: string;
  designation: string | null;
  avatar: string | null;
  isActive: boolean;
  profileBasic: number;
  workingDays: number;
  presentDays: number;
  leaveDays: number;
  overtimeHours: number;
  payslipId: string | null;
  basic: number | null;
  bonus: number | null;
  extra: number | null;
  net: number | null;
  status: PayslipStatus | null;
  paymentStatus: PaymentStatus | null;
  paidOn: string | null;
  paymentRef: string | null;
};

type Draft = { basic: string; bonus: string; extra: string };

const toDraft = (r: PayrollRow): Draft => ({
  basic: String(r.basic ?? r.profileBasic ?? 0),
  bonus: String(r.bonus ?? 0),
  extra: String(r.extra ?? 0),
});

const n = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? NaN : Number(v));
const num = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

export function PayrollSheet({ rows, month, today, isCurrentMonth }: { rows: PayrollRow[]; month: string; today: string; isCurrentMonth: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(rows.map((r) => [r.employeeId, toDraft(r)])));
  const [paying, setPaying] = useState<PayrollRow | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const isLocked = (r: PayrollRow) => r.status === "published";
  const changed = useMemo(
    () =>
      rows.filter((r) => {
        if (isLocked(r)) return false;
        const d = drafts[r.employeeId];
        if (!r.payslipId) return true; // never saved yet
        return n(d.basic) !== r.basic || n(d.bonus) !== r.bonus || n(d.extra) !== r.extra;
      }),
    [rows, drafts],
  );
  const unsavedNew = changed.filter((r) => !r.payslipId).length;
  const savedDrafts = rows.filter((r) => r.status === "draft");
  const invalid = changed.some((r) => {
    const d = drafts[r.employeeId];
    return [d.basic, d.bonus, d.extra].some((v) => !(n(v) >= 0));
  });

  const set = (id: string, k: keyof Draft, v: string) => setDrafts((p) => ({ ...p, [id]: { ...p[id], [k]: v } }));

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Something went wrong");
      if (res.message) toast.success(res.message);
      setMenu(null);
      router.refresh();
    });

  const saveAll = () =>
    run(() =>
      saveDrafts(
        month,
        changed.map((r) => ({ employeeId: r.employeeId, name: r.name, basic: n(drafts[r.employeeId].basic), bonus: n(drafts[r.employeeId].bonus), extra: n(drafts[r.employeeId].extra) })),
      ),
    );

  if (!rows.length) {
    return (
      <Card>
        <EmptyState icon={<Users />} title="No employees for this month" description="Employees who had joined by the end of the month appear here." />
      </Card>
    );
  }

  return (
    <>
      {isCurrentMonth && (
        <div className="mb-4 flex items-start gap-2.5 rounded-2xl bg-warning-tint px-4 py-3 text-sm text-warning">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          This month isn&apos;t over yet, so the attendance numbers are still changing. They&apos;re snapshotted onto the payslip each time you save.
        </div>
      )}

      {/* Action bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-body">
          {changed.length > 0 ? (
            <>
              <b className="text-ink">{changed.length}</b> row{changed.length === 1 ? "" : "s"} to save
              {unsavedNew > 0 && ` (${unsavedNew} new, pre-filled from basic salary)`}
            </>
          ) : (
            "Everything is saved."
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={saveAll} loading={pending} disabled={!changed.length || invalid}>
            <Save className="h-4 w-4" /> Save drafts{changed.length ? ` (${changed.length})` : ""}
          </Button>
          <Button onClick={() => run(() => setPublished(savedDrafts.map((r) => r.payslipId!), true))} disabled={pending || !savedDrafts.length || changed.some((r) => r.payslipId)}>
            <Send className="h-4 w-4" /> Publish drafts{savedDrafts.length ? ` (${savedDrafts.length})` : ""}
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
            <thead className="bg-soft">
              <tr className="text-[11px] font-bold uppercase tracking-wider text-body">
                <th className="border-b border-line px-5 py-3">Employee</th>
                <th className="border-b border-line px-3 py-3" title="Present / working days">Present</th>
                <th className="border-b border-line px-3 py-3">Leave</th>
                <th className="border-b border-line px-3 py-3">Extra hrs</th>
                <th className="border-b border-line px-3 py-3">Basic (₹)</th>
                <th className="border-b border-line px-3 py-3">Bonus (₹)</th>
                <th className="border-b border-line px-3 py-3">Extra Pay (₹)</th>
                <th className="border-b border-line px-3 py-3 text-right">Net pay</th>
                <th className="border-b border-line px-3 py-3">Status</th>
                <th className="border-b border-line px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const d = drafts[r.employeeId];
                const locked = isLocked(r);
                const net = locked ? r.net ?? 0 : [d.basic, d.bonus, d.extra].reduce((s, v) => s + (n(v) >= 0 ? n(v) : 0), 0);
                const dirty = changed.includes(r);
                return (
                  <tr key={r.employeeId} className={cn("align-middle", dirty && "bg-tint-2/40")}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.name} src={r.avatar} size={34} />
                        <div className="min-w-0">
                          <Link href={`/admin/employees/${r.employeeId}`} className="block truncate font-semibold text-ink hover:text-brand">
                            {r.name}
                          </Link>
                          <p className="truncate text-xs text-body">
                            {r.empCode}
                            {!r.isActive && " · deactivated"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      <b>{num(r.presentDays)}</b>
                      <span className="text-body"> / {num(r.workingDays)}</span>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-body">{num(r.leaveDays)}</td>
                    <td className="px-3 py-3 tabular-nums">{r.overtimeHours ? <b>{formatHours(r.overtimeHours)}</b> : <span className="text-body">—</span>}</td>
                    {(["basic", "bonus", "extra"] as const).map((k) => (
                      <td key={k} className="px-3 py-2">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="1"
                          value={d[k]}
                          disabled={locked || pending}
                          onChange={(e) => set(r.employeeId, k, e.target.value)}
                          aria-label={`${k} for ${r.name}`}
                          className={cn(
                            "h-10 w-28 rounded-xl border bg-white px-3 text-right tabular-nums outline-none transition focus:border-brand focus:ring-4 focus:ring-tint disabled:border-transparent disabled:bg-transparent disabled:text-ink",
                            n(d[k]) >= 0 ? "border-line" : "border-brand",
                          )}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right text-base font-extrabold tabular-nums text-ink">{formatINR(net)}</td>
                    <td className="px-3 py-3">
                      {!r.status ? (
                        <Badge>Not saved</Badge>
                      ) : r.status === "draft" ? (
                        <Badge tone="warning">Draft</Badge>
                      ) : r.paymentStatus === "paid" ? (
                        <Badge tone="success" dot>
                          Paid {formatDate(r.paidOn).slice(0, 6)}
                        </Badge>
                      ) : (
                        <Badge tone="info">Published</Badge>
                      )}
                    </td>
                    <td className="relative px-3 py-3 text-right">
                      {r.payslipId && (
                        <>
                          <button
                            type="button"
                            onClick={() => setMenu(menu === r.employeeId ? null : r.employeeId)}
                            aria-label={`Actions for ${r.name}`}
                            aria-expanded={menu === r.employeeId}
                            className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-body hover:bg-app hover:text-ink"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {menu === r.employeeId && (
                            <RowMenu
                              row={r}
                              dirty={dirty}
                              onClose={() => setMenu(null)}
                              onPublish={() => run(() => setPublished([r.payslipId!], true))}
                              onUnpublish={() => run(() => setPublished([r.payslipId!], false))}
                              onPaid={() => {
                                setMenu(null);
                                setPaying(r);
                              }}
                              onUnpaid={() => run(() => setPaid(r.payslipId!, false, null, ""))}
                              onDelete={() => run(() => deleteDraft(r.payslipId!))}
                            />
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {paying && <PaidModal row={paying} today={today} onClose={() => setPaying(null)} />}
    </>
  );
}

function RowMenu({
  row,
  dirty,
  onClose,
  onPublish,
  onUnpublish,
  onPaid,
  onUnpaid,
  onDelete,
}: {
  row: PayrollRow;
  dirty: boolean;
  onClose: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onPaid: () => void;
  onUnpaid: () => void;
  onDelete: () => void;
}) {
  const item = "flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-app disabled:cursor-not-allowed disabled:opacity-50";
  const pdf = `/api/payslips/${row.payslipId}/pdf`;
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} aria-hidden />
      <div className="animate-pop absolute right-3 top-12 z-20 w-56 rounded-2xl border border-line bg-white p-1.5 text-left shadow-pop" role="menu">
        <a href={`${pdf}?view=1`} target="_blank" rel="noopener" className={item} role="menuitem" onClick={onClose}>
          <Eye className="h-4 w-4" /> Preview PDF
        </a>
        <a href={pdf} className={item} role="menuitem" onClick={onClose}>
          <Download className="h-4 w-4" /> Download PDF
        </a>
        <div className="my-1 h-px bg-line" />
        {row.status === "draft" ? (
          <>
            <button className={item} onClick={onPublish} disabled={dirty} title={dirty ? "Save your changes first" : undefined} role="menuitem">
              <Send className="h-4 w-4" /> Publish
            </button>
            <button className={cn(item, "text-brand")} onClick={onDelete} role="menuitem">
              <Trash2 className="h-4 w-4" /> Delete draft
            </button>
          </>
        ) : row.paymentStatus === "paid" ? (
          <button className={item} onClick={onUnpaid} role="menuitem">
            <Undo2 className="h-4 w-4" /> Mark as unpaid
          </button>
        ) : (
          <>
            <button className={item} onClick={onPaid} role="menuitem">
              <BadgeCheck className="h-4 w-4" /> Mark as paid
            </button>
            <button className={item} onClick={onUnpublish} role="menuitem">
              <Undo2 className="h-4 w-4" /> Unpublish to edit
            </button>
          </>
        )}
      </div>
    </>
  );
}

function PaidModal({ row, today, onClose }: { row: PayrollRow; today: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(today);
  const [ref, setRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = () =>
    start(async () => {
      setError(null);
      const res = await setPaid(row.payslipId!, true, date, ref);
      if (!res.ok) return setError(res.error);
      toast.success(`${row.name} marked as paid`);
      onClose();
      router.refresh();
    });
  return (
    <Modal
      open
      size="sm"
      onClose={() => !pending && onClose()}
      title="Mark as paid"
      description={`${row.name} · ${formatINR(row.net ?? 0)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} loading={pending} disabled={!date}>
            Mark paid
          </Button>
        </>
      }
    >
      {error && <p role="alert" className="mb-4 rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">{error}</p>}
      <div className="space-y-4">
        <Input label="Paid on" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        <Input label="Reference (optional)" value={ref} maxLength={100} onChange={(e) => setRef(e.target.value)} placeholder="e.g. UTR / transaction ID" hint="Shown on the employee's payslip." />
      </div>
      <p className="mt-4 text-[13px] text-body">This only records the payment in the portal. No money is moved.</p>
    </Modal>
  );
}
