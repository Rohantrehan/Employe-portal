"use client";

import { useState, useTransition } from "react";
import { createRoot } from "react-dom/client";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { recheckCode } from "./recheck-actions";

function RecheckDialog({ onDone }: { onDone: (ok: boolean) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    start(async () => {
      setError(null);
      const res = await recheckCode(code);
      if (!res.ok) {
        setCode("");
        return setError(res.error);
      }
      onDone(true);
    });
  };
  return (
    <Modal
      open
      size="sm"
      onClose={() => !pending && onDone(false)}
      title={
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand" /> Confirm it&apos;s you
        </span>
      }
      description="Enter the 6-digit code from your authenticator app. Shared passwords then stay open to you for 10 minutes."
      footer={
        <>
          <Button variant="secondary" onClick={() => onDone(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => submit()} loading={pending} disabled={code.length !== 6}>
            Confirm
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <Input
          label="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          autoFocus
          error={error ?? undefined}
          className="text-center text-2xl font-bold tracking-[0.5em] tabular-nums"
        />
      </form>
    </Modal>
  );
}

let open: Promise<boolean> | null = null;

/** Asks for a fresh authenticator code. Resolves true once it's accepted. One prompt at a time. */
export function askForCode(): Promise<boolean> {
  if (open) return open;
  open = new Promise<boolean>((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (ok: boolean) => {
      root.unmount();
      host.remove();
      open = null;
      resolve(ok);
    };
    root.render(<RecheckDialog onDone={done} />);
  });
  return open;
}
