"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { revokeAccess } from "@/app/admin/access/actions";

/** Shared logins this person has, with quick removal (e.g. while offboarding). */
export function AccessCard({ employeeId, items, leaving }: { employeeId: string; items: { id: string; name: string }[]; leaving: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const take = async (itemId: string | null) => {
    setBusy(itemId ?? "all");
    const r = await revokeAccess(itemId, employeeId);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(itemId ? "Access removed" : "All access removed");
    router.refresh();
  };
  return (
    <Card>
      <CardHeader
        title="Tool access"
        description={items.length ? (leaving ? "Ends automatically after their last day." : "Shared logins they can open.") : "No shared logins."}
        action={
          items.length > 1 ? (
            <Button size="sm" variant="danger" loading={busy === "all"} onClick={() => take(null)}>
              Remove all
            </Button>
          ) : undefined
        }
      />
      {items.length > 0 && (
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-5 py-2.5 sm:px-6">
              <KeyRound className="h-4 w-4 shrink-0 text-body" />
              <Link href={`/admin/access/${i.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold text-ink hover:underline">
                {i.name}
              </Link>
              <button
                type="button"
                onClick={() => take(i.id)}
                disabled={!!busy}
                aria-label={`Remove ${i.name}`}
                title="Remove access"
                className="grid h-7 w-7 cursor-pointer place-items-center rounded-full text-body transition hover:bg-app hover:text-brand"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-line px-5 py-3 sm:px-6">
        <Link href="/admin/access" className="text-[13px] font-semibold text-body hover:text-ink">
          Give access in the Access manager →
        </Link>
      </div>
    </Card>
  );
}
