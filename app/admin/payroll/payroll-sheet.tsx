"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Download, Eye, Info, MessageSquareText, MoreHorizontal, Save, Send, Trash2, Undo2, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { formatDate, formatINR } from "@/lib/format";
import { formatHours } from "@/lib/overtime";
import { DEFAULT_RATING, RATINGS, multiplierText, performanceBonus, ratingInfo, type PaymentStatus, type PayslipStatus } from "@/lib/payroll";
import { deleteDraft, saveDrafts, setPaid, setPublished } from "./actions";

export type PayrollRow = {
  employeeId: string;
  name: string;
  empCode: string;
  designation: string | null;
  avatar: string | null;
  isActive: boolean;
  leftOn: string | null;
  profileBasic: number;
  workingDays: number;
  presentDays: number;
  leaveDays: number;
  overtimeHours: number;
  lateDays: number;
  payslipId: string | null;
  basic: number | null;
  excellence: number | null;
  rating: number | null;
  bonus: number | null;
  night: number | null;
  remarks: string;
  net: number | null;
  status: PayslipStatus | null;
  paymentStatus: PaymentStatus | null;
  paidOn: string | null;
  paymentRef: string | null;
};

type Draft = { basic: string; excellence: string; rating: string; night: string; remarks: string };
const MONEY = ["basic", "excellence", "night"] as const;

/** Leaves above this in a month count against the rating. */
const LEAVE_LIMIT = 5;

const toDraft = (r: PayrollRow): Draft => ({
  basic: String(r.basic ?? r.profileBasic ?? 0),
  excellence: String(r.excellence ?? 0),
  rating: String(r.rating ?? DEFAULT_RATING),
  night: String(r.night ?? 0),
  remarks: r.remarks ?? "",
});

const n = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? NaN : Number(v));
const num = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

/** Bonus + net for a draft row, worked out the same way the database does. */
function calc(d: Draft) {
  const basic = n(d.basic);
  const exc = n(d.excellence);
  const night = n(d.night);
  const bonus = basic >= 0 && exc >= 0 ? performanceBonus(basic, exc, Number(d.rating)) : NaN;
  const net = [basic, exc, bonus, night].every(Number.isFinite) ? basic + exc + bonus + night : NaN;
  return { bonus, net };
}

