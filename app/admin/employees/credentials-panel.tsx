"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shows a login + temporary password once, with copy buttons. */
export function CredentialsPanel({ email, password, note }: { email: string; password: string; note?: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard blocked: the text is still visible to copy by hand */
    }
  };
  const both = `Portal: ${typeof window !== "undefined" ? window.location.origin : ""}/login\nEmail: ${email}\nTemporary password: ${password}`;

  return (
    <div className="rounded-card border border-line bg-soft p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-tint text-brand">
          <KeyRound className="h-[18px] w-[18px]" />
        </span>
        <div>
          <p className="text-sm font-bold text-ink">Login details</p>
          <p className="text-[13px] text-body">{note ?? "Shown only once. Share it with the employee privately."}</p>
        </div>
      </div>
      <dl className="mt-4 space-y-2">
        {[
          ["Email", email],
          ["Temporary password", password],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3">
            <div className="min-w-0">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-body">{label}</dt>
              <dd className="truncate font-mono text-[15px] font-semibold text-ink">{value}</dd>
            </div>
            <button
              type="button"
              onClick={() => copy(label, value)}
              className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-body transition-colors hover:bg-app hover:text-ink"
              aria-label={`Copy ${label.toLowerCase()}`}
            >
              {copied === label ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        ))}
      </dl>
      <Button variant="secondary" size="sm" className="mt-3" onClick={() => copy("both", both)}>
        {copied === "both" ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        Copy all
      </Button>
    </div>
  );
}
