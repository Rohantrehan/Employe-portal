"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";

type What = "password" | "code" | "notes";
const HIDE_AFTER_MS = 30_000;

async function reveal(id: string, what: What): Promise<{ value?: string; code?: string; secondsLeft?: number }> {
  const res = await fetch(`/api/vault/${id}/reveal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ what }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Could not open this account.");
  return json;
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Couldn't copy. Select it and copy by hand.");
  }
}

function IconBtn({ label, onClick, busy, children }: { label: string; onClick: () => void; busy?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-body transition hover:bg-app hover:text-ink disabled:cursor-wait"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}

const Row = ({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) => (
  <div className="flex min-h-11 items-center gap-3 rounded-2xl border border-line bg-soft px-3.5 py-1.5">
    <span className="text-body [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
    <span className="w-24 shrink-0 text-[12px] font-bold uppercase tracking-wider text-body">{label}</span>
    {children}
  </div>
);

/** Username line with copy (not secret, no reveal needed). */
export function UsernameRow({ username }: { username: string }) {
  return (
    <Row icon={<KeyRound />} label="Login">
      <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink">{username}</span>
      <IconBtn label="Copy login" onClick={() => copy(username, "Login")}>
        <Copy className="h-4 w-4" />
      </IconBtn>
    </Row>
  );
}

/** Password: hidden until revealed (each reveal is logged), auto-hides after 30 s. */
export function PasswordRow({ id }: { id: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const get = async () => {
    if (value) return value;
    setBusy(true);
    try {
      const r = await reveal(id, "password");
      setValue(r.value!);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setValue(null), HIDE_AFTER_MS);
      return r.value!;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Row icon={<ShieldCheck />} label="Password">
      <span className={cn("min-w-0 flex-1 truncate font-mono text-sm", value ? "text-ink" : "tracking-[0.2em] text-body")}>{value ?? "••••••••••"}</span>
      <IconBtn label={value ? "Hide password" : "Show password"} busy={busy} onClick={() => (value ? setValue(null) : void get())}>
        {value ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </IconBtn>
      <IconBtn
        label="Copy password"
        onClick={async () => {
          const v = await get();
          if (v) copy(v, "Password");
        }}
      >
        <Copy className="h-4 w-4" />
      </IconBtn>
    </Row>
  );
}

/** Current 6-digit authenticator code with a countdown; fetches the next one when asked. */
export function CodeRow({ id }: { id: string }) {
  const [code, setCode] = useState<{ code: string; until: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [code]);
  const left = code ? Math.max(0, Math.ceil((code.until - now) / 1000)) : 0;
  const expired = code && left === 0;

  const get = async () => {
    setBusy(true);
    try {
      const r = await reveal(id, "code");
      setCode({ code: r.code!, until: Date.now() + r.secondsLeft! * 1000 });
      setNow(Date.now());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Row icon={<Check />} label="2-step code">
      {code && !expired ? (
        <>
          <span className="min-w-0 flex-1 font-mono text-lg font-bold tracking-[0.2em] text-ink">
            {code.code.slice(0, 3)} {code.code.slice(3)}
          </span>
          <span className={cn("text-[12px] font-semibold tabular-nums", left <= 5 ? "text-brand" : "text-body")}>{left}s</span>
          <IconBtn label="Copy code" onClick={() => copy(code.code, "Code")}>
            <Copy className="h-4 w-4" />
          </IconBtn>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 text-sm text-body">{expired ? "Code expired." : "For the login's 2-step check."}</span>
          <button type="button" onClick={get} disabled={busy} className="btn-secondary !min-h-8 h-8 !px-3.5 !text-[13px]">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {expired ? "New code" : "Get code"}
          </button>
        </>
      )}
    </Row>
  );
}

export function NotesRow({ id }: { id: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const get = async () => {
    setBusy(true);
    try {
      setValue((await reveal(id, "notes")).value!);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return value ? (
    <div className="rounded-2xl border border-line bg-soft px-4 py-3">
      <p className="text-[12px] font-bold uppercase tracking-wider text-body">Notes</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{value}</p>
    </div>
  ) : (
    <button type="button" onClick={get} disabled={busy} className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-body hover:text-ink">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StickyNote className="h-3.5 w-3.5" />} Show notes
    </button>
  );
}
