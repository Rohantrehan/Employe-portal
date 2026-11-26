"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, PasswordInput, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { saveVaultItem } from "./actions";

export type ItemDefaults = { id: string; name: string; url: string | null; username: string | null; hasNotes: boolean; hasCode: boolean };

export function ItemButton({ item, disabled }: { item?: ItemDefaults; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={item ? "sm" : "md"} variant={item ? "secondary" : "primary"} disabled={disabled} onClick={() => setOpen(true)}>
        {item ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-4 w-4" />} {item ? "Edit" : "Add account"}
      </Button>
      {open && <ItemModal item={item} onClose={() => setOpen(false)} />}
    </>
  );
}

function ItemModal({ item, onClose }: { item?: ItemDefaults; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState({
    name: item?.name ?? "",
    url: item?.url ?? "",
    username: item?.username ?? "",
    password: "",
    notes: "",
    clearNotes: false,
    totp: "",
    clearTotp: false,
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));

  const save = () =>
    start(async () => {
      const r = await saveVaultItem({ id: item?.id ?? null, ...v });
      if (!r.ok) return void toast.error(r.error);
      toast.success(item ? (v.password ? "Saved. The password-change reminder is cleared." : "Saved") : "Account added");
      onClose();
      if (item) router.refresh();
      else router.push(`/admin/access/${r.data!.id}`);
    });

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? `Edit ${item.name}` : "Add a shared account"}
      description="The password, notes and authenticator key are encrypted before they're saved."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={pending}>{item ? "Save" : "Add account"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Account" value={v.name} maxLength={80} placeholder="e.g. ChatGPT Team" onChange={(e) => set("name", e.target.value)} />
        <Input label="Sign-in page (optional)" value={v.url} maxLength={300} placeholder="https://chatgpt.com" onChange={(e) => set("url", e.target.value)} />
        <Input label="Login (email or username)" value={v.username} maxLength={200} autoComplete="off" onChange={(e) => set("username", e.target.value)} />
        <PasswordInput
          label={item ? "New password" : "Password"}
          value={v.password}
          maxLength={500}
          autoComplete="new-password"
          onChange={(e) => set("password", e.target.value)}
          hint={item ? "Leave empty to keep the current one. Changing it clears the 'change password' reminder." : undefined}
        />
        <div>
          <Input
            label={item?.hasCode ? "New authenticator key (optional)" : "Authenticator key (optional)"}
            value={v.totp}
            maxLength={500}
            autoComplete="off"
            disabled={v.clearTotp}
            placeholder="Setup key or otpauth:// link"
            onChange={(e) => set("totp", e.target.value)}
            hint="If the account has 2-step sign-in: the key shown under the QR code ('Can't scan it?'). People then get the 6-digit code here."
          />
          {item?.hasCode && (
            <label className="mt-2 flex items-center gap-2 text-sm text-body">
              <input type="checkbox" checked={v.clearTotp} onChange={(e) => set("clearTotp", e.target.checked)} className="accent-[#d4000f]" /> Remove the authenticator key
            </label>
          )}
        </div>
        <div>
          <Textarea
            label={item?.hasNotes ? "Replace notes (optional)" : "Notes (optional)"}
            rows={3}
            value={v.notes}
            maxLength={3000}
            disabled={v.clearNotes}
            placeholder="e.g. Use the shared workspace, don't change the plan."
            onChange={(e) => set("notes", e.target.value)}
            hint={item?.hasNotes ? "Leave empty to keep the current notes." : "People with access can read these."}
          />
          {item?.hasNotes && (
            <label className="mt-2 flex items-center gap-2 text-sm text-body">
              <input type="checkbox" checked={v.clearNotes} onChange={(e) => set("clearNotes", e.target.checked)} className="accent-[#d4000f]" /> Remove the notes
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
}
