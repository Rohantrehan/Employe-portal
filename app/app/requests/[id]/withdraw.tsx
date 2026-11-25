"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { withdrawRequest } from "../actions";

export function WithdrawButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      const r = await withdrawRequest(id);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Request withdrawn");
      setOpen(false);
      router.refresh();
    });
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Undo2 className="h-3.5 w-3.5" /> Withdraw
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="Withdraw this request?"
        description="HR will see that you don't need this any more. You can't reply to it afterwards."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Keep it</Button>
            <Button variant="danger" onClick={go} loading={pending}>Withdraw</Button>
          </>
        }
      />
    </>
  );
}
