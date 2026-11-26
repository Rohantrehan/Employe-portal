import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronRight, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { vaultReady } from "@/lib/vault";
import { ItemButton } from "./item-form";
import { SetupNotice } from "./setup-notice";

export const metadata: Metadata = { title: "Access manager" };

type Item = { id: string; name: string; url: string | null; username: string | null; password_changed_at: string };
type Grant = { item_id: string; employee: { full_name: string; avatar_url: string | null } | null };
type Rotation = { item_id: string; name: string; people: string[] };

export default async function AccessPage() {
  const { supabase } = await requireRole("admin");
  const ready = vaultReady();
  const [{ data: items }, { data: grants }, { data: rotation }] = await Promise.all([
    supabase.from("vault_items").select("id, name, url, username, password_changed_at").is("archived_at", null).order("name"),
    supabase.from("vault_grants").select("item_id, employee:profiles!vault_grants_employee_id_fkey(full_name, avatar_url)").is("revoked_at", null),
    supabase.rpc("vault_rotation_needed"),
  ]);
  const list = (items ?? []) as Item[];
  const g = (grants ?? []) as unknown as Grant[];
  const rot = (rotation ?? []) as Rotation[];

  return (
    <>
      <PageHeader
        eyebrow="Company"
        title="Access manager"
        description="Shared tool logins (ChatGPT, Frame.io, team mailboxes). Give each person only what they need; every reveal is logged."
        actions={list.length > 0 ? <ItemButton disabled={!ready} /> : undefined}
      />
      {!ready && <SetupNotice />}

      {rot.length > 0 && (
        <section aria-label="Passwords to change" className="animate-enter mt-8 rounded-[24px] border border-warning/40 bg-warning-tint/60 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-[18px] w-[18px] text-warning" />
            <h2 className="text-base font-bold text-ink">Change these passwords</h2>
          </div>
          <p className="mt-0.5 text-sm text-body">Someone who saw the current password no longer has access. Change it on the site, then save the new one here.</p>
          <ul className="mt-3 space-y-1.5">
            {rot.map((r) => (
              <li key={r.item_id}>
                <Link href={`/admin/access/${r.item_id}`} className="text-sm hover:underline">
                  <b className="font-semibold text-ink">{r.name}</b> <span className="text-body">· seen by {r.people.join(", ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {list.length === 0 ? (
        <Card className="mt-8">
          <EmptyState
            icon={<KeyRound />}
            title="No shared accounts yet"
            description="Add a login once, then give it to the people who need it. When someone leaves, their access ends automatically."
            action={<ItemButton disabled={!ready} />}
          />
        </Card>
      ) : (
        <ul className="card mt-8 divide-y divide-line overflow-hidden">
          {list.map((i) => {
            const people = g.filter((x) => x.item_id === i.id);
            const needs = rot.some((r) => r.item_id === i.id);
            return (
              <li key={i.id}>
                <Link href={`/admin/access/${i.id}`} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-soft sm:px-6">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-tint text-brand">
                    <KeyRound className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold text-ink">{i.name}</span>
                      {needs && <Badge tone="warning" dot>Change password</Badge>}
                    </p>
                    <p className="truncate text-[13px] text-body">
                      {i.username ?? "No login saved"} · password set {formatDate(i.password_changed_at)}
                    </p>
                  </div>
                  <div className="hidden items-center sm:flex" aria-label={`${people.length} people`}>
                    {people.slice(0, 4).map((p, n) => (
                      <Avatar key={n} name={p.employee?.full_name ?? "?"} src={p.employee?.avatar_url} size={30} className="-ml-2 ring-2 ring-white first:ml-0" />
                    ))}
                    {people.length > 4 && <span className="-ml-2 grid h-[30px] w-[30px] place-items-center rounded-full bg-grey-tile text-[11px] font-bold text-body ring-2 ring-white">+{people.length - 4}</span>}
                  </div>
                  <span className="w-20 text-right text-[13px] text-body">{people.length === 0 ? "No one" : `${people.length} ${people.length === 1 ? "person" : "people"}`}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-body transition group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
