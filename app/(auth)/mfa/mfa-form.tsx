"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Copy, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { startEnroll, verifyCode } from "./actions";

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="animate-pop flex items-start gap-2.5 rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      {children}
    </div>
  );
}

/** 6-digit code box + submit. */
function CodeForm({ factorId, firstTime, label }: { factorId: string; firstTime: boolean; label: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const res = await verifyCode(factorId, code, firstTime);
      if (!res.ok) {
        setCode("");
        return setError(res.error);
      }
      if (firstTime) toast.success("2-step sign-in is on");
      router.replace(res.next);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Input
        label={label}
        name="code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        autoFocus
        required
        className="text-center text-2xl font-bold tracking-[0.5em] tabular-nums"
      />
      <Button type="submit" size="lg" block loading={pending} disabled={code.length !== 6}>
        {firstTime ? "Turn on and continue" : "Continue"}
      </Button>
    </form>
  );
}

export function MfaVerify({ factorId, admin }: { factorId: string; admin: boolean }) {
  return (
    <>
      <CodeForm factorId={factorId} firstTime={false} label="6-digit code" />
      <p className="mt-4 text-[13px] text-body">
        Lost your phone? Ask {admin ? "another admin" : "your admin"} to reset your 2-step sign-in from your employee page.
      </p>
    </>
  );
}

export function MfaSetup() {
  const [setup, setSetup] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const begin = () =>
    start(async () => {
      setError(null);
      const res = await startEnroll();
      if (!res.ok) return setError(res.error);
      setSetup(res);
    });

  if (!setup) {
    return (
      <div className="mt-8 space-y-5">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex items-start gap-3 rounded-2xl bg-soft px-4 py-3.5 text-sm text-body">
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-ink" />
          <p>
            Install a free authenticator app on your phone first: <b className="text-ink">Google Authenticator</b>, <b className="text-ink">Microsoft Authenticator</b>{" "}
            or <b className="text-ink">Authy</b>.
          </p>
        </div>
        <Button size="lg" block loading={pending} onClick={begin}>
          I have the app, show the QR code
        </Button>
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(setup.secret);
      toast.success("Key copied");
    } catch {
      toast.error("Copy it by hand instead");
    }
  };

  return (
    <div className="mt-8">
      <ol className="space-y-5 text-sm text-body">
        <li>
          <p>
            <b className="text-ink">1.</b> In the app, tap <b className="text-ink">+</b> and scan this code.
          </p>
          {/* Supabase returns the QR as an SVG data URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="QR code to add RohTre Media Portal to your authenticator app" width={184} height={184} className="mt-3 rounded-2xl border border-line bg-white p-2" />
          <details className="mt-3">
            <summary className="cursor-pointer text-[13px] font-semibold text-ink">Can&apos;t scan? Type a key instead</summary>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-xl bg-soft px-3 py-2 font-mono text-[13px] text-ink">{setup.secret}</code>
              <Button variant="secondary" size="sm" onClick={copy} aria-label="Copy key">
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </details>
        </li>
        <li>
          <p>
            <b className="text-ink">2.</b> Type the 6-digit code the app shows.
          </p>
        </li>
      </ol>
      <CodeForm factorId={setup.factorId} firstTime label="Code from the app" />
    </div>
  );
}
