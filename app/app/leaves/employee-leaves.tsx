"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarPlus, FileText, Info, Paperclip, Plane, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { LEAVE_STATUS, formatDays, formatRange, remaining, total, type Balance, type DayPart, type LeaveStatus, type LeaveType } from "@/lib/leave";
import { applyLeave, cancelLeave, myAttachmentUrl, previewLeave, type Preview } from "./actions";

export type MyRequest = {
  id: string;
  typeId: string;
  start: string;
  end: string;
  part: DayPart;
  days: number;
  reason: string;
  attachment: string | null;
  status: LeaveStatus;
  reviewNote: string | null;
};

export function EmployeeLeaves({
  header,
  types,
  balances,
  requests,
  today,
  year,
  userId,
}: {
  header: React.ReactNode;
  types: LeaveType[];
  balances: Balance[];
  requests: MyRequest[];
  today: string;
  year: number;
  userId: string;
}) {
  const [applying, setApplying] = useState(false);
  const typeById = useMemo(() => Object.fromEntries(types.map((t) => [t.id, t])), [types]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        {header}
        <Button size="lg" onClick={() => setApplying(true)}>
          <CalendarPlus className="h-4 w-4" /> Apply for leave
        </Button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {types.map((t) => (
          <BalanceCard key={t.id} type={t} balance={balances.find((b) => b.leave_type_id === t.id)} requests={requests} year={year} />
        ))}
      </div>

      <MyRequests requests={requests} typeById={typeById} today={today} />

      {applying && <ApplyModal types={types} balances={balances} today={today} userId={userId} onClose={() => setApplying(false)} />}
    </>
  );
}

/* ------------------------------------------------------------------ */

function Ring({ value, max, color }: { value: number; max: number; color: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden>
      <circle cx="32" cy="32" r={r} fill="none" stroke="#f3f4f6" strokeWidth="7" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
    </svg>
  );
}

