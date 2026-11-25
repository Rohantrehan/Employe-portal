"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { APPLIES_LABEL, sortTasks, type Applies, type ChecklistItem, type ChecklistKind, type Owner } from "@/lib/checklists";
import { deleteChecklistItem, moveChecklistItem, saveChecklistItem } from "./checklist-actions";

export function ChecklistSettings({ items }: { items: ChecklistItem[] }) {
  return (
    <section id="checklists" className="mt-10 scroll-mt-24">
      <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink">Checklists</h2>
      <p className="mt-1 text-sm text-body">
        The steps new people get when you start their onboarding, and the steps that open when you record someone&apos;s exit. Changing a step here
        doesn&apos;t change lists that already started.
      </p>
      <div className="mt-5 grid items-start gap-6 lg:grid-cols-2">
        <KindCard kind="onboarding" items={items.filter((i) => i.kind === "onboarding")} />
        <KindCard kind="offboarding" items={items.filter((i) => i.kind === "offboarding")} />
      </div>
    </section>
  );
}

function KindCard({ kind, items }: { kind: ChecklistKind; items: ChecklistItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ChecklistItem | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const list = sortTasks(items);

  const run = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) => {
    setBusy(id);
    const r = await fn();
    setBusy(null);
    if (!r.ok) return toast.error(r.error ?? "Something went wrong.");
    if (done) toast.success(done);
    router.refresh();
  };

  return (
    <Card>
      <CardHeader
        title={kind === "onboarding" ? "Onboarding steps" : "Offboarding steps"}
        description={kind === "onboarding" ? "Set up tools and accounts for someone new." : "Take back tools and logins. Letters wait until these are done."}
        action={
          <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        }
      />
      {list.length === 0 ? (
        <p className="p-6 text-sm text-body">No steps yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((i, idx) => (
            <li key={i.id} className="flex items-start gap-3 px-5 py-3.5 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{i.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-body">
                  {kind === "onboarding" && <Badge tone={i.owner === "admin" ? "dark" : "info"}>{i.owner === "admin" ? "Admin" : "Employee"}</Badge>}
                  <Badge tone={i.applies === "all" ? "neutral" : "warning"}>{APPLIES_LABEL[i.applies]}</Badge>
                  {i.link_url ? (
                    <a href={i.link_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-info hover:underline">
                      {i.link_label ?? "Link"} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    i.link_label && <Badge tone="brand">Link missing</Badge>
                  )}
                  {i.ask_link && <span>· asks for a link</span>}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                <IconButton label="Move up" disabled={idx === 0 || busy === i.id} onClick={() => run(i.id, () => moveChecklistItem(i.id, -1))}>
                  <ArrowUp className="h-4 w-4" />
                </IconButton>
                <IconButton label="Move down" disabled={idx === list.length - 1 || busy === i.id} onClick={() => run(i.id, () => moveChecklistItem(i.id, 1))}>
                  <ArrowDown className="h-4 w-4" />
                </IconButton>
                <IconButton label={`Edit "${i.title}"`} onClick={() => setEditing(i)}>
                  <Pencil className="h-4 w-4" />
                </IconButton>
                {!i.key && (
                  <IconButton label={`Remove "${i.title}"`} danger disabled={busy === i.id} onClick={() => run(i.id, () => deleteChecklistItem(i.id), "Step removed")}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <ItemModal kind={kind} item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function IconButton({ label, danger, disabled, onClick, children }: { label: string; danger?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-8 w-8 cursor-pointer place-items-center rounded-full text-body transition hover:bg-app disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent ${danger ? "hover:text-brand" : "hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function ItemModal({ kind, item, onClose }: { kind: ChecklistKind; item: ChecklistItem | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState({
    title: item?.title ?? "",
    details: item?.details ?? "",
    link_url: item?.link_url ?? "",
    link_label: item?.link_label ?? "",
    owner: (item?.owner ?? (kind === "offboarding" ? "admin" : "employee")) as Owner,
    ask_link: item?.ask_link ?? "",
    applies: (item?.applies ?? "all") as Applies,
  });
  const builtIn = item?.key === "linkedin";
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));

  const save = () =>
    start(async () => {
      const r = await saveChecklistItem({ id: item?.id ?? null, kind, ...v, ask_link: v.owner === "employee" ? v.ask_link : "" });
      if (!r.ok) return void toast.error(r.error);
      toast.success(item ? "Step saved" : "Step added");
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? "Edit step" : kind === "onboarding" ? "New onboarding step" : "New offboarding step"}
      description={builtIn ? "Built-in step: the profile link people paste here is saved on their profile." : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={pending}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Step" value={v.title} maxLength={120} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Install Parsec" />
        <Textarea label="Details (optional)" rows={2} value={v.details} maxLength={600} onChange={(e) => set("details", e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_150px]">
          <Input
            label="Link (optional)"
            value={v.link_url}
            maxLength={500}
            placeholder="https://"
            onChange={(e) => set("link_url", e.target.value)}
            hint={kind === "onboarding" ? "Download page, invite link or sign-up page." : undefined}
          />
          <Input label="Button text" value={v.link_label} maxLength={40} placeholder="Open" onChange={(e) => set("link_label", e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {kind === "onboarding" && (
            <Select label="Who does it" value={v.owner} disabled={builtIn} onChange={(e) => set("owner", e.target.value as Owner)}>
              <option value="employee">The employee</option>
              <option value="admin">An admin</option>
            </Select>
          )}
          <Select label="Ticked by default for" value={v.applies} onChange={(e) => set("applies", e.target.value as Applies)}>
            {(Object.keys(APPLIES_LABEL) as Applies[]).map((a) => (
              <option key={a} value={a}>{APPLIES_LABEL[a]}</option>
            ))}
          </Select>
        </div>
        {kind === "onboarding" && v.owner === "employee" && (
          <Input
            label={builtIn ? "Ask for" : "Ask them to paste a link (optional)"}
            value={v.ask_link}
            maxLength={80}
            placeholder="e.g. Your portfolio link"
            onChange={(e) => set("ask_link", e.target.value)}
            hint="Leave empty if they only need to tick it."
          />
        )}
      </div>
    </Modal>
  );
}
