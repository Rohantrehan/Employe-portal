"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Avatar } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { formatDate } from "@/lib/format";
import { archiveVaultItem, grantAccess, revokeAccess } from "../actions";

export type Holder = { id: string; name: string; avatar: string | null; designation: string | null; since: string };

export function People({ itemId, holders, candidates }: { itemId: string; holders: Holder[]; candidates: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const give = async () => {
    setBusy("add");
    const r = await grantAccess(itemId, pick);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success("Access given");
    setPick("");
    router.refresh();
  };
  const take = async (h: Holder) => {
    setBusy(h.id);
    const r = await revokeAccess(itemId, h.id);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Removed ${h.name.split(" ")[0]}`);
    router.refresh();
  };

  return (
    <Card>
      <CardHeader title="People with access" description={holders.length ? `${holders.length} ${holders.length === 1 ? "person" : "people"}. Admins can always open it.` : "No one yet. Admins can always open it."} />
      {holders.length > 0 && (
        <ul className="divide-y divide-line">
          {holders.map((h) => (
            <li key={h.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
              <Avatar name={h.name} src={h.avatar} size={34} />
              <Link href={`/admin/employees/${h.id}`} className="min-w-0 flex-1 hover:underline">
                <p className="truncate text-sm font-semibold text-ink">{h.name}</p>
                <p className="truncate text-[12px] text-body">since {formatDate(h.since)}</p>
              </Link>
              <button
                type="button"
                onClick={() => take(h)}
                disabled={busy === h.id}
                aria-label={`Remove ${h.name}`}
                title="Remove access"
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-body transition hover:bg-app hover:text-brand"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-line p-5 sm:p-6">
        {candidates.length ? (
          <div className="flex items-end gap-2">
            <Select wrapperClassName="min-w-0 flex-1" label="Give access to" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Pick an employee</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Button onClick={give} disabled={!pick} loading={busy === "add"} className="!h-12">
              <UserPlus className="h-4 w-4" /> Add
            </Button>
          </div>
        ) : (
          <p className="text-sm text-body">Every active employee already has this account.</p>
        )}
      </div>
    </Card>
  );
}

export function ArchiveButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
        <Trash2 className="h-3.5 w-3.5" /> Remove
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={`Remove ${name}?`}
        description="Everyone loses access and the saved password is no longer shown. The activity log is kept."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const r = await archiveVaultItem(id);
                  if (!r.ok) return void toast.error(r.error);
                  toast.success("Account removed");
                  router.push("/admin/access");
                })
              }
            >
              Remove
            </Button>
          </>
        }
      />
    </>
  );
}
