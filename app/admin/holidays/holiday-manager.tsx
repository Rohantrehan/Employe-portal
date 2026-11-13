"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarPlus, CalendarX2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/misc";
import { DateChip } from "@/components/holidays/bits";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { HOLIDAY_TYPES, groupByMonth, isSunday, type Holiday, type HolidayType } from "@/lib/holidays";
import { deleteHoliday, saveHoliday } from "./actions";

export function HolidayManager({ holidays, year, today }: { holidays: Holiday[]; year: number; today: string }) {
  const [editing, setEditing] = useState<Holiday | "new" | null>(null);
  const [deleting, setDeleting] = useState<Holiday | null>(null);
  const groups = groupByMonth(holidays);

  return (
    <Card className="h-fit overflow-hidden">
      <CardHeader
        title={`${year} calendar`}
        description={`${holidays.length} holiday${holidays.length === 1 ? "" : "s"}`}
        action={
          <Button size="sm" onClick={() => setEditing("new")}>
            <CalendarPlus className="h-4 w-4" /> Add holiday
          </Button>
        }
      />

      {holidays.length === 0 ? (
        <EmptyState
          icon={<CalendarX2 />}
          title={`No holidays for ${year} yet`}
          description="Add festival and company holidays. Mark some as floating so employees can move them."
          action={<Button onClick={() => setEditing("new")}>Add the first holiday</Button>}
        />
      ) : (
        <div className="divide-y divide-line">
          {groups.map((g) => (
            <section key={g.key} className="px-5 py-4 sm:px-6">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-body">{g.label}</h3>
              <ul className="mt-3 space-y-2">
                {g.items.map((h) => {
                  const past = h.date < today;
                  return (
                    <li key={h.id} className={cn("group flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-soft", past && "opacity-60")}>
                      <DateChip date={h.date} muted={past} tone={h.type === "festival" ? "brand" : "ink"} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">{h.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge tone={HOLIDAY_TYPES[h.type].tone}>{HOLIDAY_TYPES[h.type].label}</Badge>
                          {isSunday(h.date) && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning">
                              <AlertTriangle className="h-3.5 w-3.5" /> Falls on a Sunday
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <IconBtn label={`Edit ${h.name}`} onClick={() => setEditing(h)}>
                          <Pencil className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn label={`Delete ${h.name}`} onClick={() => setDeleting(h)}>
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing && <HolidayForm holiday={editing === "new" ? null : editing} year={year} onClose={() => setEditing(null)} />}
      {deleting && <DeleteHoliday holiday={deleting} onClose={() => setDeleting(null)} />}
    </Card>
  );
}

function HolidayForm({ holiday, year, onClose }: { holiday: Holiday | null; year: number; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(holiday?.date ?? "");
  const [name, setName] = useState(holiday?.name ?? "");
  const [type, setType] = useState<HolidayType>(holiday?.type ?? "festival");
  const [error, setError] = useState<{ msg: string; field?: string } | null>(null);

  const save = () =>
    start(async () => {
      setError(null);
      const res = await saveHoliday(holiday?.id ?? null, { date, name, type });
      if (!res.ok) return setError({ msg: res.error, field: res.field });
      toast.success(holiday ? "Holiday updated" : "Holiday added");
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      title={holiday ? "Edit holiday" : "Add holiday"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} loading={pending} disabled={!date || name.trim().length < 2}>
            {holiday ? "Save" : "Add holiday"}
          </Button>
        </>
      }
    >
      {error && !error.field && <p role="alert" className="mb-4 rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">{error.msg}</p>}
      <div className="space-y-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali" maxLength={120} error={error?.field === "name" ? error.msg : undefined} />
        <Input
          label="Date"
          type="date"
          value={date}
          min={`${year - 1}-01-01`}
          max={`${year + 2}-12-31`}
          onChange={(e) => setDate(e.target.value)}
          error={error?.field === "date" ? error.msg : undefined}
          hint={date ? (isSunday(date) ? "This is a Sunday, which is already a weekly off." : formatDate(date)) : undefined}
        />
        <fieldset>
          <legend className="text-sm font-semibold text-ink">Type</legend>
          <div className="mt-2 grid gap-2">
            {(Object.keys(HOLIDAY_TYPES) as HolidayType[]).map((t) => (
              <label
                key={t}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition-colors",
                  type === t ? "border-brand bg-tint-2" : "border-line hover:bg-soft",
                )}
              >
                <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="mt-1 accent-[#d4000f]" />
                <span>
                  <span className="block text-sm font-bold text-ink">{HOLIDAY_TYPES[t].label}</span>
                  <span className="block text-[13px] text-body">{HOLIDAY_TYPES[t].hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}

function DeleteHoliday({ holiday, onClose }: { holiday: Holiday; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () =>
    start(async () => {
      const res = await deleteHoliday(holiday.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Holiday deleted");
      onClose();
      router.refresh();
    });
  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      title={`Delete ${holiday.name}?`}
      description={`${formatDate(holiday.date)} becomes a normal working day.${holiday.type === "floating" ? " Any swap requests for it are removed too." : ""}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Keep it
          </Button>
          <Button onClick={remove} loading={pending}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </>
      }
    />
  );
}

function IconBtn({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-body transition-colors hover:bg-white hover:text-ink"
      {...props}
    >
      {children}
    </button>
  );
}
