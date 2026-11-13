"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Inbox, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/misc";
import { formatDate } from "@/lib/format";
import { SWAP_STATUS, weekday, type SwapStatus } from "@/lib/holidays";
import { reviewSwap } from "./actions";

export type SwapRow = {
  id: string;
  employee: string;
  empCode: string;
  holidayName: string;
  holidayDate: string;
  newDate: string;
  reason: string | null;
  status: SwapStatus;
  reviewNote: string | null;
  createdAt: string;
};

export function SwapQueue({ rows, today }: { rows: SwapRow[]; today: string }) {
  const [rejecting, setRejecting] = useState<SwapRow | null>(null);
  const pending = rows.filter((r) => r.status === "pending");
  const history = rows.filter((r) => r.status !== "pending").slice(0, 15);

  return (
    <Card className="h-fit overflow-hidden">
      <CardHeader title="Floating swap requests" description="Employees moving a floating holiday to another day." />
      {pending.length === 0 ? (
        <EmptyState icon={<Inbox />} title="All caught up" description="New requests will appear here." className="py-8" />
      ) : (
        <ul className="divide-y divide-line">
          {pending.map((r) => (
            <PendingItem key={r.id} r={r} today={today} onReject={() => setRejecting(r)} />
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <div className="border-t border-line bg-soft px-5 py-4 sm:px-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-body">Recent decisions</p>
          <ul className="mt-3 space-y-3">
            {history.map((r) => (
              <li key={r.id} className="text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-ink">
                    <b>{r.employee}</b> · {r.holidayName}
                    <span className="block text-[13px] text-body">
                      {formatDate(r.holidayDate)} → {formatDate(r.newDate)}
                    </span>
                  </p>
                  <Badge tone={SWAP_STATUS[r.status].tone}>{SWAP_STATUS[r.status].label}</Badge>
                </div>
                {r.reviewNote && <p className="mt-1 text-[13px] text-body">“{r.reviewNote}”</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rejecting && <RejectModal row={rejecting} onClose={() => setRejecting(null)} />}
    </Card>
  );
}

function PendingItem({ r, today, onReject }: { r: SwapRow; today: string; onReject: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const expired = r.holidayDate < today;

  const approve = () =>
    start(async () => {
      const res = await reviewSwap(r.id, true, "");
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Approved. ${r.employee} gets ${formatDate(r.newDate)} off.`);
      router.refresh();
    });

  return (
    <li className="px-5 py-4 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-ink">{r.employee}</p>
          <p className="text-[13px] text-body">
            {r.empCode} · asked {formatDate(r.createdAt)}
          </p>
        </div>
        <Badge tone="warning" dot>
          Pending
        </Badge>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-soft px-3 py-2.5 text-sm">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{r.holidayName}</p>
          <p className="text-[13px] text-body">
            {weekday(r.holidayDate)}, {formatDate(r.holidayDate)}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-brand" />
        <div className="min-w-0 flex-1 text-right">
          <p className="font-semibold text-ink">Day off on</p>
          <p className="text-[13px] text-body">
            {weekday(r.newDate)}, {formatDate(r.newDate)}
          </p>
        </div>
      </div>
      {r.reason && <p className="mt-2 text-sm text-body">“{r.reason}”</p>}
      {expired && <p className="mt-2 text-[13px] font-semibold text-warning">The holiday has passed, so this can only be rejected.</p>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={approve} loading={pending} disabled={expired}>
          <Check className="h-4 w-4" /> Approve
        </Button>
        <Button size="sm" variant="secondary" onClick={onReject} disabled={pending}>
          <X className="h-4 w-4" /> Reject
        </Button>
      </div>
    </li>
  );
}

function RejectModal({ row, onClose }: { row: SwapRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reject = () =>
    start(async () => {
      setError(null);
      const res = await reviewSwap(row.id, false, note);
      if (!res.ok) return setError(res.error);
      toast.success("Request rejected");
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      title="Reject swap request?"
      description={`${row.employee} wanted ${formatDate(row.newDate)} off instead of ${row.holidayName}. They keep the original holiday.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={reject} loading={pending} disabled={note.trim().length < 2}>
            Reject
          </Button>
        </>
      }
    >
      {error && <p role="alert" className="mb-4 rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">{error}</p>}
      <Textarea label="Reason" rows={3} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Client deadline that week" hint="The employee sees this." />
    </Modal>
  );
}