export function PayrollSheet({ rows, month, today, isCurrentMonth }: { rows: PayrollRow[]; month: string; today: string; isCurrentMonth: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(rows.map((r) => [r.employeeId, toDraft(r)])));
  const [paying, setPaying] = useState<PayrollRow | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [noting, setNoting] = useState<PayrollRow | null>(null);

  const isLocked = (r: PayrollRow) => r.status === "published";
  const changed = useMemo(
    () =>
      rows.filter((r) => {
        if (isLocked(r)) return false;
        const d = drafts[r.employeeId];
        if (!r.payslipId) return true; // never saved yet
        return (
          n(d.basic) !== r.basic ||
          n(d.excellence) !== r.excellence ||
          Number(d.rating) !== r.rating ||
          n(d.night) !== r.night ||
          d.remarks.trim() !== (r.remarks ?? "").trim()
        );
      }),
    [rows, drafts],
  );
  const unsavedNew = changed.filter((r) => !r.payslipId).length;
  const savedDrafts = rows.filter((r) => r.status === "draft");
  const invalid = changed.some((r) => {
    const d = drafts[r.employeeId];
    return MONEY.some((k) => !(n(d[k]) >= 0)) || !ratingInfo(Number(d.rating)) || d.remarks.length > 500;
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
        changed.map((r) => {
          const d = drafts[r.employeeId];
          return { employeeId: r.employeeId, name: r.name, basic: n(d.basic), excellence: n(d.excellence), rating: Number(d.rating), night: n(d.night), remarks: d.remarks };
        }),
      ),
    );

  if (!rows.length) {
    return (
      <Card>
        <EmptyState icon={<Users />} title="No employees for this month" description="Employees who had joined by the end of the month appear here." />
      </Card>
    );
  }

  const moneyInput = (r: PayrollRow, k: (typeof MONEY)[number], locked: boolean, label: string) => {
    const d = drafts[r.employeeId];
    return (
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="1"
        value={d[k]}
        disabled={locked || pending}
        onChange={(e) => set(r.employeeId, k, e.target.value)}
        aria-label={`${label} for ${r.name}`}
        className={cn(
          "h-10 w-[92px] rounded-xl border bg-white px-2.5 text-right tabular-nums outline-none transition focus:border-brand focus:ring-4 focus:ring-tint disabled:border-transparent disabled:bg-transparent disabled:text-ink",
          n(d[k]) >= 0 ? "border-line" : "border-brand",
        )}
      />
    );
  };

  return (
    <>
      {isCurrentMonth && (
        <div className="mb-4 flex items-start gap-2.5 rounded-2xl bg-warning-tint px-4 py-3 text-sm text-warning">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          This month isn&apos;t over yet, so the attendance numbers are still changing. They&apos;re snapshotted onto the payslip each time you save.
        </div>
      )}

      <RatingGuide />

      {/* Action bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-body">
          {changed.length > 0 ? (
            <>
              <b className="text-ink">{changed.length}</b> row{changed.length === 1 ? "" : "s"} to save
              {unsavedNew > 0 && ` (${unsavedNew} new, pre-filled from basic salary with rating ${DEFAULT_RATING})`}
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
          <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
            <thead className="bg-soft">
              <tr className="text-[11px] font-bold uppercase tracking-wider text-body">
                <th className="border-b border-line px-5 py-3">Employee</th>
                <th className="border-b border-line px-3 py-3" title="Present / working days">Present</th>
                <th className="border-b border-line px-3 py-3" title={`More than ${LEAVE_LIMIT} leaves lowers the rating`}>Leave</th>
                <th className="border-b border-line px-3 py-3" title="Days marked late this month">Late</th>
                <th className="border-b border-line px-3 py-3" title="Approved extra hours">Extra</th>
                <th className="border-b border-line px-3 py-3">Basic (₹)</th>
                <th className="border-b border-line px-3 py-3">Excellence (₹)</th>
                <th className="border-b border-line px-3 py-3">Rating</th>
                <th className="border-b border-line px-3 py-3 text-right" title="(Basic + Excellence) × (multiplier − 1)">Perf. bonus</th>
                <th className="border-b border-line px-3 py-3">Night shift (₹)</th>
                <th className="border-b border-line px-3 py-3 text-right">Net pay</th>
                <th className="border-b border-line px-3 py-3">Status</th>
                <th className="border-b border-line px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const d = drafts[r.employeeId];
                const locked = isLocked(r);
                const live = calc(d);
                const bonus = locked ? r.bonus ?? 0 : live.bonus;
                const net = locked ? r.net ?? 0 : live.net;
                const rating = locked ? r.rating : Number(d.rating);
                const info = ratingInfo(rating);
                const dirty = changed.includes(r);
                const remarks = locked ? r.remarks : d.remarks;
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
                            {r.leftOn ? (
                              <span className="font-semibold text-brand"> · final month, last day {formatDate(r.leftOn).slice(0, 6)}</span>
                            ) : (
                              !r.isActive && " · deactivated"
                            )}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      <b>{num(r.presentDays)}</b>
                      <span className="text-body"> / {num(r.workingDays)}</span>
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {r.leaveDays > LEAVE_LIMIT ? (
                        <span className="font-bold text-warning" title={`More than ${LEAVE_LIMIT} leaves this month`}>
                          {num(r.leaveDays)} ⚠
                        </span>
                      ) : (
                        <span className="text-body">{num(r.leaveDays)}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 tabular-nums">{r.lateDays ? <b className="text-warning">{r.lateDays}</b> : <span className="text-body">0</span>}</td>
                    <td className="px-3 py-3 tabular-nums">{r.overtimeHours ? <b>{formatHours(r.overtimeHours)}</b> : <span className="text-body">—</span>}</td>
                    <td className="px-3 py-2">{moneyInput(r, "basic", locked, "Basic")}</td>
                    <td className="px-3 py-2">{moneyInput(r, "excellence", locked, "Excellence bonus")}</td>
                    <td className="px-3 py-2">
                      {locked ? (
                        <span className="font-semibold text-ink">{info ? `${num(info.value)} · ${multiplierText(info.multiplier)}` : "—"}</span>
                      ) : (
                        <select
                          value={d.rating}
                          disabled={pending}
                          onChange={(e) => set(r.employeeId, "rating", e.target.value)}
                          aria-label={`Rating for ${r.name}`}
                          className="h-10 w-[108px] cursor-pointer rounded-xl border border-line bg-white px-2 text-sm font-semibold tabular-nums outline-none transition focus:border-brand focus:ring-4 focus:ring-tint"
                        >
                          {RATINGS.map((x) => (
                            <option key={x.value} value={String(x.value)}>
                              {num(x.value)} · {multiplierText(x.multiplier)}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className={cn("px-3 py-3 text-right font-semibold tabular-nums", bonus < 0 ? "text-brand" : "text-ink")}>{Number.isFinite(bonus) ? formatINR(bonus) : "—"}</td>
                    <td className="px-3 py-2">{moneyInput(r, "night", locked, "Night shift pay")}</td>
                    <td className="px-3 py-3 text-right text-base font-extrabold tabular-nums text-ink">{Number.isFinite(net) ? formatINR(net) : "—"}</td>
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
                    <td className="relative whitespace-nowrap px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setNoting(r)}
                        aria-label={`Remarks for ${r.name}${remarks.trim() ? " (has remarks)" : ""}`}
                        title={remarks.trim() ? remarks : locked ? "No remarks" : "Add remarks"}
                        className={cn(
                          "relative inline-grid h-9 w-9 cursor-pointer place-items-center rounded-full hover:bg-app hover:text-ink",
                          remarks.trim() ? "text-brand" : "text-body",
                        )}
                      >
                        <MessageSquareText className="h-4 w-4" />
                        {remarks.trim() && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand" aria-hidden />}
                      </button>
                      {r.payslipId && (
                        <>
                          <button
                            type="button"
                            onClick={() => setMenu(menu === r.employeeId ? null : r.employeeId)}
                            aria-label={`Actions for ${r.name}`}
                            aria-expanded={menu === r.employeeId}
                            className="inline-grid h-9 w-9 cursor-pointer place-items-center rounded-full text-body hover:bg-app hover:text-ink"
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
      {noting && (
        <RemarksModal
          row={noting}
          locked={isLocked(noting)}
          value={isLocked(noting) ? noting.remarks : drafts[noting.employeeId].remarks}
          onSave={(v) => set(noting.employeeId, "remarks", v)}
          onClose={() => setNoting(null)}
        />
      )}
    </>
  );
}

function RatingGuide() {
  return (
    <details className="group mb-4 rounded-2xl border border-line bg-white px-4 py-3 text-sm">
      <summary className="cursor-pointer list-none font-semibold text-ink marker:hidden">
        <span className="inline-flex items-center gap-2">
          <Info className="h-4 w-4 text-body" /> How the rating works
          <span className="font-normal text-body group-open:hidden">· tap to see the multiplier table</span>
        </span>
      </summary>
      <div className="mt-3 grid gap-4 lg:grid-cols-[auto_1fr]">
        <table className="text-left">
          <thead>
            <tr className="text-[11px] font-bold uppercase tracking-wider text-body">
              <th className="py-1 pr-6">Rating</th>
              <th className="py-1 pr-6">Multiplier</th>
              <th className="py-1">Effect</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {RATINGS.map((r) => (
              <tr key={r.value}>
                <td className="py-1 pr-6 font-semibold text-ink">{num(r.value)}</td>
                <td className="py-1 pr-6 text-ink">{multiplierText(r.multiplier)}</td>
                <td className="py-1 text-body">
                  {r.label}
                  {r.value === DEFAULT_RATING && " (default)"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-2 text-body">
          <p>
            <b className="text-ink">Performance bonus</b> = (Basic + Excellence bonus) × (multiplier − 1). At rating 3 it is negative and shows on the payslip as a
            performance adjustment.
          </p>
          <p>
            <b className="text-ink">Raises the rating:</b> active on the team server, deliverables on time, extra initiative, smooth revisions.
          </p>
          <p>
            <b className="text-ink">Lowers it:</b> late arrivals, missed deadlines without notice, wrong or badly named files, more than {LEAVE_LIMIT} leaves in a month,
            frequent re-renders, poor folder hygiene. The <b className="text-ink">Late</b> and <b className="text-ink">Leave</b> columns help with the first and fourth.
          </p>
        </div>
      </div>
    </details>
  );
}

function RemarksModal({ row, locked, value, onSave, onClose }: { row: PayrollRow; locked: boolean; value: string; onSave: (v: string) => void; onClose: () => void }) {
  const [text, setText] = useState(value);
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title="Remarks"
      description={`${row.name} · printed on the payslip`}
      footer={
        locked ? (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onSave(text.trim());
                onClose();
              }}
              disabled={text.length > 500}
            >
              Done
            </Button>
          </>
        )
      }
    >
      {locked ? (
        <p className="whitespace-pre-line text-sm text-ink">{value.trim() || "No remarks on this payslip."}</p>
      ) : (
        <Textarea
          label="Remarks (optional)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="e.g. Great work on the Diwali campaign. Night shift: 3 nights × ₹500."
          hint={`${text.length}/500 · saved with “Save drafts”.`}
        />
      )}
    </Modal>
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
