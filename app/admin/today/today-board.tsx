"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Coffee, Pencil, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { TaskChecklist } from "@/components/attendance/task-checklist";
import { dayBadge, formatDuration, formatTime, minutesSince, shiftText, toTimeInput } from "@/lib/attendance";
import { formatDate } from "@/lib/format";
import { saveAttendance } from "./actions";
import type { TeamRow } from "./page";

type Filter = "all" | "working" | "done" | "away" | "missing";

function bucket(r: TeamRow): Exclude<Filter, "all"> {
  if (r.clock_in && !r.clock_out && r.status !== "missed_clock_out") return "working";
  if (r.clock_in) return "done";
  if (r.day_kind === "working" || r.day_kind === "half_leave") return "missing";
  return "away";
}

export function TodayBoard({ rows, date, isToday, weeklyOff }: { rows: TeamRow[]; date: string; isToday: boolean; weeklyOff: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<TeamRow | null>(null);

  // Live board: refresh every minute while viewing today.
  useEffect(() => {
    if (!isToday) return;
    const t = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(t);
  }, [isToday, router]);

  const counts = useMemo(() => {
    const c = { all: rows.length, working: 0, done: 0, away: 0, missing: 0 };
    rows.forEach((r) => c[bucket(r)]++);
    return c;
  }, [rows]);

  const shown = rows.filter((r) => {
    if (filter !== "all" && bucket(r) !== filter) return false;
    const n = q.trim().toLowerCase();
    return !n || [r.full_name, r.emp_code, r.designation ?? "", r.department ?? ""].some((v) => v.toLowerCase().includes(n));
  });

  if (!rows.length) {
    return (
      <Card>
        <EmptyState
          icon={<Users />}
          title="No employees yet"
          description="Add employees to see who is working each day."
          action={
            <Link href="/admin/employees/new" className="btn-primary">
              Add employee
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <>
      {weeklyOff && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-info-tint px-4 py-3 text-sm font-medium text-info">
          <Coffee className="h-4 w-4" /> Weekly off. The office is closed on {formatDate(date)}.
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          items={[
            { value: "all", label: "All", count: counts.all },
            { value: "working", label: isToday ? "Working" : "Open", count: counts.working },
            { value: "done", label: "Clocked out", count: counts.done },
            { value: "away", label: "Away", count: counts.away },
            { value: "missing", label: isToday ? "Not in" : "Absent", count: counts.missing },
          ]}
        />
        <label className="relative block">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-body" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people"
            className="h-10 w-full rounded-full border border-line bg-white pl-10 pr-4 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-tint sm:w-60"
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <Card className="mt-4">
          <EmptyState icon={<Users />} title="Nobody here" description="No one matches this filter." />
        </Card>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((r) => (
            <PersonCard key={r.employee_id} r={r} isToday={isToday} onEdit={() => setEditing(r)} />
          ))}
        </div>
      )}

      {editing && <EditAttendanceModal row={editing} date={date} onClose={() => setEditing(null)} />}
    </>
  );
}

function PersonCard({ r, isToday, onEdit }: { r: TeamRow; isToday: boolean; onEdit: () => void }) {
  const b = dayBadge(r, isToday);
  const open = r.clock_in && !r.clock_out && r.status !== "missed_clock_out";
  const planned = r.tasks.filter((t) => t.planned);
  const canEdit = r.clock_in || r.day_kind === "working" || r.day_kind === "half_leave";

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <Avatar name={r.full_name} src={r.avatar_url} size={40} />
        <div className="min-w-0 flex-1">
          <Link href={`/admin/employees/${r.employee_id}`} className="block truncate font-bold text-ink hover:text-brand">
            {r.full_name}
          </Link>
          <p className="truncate text-[13px] text-body">{r.designation ?? r.department ?? r.emp_code}</p>
          <p className="truncate text-[12px] tabular-nums text-body/80">
            {r.day_kind === "untracked" ? "Attendance not tracked" : `Hours ${shiftText(r.shift_start, r.shift_end, true)}`}
          </p>
        </div>
        <Badge tone={b.tone} dot={!!open}>
          {b.label}
        </Badge>
      </div>

      {r.clock_in ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-soft px-4 py-2.5 text-sm">
            <span>
              <span className="text-body">In </span>
              <b className="tabular-nums text-ink">{formatTime(r.clock_in)}</b>
            </span>
            <span>
              <span className="text-body">Out </span>
              <b className="tabular-nums text-ink">{r.clock_out ? formatTime(r.clock_out) : "—"}</b>
            </span>
            <span className="ml-auto font-semibold text-ink">{formatDuration(open ? minutesSince(r.clock_in) : r.worked_minutes)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {r.is_late && r.status !== "late" && <Badge tone="warning">Late</Badge>}
            {r.early_leave && <Badge tone="warning">Left early</Badge>}
            {r.day_kind === "half_leave" && <Badge tone="info">{r.day_label}</Badge>}
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-body">
              {r.clock_out ? `Tasks · ${planned.filter((t) => t.done).length}/${planned.length} planned done` : "Plan for today"}
            </p>
            <TaskChecklist tasks={r.clock_out ? r.tasks : planned} showStatus={!!r.clock_out} className="mt-2" />
          </div>
          {r.summary && <p className="mt-3 line-clamp-4 whitespace-pre-line border-t border-line pt-3 text-sm text-body">{r.summary}</p>}
          {r.admin_note && <p className="mt-2 text-[13px] text-body"><b className="text-ink">Note:</b> {r.admin_note}</p>}
        </>
      ) : (
        <p className="mt-4 text-sm text-body">
          {r.day_kind === "untracked"
            ? "No clock-in needed."
            : r.day_kind === "working" || r.day_kind === "half_leave"
            ? isToday
              ? "Hasn't clocked in yet."
              : "No attendance recorded."
            : r.day_kind === "weekly_off"
              ? "Weekly off."
              : r.day_label ?? "Away."}
        </p>
      )}

      {canEdit && (
        <div className="mt-auto pt-4">
          <Button variant="ghost" size="sm" className="-ml-3" onClick={onEdit}>
            {r.clock_in ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {r.clock_in ? "Edit times" : "Add attendance"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function EditAttendanceModal({ row, date, onClose }: { row: TeamRow; date: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [clockIn, setClockIn] = useState(toTimeInput(row.clock_in) || row.shift_start || "09:00");
  const [clockOut, setClockOut] = useState(toTimeInput(row.clock_out));
  const [note, setNote] = useState(row.admin_note ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = () =>
    start(async () => {
      setError(null);
      const res = await saveAttendance({ employeeId: row.employee_id, attendanceId: row.attendance_id, date, clockIn, clockOut, note });
      if (!res.ok) return setError(res.error);
      toast.success("Attendance saved");
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      title={row.clock_in ? "Edit attendance" : "Add attendance"}
      description={`${row.full_name} · ${formatDate(date)}. Times are IST. Late and half-day are recalculated.`}
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Clock in" type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} required />
        <Input label="Clock out" type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} hint={row.overnight ? "Night shift: a time earlier than clock-in means the next morning. Leave empty if still working." : "Leave empty if still working."} />
      </div>
      <Textarea
        wrapperClassName="mt-4"
        label="Admin note"
        rows={2}
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Forgot to clock out, confirmed left at 17:05"
        hint="The employee can see this note."
      />
    </Modal>
  );
}