function BalanceCard({ type, balance, requests, year }: { type: LeaveType; balance?: Balance; requests: MyRequest[]; year: number }) {
  if (!type.tracks_balance) {
    const used = requests
      .filter((r) => r.typeId === type.id && r.status === "approved" && r.start.startsWith(String(year)))
      .reduce((s, r) => s + r.days, 0);
    return (
      <div className="card p-5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-body">{type.name}</p>
        <p className="mt-2 text-[30px] font-extrabold leading-none tracking-[-0.03em] text-ink">No limit</p>
        <p className="mt-2 text-[13px] text-body">{formatDays(used)} taken in {year}{!type.is_paid && " · not paid"}</p>
      </div>
    );
  }
  const left = balance ? remaining(balance) : 0;
  const tot = balance ? total(balance) : 0;
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className="relative shrink-0">
        <Ring value={left} max={tot} color={type.color} />
        <span className="absolute inset-0 grid place-items-center text-sm font-extrabold text-ink">{Number.isInteger(left) ? left : left.toFixed(1)}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-body">{type.name}</p>
        <p className="mt-1 text-lg font-extrabold tracking-[-0.02em] text-ink">
          {Number.isInteger(left) ? left : left.toFixed(1)} <span className="text-sm font-semibold text-body">of {tot} left</span>
        </p>
        <p className="text-[13px] text-body">
          {Number(balance?.used ?? 0)} used{Number(balance?.pending ?? 0) > 0 && ` · ${Number(balance?.pending)} pending`}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MyRequests({ requests, typeById, today }: { requests: MyRequest[]; typeById: Record<string, LeaveType>; today: string }) {
  const router = useRouter();
  const [tab, setTab] = useState("upcoming");
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<MyRequest | null>(null);

  const upcoming = requests.filter((r) => (r.status === "pending" || r.status === "approved") && r.end >= today);
  const shown = tab === "upcoming" ? [...upcoming].sort((a, b) => a.start.localeCompare(b.start)) : requests;

  const openFile = (path: string) =>
    start(async () => {
      const res = await myAttachmentUrl(path);
      if (!res.ok) return void toast.error(res.error);
      window.open(res.url, "_blank", "noopener");
    });

  const cancel = (r: MyRequest) =>
    start(async () => {
      const res = await cancelLeave(r.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Leave cancelled. The days are back in your balance.");
      setConfirm(null);
      router.refresh();
    });

  return (
    <Card className="mt-6 overflow-hidden">
      <CardHeader
        title="My requests"
        action={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: "upcoming", label: "Upcoming", count: upcoming.length },
              { value: "all", label: "All", count: requests.length },
            ]}
          />
        }
      />
      {shown.length === 0 ? (
        <EmptyState icon={<Plane />} title={tab === "upcoming" ? "No upcoming leave" : "No requests yet"} description="Use “Apply for leave” to request time off." />
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((r) => {
            const t = typeById[r.typeId];
            const canCancel = r.status === "pending" || (r.status === "approved" && r.start > today);
            return (
              <li key={r.id} className="flex flex-wrap items-start gap-4 px-5 py-4 sm:px-6">
                <span className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ background: t?.color ?? "#6b7280" }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-ink">{t?.name ?? "Leave"}</p>
                    <Badge tone={LEAVE_STATUS[r.status].tone} dot={r.status === "pending"}>
                      {LEAVE_STATUS[r.status].label}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-ink">
                    {formatRange(r.start, r.end, r.part)} · <b>{formatDays(r.days)}</b>
                  </p>
                  <p className="mt-1 text-[13px] text-body">{r.reason}</p>
                  {r.reviewNote && <p className="mt-1 text-[13px] text-body">Admin: “{r.reviewNote}”</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {r.attachment && (
                    <Button size="sm" variant="ghost" onClick={() => openFile(r.attachment!)} disabled={pending}>
                      <FileText className="h-3.5 w-3.5" /> File
                    </Button>
                  )}
                  {canCancel && (
                    <Button size="sm" variant="secondary" onClick={() => setConfirm(r)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {confirm && (
        <Modal
          open
          onClose={() => !pending && setConfirm(null)}
          title="Cancel this leave?"
          description={`${typeById[confirm.typeId]?.name ?? "Leave"}, ${formatRange(confirm.start, confirm.end, confirm.part)}. ${formatDays(confirm.days)} go back to your balance.`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)} disabled={pending}>
                Keep it
              </Button>
              <Button onClick={() => cancel(confirm)} loading={pending}>
                Cancel leave
              </Button>
            </>
          }
        />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

function ApplyModal({
  types,
  balances,
  today,
  userId,
  onClose,
}: {
  types: LeaveType[];
  balances: Balance[];
  today: string;
  userId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [mode, setMode] = useState<"full" | "half">("full");
  const [half, setHalf] = useState<"first_half" | "second_half">("first_half");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const type = types.find((t) => t.id === typeId);
  const part: DayPart = mode === "full" ? "full" : half;
  const effEnd = mode === "half" ? start : end || start;
  const minDate = `${Number(today.slice(0, 4)) - 1}-12-01`;

  // Live preview (debounced)
  useEffect(() => {
    if (!typeId || !start || !effEnd) {
      setPreview(null);
      return;
    }
    let stale = false;
    setChecking(true);
    const t = setTimeout(async () => {
      const res = await previewLeave({ typeId, start, end: effEnd, part });
      if (stale) return;
      setChecking(false);
      setPreview("days" in res ? res : { days: 0, tracks_balance: false, available: null, excluded: [], error: res.error });
    }, 350);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [typeId, start, effEnd, part]);

  const pickFile = (f: File | null) => {
    setError(null);
    if (f && f.size > MAX_BYTES) return setError("The file is larger than 5 MB.");
    if (f && !ACCEPT.split(",").includes(f.type)) return setError("Attach a PDF, JPG, PNG or WebP file.");
    setFile(f);
  };

  const submit = () =>
    startTransition(async () => {
      setError(null);
      let path: string | null = null;
      // Loaded on demand so the page itself stays light.
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
        path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("leave-attachments").upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) return setError("Could not upload the file. Please try again.");
      }
      const res = await applyLeave({ typeId, start, end: effEnd, part, reason, attachmentPath: path });
      if (!res.ok) {
        if (path) await supabase.storage.from("leave-attachments").remove([path]);
        return setError(res.error);
      }
      toast.success("Leave request sent to your admin");
      onClose();
      router.refresh();
    });

  const leftFor = (id: string) => {
    const b = balances.find((x) => x.leave_type_id === id);
    return b ? remaining(b) : 0;
  };
  const canSubmit = !!preview && !preview.error && preview.days > 0 && reason.trim().length >= 3 && (!type?.requires_attachment || !!file) && !checking;

  return (
    <Modal
      open
      size="lg"
      onClose={() => !pending && onClose()}
      title="Apply for leave"
      description="Sundays and company holidays inside your dates are not counted."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending} disabled={!canSubmit}>
            Send request{preview?.days ? ` · ${formatDays(preview.days)}` : ""}
          </Button>
        </>
      }
    >
      {error && (
        <div role="alert" className="animate-pop mb-4 flex items-start gap-2.5 rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Leave type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.tracks_balance ? ` (${leftFor(t.id)} left)` : " (no limit)"}
            </option>
          ))}
        </Select>
        <div>
          <span className="text-sm font-semibold text-ink">Duration</span>
          <div className="mt-2 grid h-12 grid-cols-2 gap-1 rounded-2xl border border-line bg-soft p-1">
            {(["full", "half"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={cn(
                  "cursor-pointer rounded-xl text-sm font-semibold transition-colors",
                  mode === m ? "bg-white text-ink shadow-[0_2px_8px_-4px_rgba(17,24,39,.25)]" : "text-body hover:text-ink",
                )}
              >
                {m === "full" ? "Full day(s)" : "Half day"}
              </button>
            ))}
          </div>
        </div>

        {mode === "full" ? (
          <>
            <Input
              label="From"
              type="date"
              value={start}
              min={minDate}
              onChange={(e) => {
                setStart(e.target.value);
                if (!end || end < e.target.value) setEnd(e.target.value);
              }}
            />
            <Input label="To" type="date" value={end} min={start || minDate} onChange={(e) => setEnd(e.target.value)} />
          </>
        ) : (
          <>
            <Input label="Date" type="date" value={start} min={minDate} onChange={(e) => setStart(e.target.value)} />
            <Select label="Which half" value={half} onChange={(e) => setHalf(e.target.value as typeof half)}>
              <option value="first_half">First half (morning)</option>
              <option value="second_half">Second half (afternoon)</option>
            </Select>
          </>
        )}
      </div>

      {/* Live preview */}
      {start && (
        <div className={cn("mt-4 rounded-2xl px-4 py-3 text-sm", preview?.error ? "bg-tint-2 text-brand" : "bg-soft text-ink")} aria-live="polite">
          {checking || !preview ? (
            <span className="text-body">Checking dates…</span>
          ) : preview.error ? (
            <span className="flex items-start gap-2 font-medium">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {preview.error}
            </span>
          ) : (
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-body" />
              <div>
                <p>
                  This uses <b>{formatDays(preview.days)}</b> of {type?.name}.
                  {preview.tracks_balance && preview.available != null && (
                    <> You&apos;ll have <b>{Math.max(0, Number(preview.available) - preview.days)}</b> left.</>
                  )}
                </p>
                {preview.excluded.length > 0 && (
                  <p className="mt-1 text-[13px] text-body">
                    Not counted: {preview.excluded.map((e) => `${formatDate(e.date).slice(0, 6)} (${e.label})`).join(", ")}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <Textarea wrapperClassName="mt-4" label="Reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family wedding in Jaipur" />

      <div className="mt-4">
        <span className="text-sm font-semibold text-ink">
          Supporting document {type?.requires_attachment ? <span className="text-brand">(required)</span> : <span className="font-normal text-body">(optional)</span>}
        </span>
        <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
        {file ? (
          <div className="mt-2 flex items-center gap-3 rounded-2xl border border-line px-4 py-3">
            <Paperclip className="h-4 w-4 shrink-0 text-body" />
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{file.name}</span>
            <span className="text-xs text-body">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
            <button type="button" onClick={() => pickFile(null)} aria-label="Remove file" className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-body hover:bg-app hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-4 py-4 text-sm font-semibold text-body transition-colors hover:border-brand hover:bg-tint-2 hover:text-brand"
          >
            <Paperclip className="h-4 w-4" /> Attach a PDF or photo (max 5 MB)
          </button>
        )}
      </div>
    </Modal>
  );
}
