"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { CATEGORY_HINT, CATEGORY_LABEL, type RequestCategory } from "@/lib/requests";
import { createRequest } from "./actions";

export function NewRequestButton({ size = "md", disabled }: { size?: "sm" | "md"; disabled?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} onClick={() => (disabled ? toast.error(disabled) : setOpen(true))}>
        <Plus className="h-4 w-4" /> New request
      </Button>
      {open && <NewRequestModal onClose={() => setOpen(false)} />}
    </>
  );
}

function NewRequestModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [category, setCategory] = useState<RequestCategory | "">("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const r = await createRequest({ category: category as RequestCategory, subject, body });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Sent to HR");
      onClose();
      router.push(`/app/requests/${r.data!.id}`);
    });

  return (
    <Modal
      open
      onClose={onClose}
      title="New request to HR"
      description="HR replies here, and you'll see a red badge in the menu when they do."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={pending} disabled={!category || subject.trim().length < 3 || body.trim().length < 10}>
            Send to HR
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select label="What is it about?" value={category} onChange={(e) => setCategory(e.target.value as RequestCategory)} hint={category ? CATEGORY_HINT[category] : undefined}>
          <option value="" disabled>Pick one</option>
          {(Object.keys(CATEGORY_LABEL) as RequestCategory[]).map((c) => (
            <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
          ))}
        </Select>
        <Input label="Subject" value={subject} maxLength={120} placeholder="e.g. Salary certificate for a bank loan" onChange={(e) => setSubject(e.target.value)} />
        <Textarea
          label="Details"
          rows={5}
          value={body}
          maxLength={3000}
          placeholder="What do you need, and by when?"
          onChange={(e) => setBody(e.target.value)}
          hint={`${body.trim().length}/3000`}
        />
        <p className="flex items-start gap-2 text-[13px] text-body">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Only admins can read your requests.
        </p>
      </div>
    </Modal>
  );
}
