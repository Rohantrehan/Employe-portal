"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { AnswerLink, TickButton } from "@/components/checklist/task-row";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { APPLIES_LABEL, defaultPick, sortTasks, yearsText, type ChecklistItem, type ChecklistKind, type Task } from "@/lib/checklists";
import { addTasks, removeTask, setTaskDoneAdmin } from "./checklist-actions";

export type Milestone = { years: number; status: "posted" | "skipped"; post_url: string | null; created_at: string };

type Props = {
  employeeId: string;
  firstName: string;
  kind: ChecklistKind;
  tasks: Task[];
  items: ChecklistItem[];
  contractCls: "short" | "long" | null;
  /** Why steps can't be added (e.g. admins don't get checklists); null when they can. */
  blocked: string | null;
  linkedin?: { url: string | null; milestones: Milestone[] };
};

export function ChecklistPanel({ employeeId, firstName, kind, tasks, items, contractCls, blocked, linkedin }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const list = sortTasks(tasks);
  const done = list.filter((t) => t.done_at).length;
  const onboarding = kind === "onboarding";

  const toggle = async (t: Task) => {
    setBusy(t.id);
    const r = await setTaskDoneAdmin({ employeeId, id: t.id, done: !t.done_at, answer: "" });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    router.refresh();
  };
  const remove = async (t: Task) => {
    setBusy(t.id);
    const r = await removeTask(employeeId, t.id);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success("Step removed");
    router.refresh();
  };

  const description =
    list.length === 0
      ? onboarding
        ? "Not started yet."
        : "Starts when the exit is recorded."
      : done === list.length
        ? `All ${list.length} steps done.`
        : `${done} of ${list.length} done${onboarding ? "" : ". Experience and relieving letters can be issued once every step is done."}`;

  return (
    <Card>
      <CardHeader
        title={onboarding ? "Onboarding" : "Offboarding"}
        description={description}
        action={
          !blocked && list.length > 0 ? (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" /> Add step
            </Button>
          ) : undefined
        }
      />
      {list.length > 0 && (
        <div className="h-1.5 bg-grey-tile" aria-hidden>
          <div className={cn("h-full transition-all", done === list.length ? "bg-success-dot" : "bg-brand")} style={{ width: `${(done / list.length) * 100}%` }} />
        </div>
      )}

      {list.length === 0 ? (
        <div className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <p className="text-sm text-body">
            {blocked ??
              (onboarding
                ? `Pick the steps for ${firstName}. They see their own steps under Getting started, and you tick the admin ones here.`
                : "No offboarding steps. Add the tools and logins to take back.")}
          </p>
          {!blocked && (
            <Button size="sm" className="shrink-0 whitespace-nowrap" onClick={() => setAdding(true)}>
              <ListChecks className="h-3.5 w-3.5" /> {onboarding ? "Start onboarding" : "Add steps"}
            </Button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((t) => (
            <li key={t.id} className="flex items-start gap-3 px-5 py-3.5 sm:px-6">
              <TickButton done={!!t.done_at} busy={busy === t.id} onClick={() => toggle(t)} label={t.done_at ? `Mark "${t.title}" as not done` : `Mark "${t.title}" as done`} />
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-semibold", t.done_at ? "text-body line-through decoration-line" : "text-ink")}>{t.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-body">
                  {onboarding && <Badge tone={t.owner === "admin" ? "dark" : "info"}>{t.owner === "admin" ? "You do this" : `${firstName} does this`}</Badge>}
                  {t.done_at && <span>Done {formatDate(t.done_at)}</span>}
                  {t.answer && <AnswerLink url={t.answer} />}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(t)}
                disabled={busy === t.id}
                aria-label={`Remove "${t.title}"`}
                className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full text-body transition hover:bg-app hover:text-brand"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {linkedin && (linkedin.url || linkedin.milestones.length > 0) && (
        <div className="border-t border-line px-5 py-4 text-sm sm:px-6">
          <p className="text-[11px] font-bold uppercase tracking-wider text-body">LinkedIn</p>
          <p className="mt-2 text-ink">{linkedin.url ? <AnswerLink url={linkedin.url} /> : <span className="text-body">No profile link yet.</span>}</p>
          {linkedin.milestones.length > 0 && (
            <ul className="mt-2 space-y-1">
              {linkedin.milestones.map((m) => (
                <li key={m.years} className="flex flex-wrap items-center gap-2 text-body">
                  <span className="font-semibold text-ink">{yearsText(m.years)}:</span>
                  {m.status === "posted" ? <Badge tone="success">Posted</Badge> : <Badge>Didn&apos;t post</Badge>}
                  {m.post_url && <AnswerLink url={m.post_url} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {adding && (
        <AddStepsModal
          employeeId={employeeId}
          kind={kind}
          items={items.filter((i) => !list.some((t) => t.item_id === i.id))}
          preselect={list.length === 0 ? defaultPick(items, contractCls) : []}
          contractCls={contractCls}
          starting={list.length === 0}
          onClose={() => setAdding(false)}
        />
      )}
    </Card>
  );
}

function AddStepsModal({
  employeeId,
  kind,
  items,
  preselect,
  contractCls,
  starting,
  onClose,
}: {
  employeeId: string;
  kind: ChecklistKind;
  items: ChecklistItem[];
  preselect: string[];
  contractCls: "short" | "long" | null;
  starting: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(preselect);
  const [custom, setCustom] = useState("");
  const [pending, start] = useTransition();
  const sorted = useMemo(() => sortTasks(items), [items]);
  const flip = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = () =>
    start(async () => {
      const r = await addTasks({ employeeId, kind, items: picked, custom });
      if (!r.ok) return void toast.error(r.error);
      toast.success(starting && kind === "onboarding" ? "Onboarding started" : "Steps added");
      onClose();
      router.refresh();
    });

  const count = picked.length + (custom.trim() ? 1 : 0);
  return (
    <Modal
      open
      onClose={onClose}
      title={starting && kind === "onboarding" ? "Start onboarding" : "Add steps"}
      description={
        starting && kind === "onboarding"
          ? contractCls
            ? `Ticked: the steps for everyone, plus the ones for a ${contractCls === "short" ? "contract of up to 4 months" : "contract over 4 months"}.`
            : "No contract yet, so contract-based steps (like the Discord server) aren't ticked. Pick the right one."
          : "Pick from the company list, or add a one-off step."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={pending} disabled={count === 0}>
            {starting && kind === "onboarding" ? `Start with ${count} step${count === 1 ? "" : "s"}` : `Add ${count || ""} step${count === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      {sorted.length > 0 ? (
        <ul className="space-y-2">
          {sorted.map((i) => {
            const on = picked.includes(i.id);
            return (
              <li key={i.id}>
                <label className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition", on ? "border-brand bg-tint-2" : "border-line hover:border-body/40")}>
                  <input type="checkbox" checked={on} onChange={() => flip(i.id)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{i.title}</span>
                    <span className="block text-[13px] text-body">
                      {i.owner === "admin" ? "You do this" : "Employee does this"} · {APPLIES_LABEL[i.applies]}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-body">Every step from the company list is already added.</p>
      )}
      <Input
        wrapperClassName="mt-5"
        label="One-off step (optional)"
        placeholder="e.g. Return the office laptop"
        value={custom}
        maxLength={120}
        onChange={(e) => setCustom(e.target.value)}
        hint="Only for this person. You tick it."
      />
    </Modal>
  );
}
