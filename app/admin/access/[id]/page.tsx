import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ExternalLink } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CodeRow, NotesRow, PasswordRow, UsernameRow } from "@/components/vault/secret";
import { requireRole } from "@/lib/auth";
import { formatDate, todayIST } from "@/lib/format";
import { timeText } from "@/lib/requests";
import { vaultReady } from "@/lib/vault";
import { ItemButton } from "../item-form";
import { SetupNotice } from "../setup-notice";
import { ArchiveButton, People, type Holder } from "./people";

export const metadata: Metadata = { title: "Shared account" };

const ACTION: Record<string, string> = {
  create: "added the account",
  update: "edited the details",
  password_change: "changed the password",
  archive: "removed the account",
  grant: "gave access to",
  revoke: "removed access from",
  view_password: "viewed the password",
  view_code: "got a 2-step code",
  view_notes: "read the notes",
};

export default async function VaultItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireRole("admin");
  const today = todayIST();
  const [{ data: item }, { data: flags }, { data: grants }, { data: events }, { data: employees }, { data: rotation }] = await Promise.all([
    supabase.from("vault_items").select("id, name, url, username, password_changed_at, archived_at, created_at").eq("id", id).maybeSingle(),
    supabase.rpc("vault_item_flags", { p_id: id }),
    supabase
      .from("vault_grants")
      .select("employee_id, granted_at, employee:profiles!vault_grants_employee_id_fkey(full_name, avatar_url, designation)")
      .eq("item_id", id)
      .is("revoked_at", null)
      .order("granted_at"),
    supabase
      .from("vault_events")
      .select("id, action, at, actor:profiles!vault_events_actor_id_fkey(full_name), target:profiles!vault_events_target_id_fkey(full_name)")
      .eq("item_id", id)
      .order("at", { ascending: false })
      .limit(200),
    supabase.from("profiles").select("id, full_name, left_on").eq("role", "employee").eq("is_active", true).order("full_name"),
    supabase.rpc("vault_rotation_needed"),
  ]);
  if (!item || item.archived_at) notFound();
  const f = ((flags ?? []) as { has_code: boolean; has_notes: boolean }[])[0] ?? { has_code: false, has_notes: false };
  const holders: Holder[] = (grants ?? []).map((g) => {
    const e = g.employee as unknown as { full_name: string; avatar_url: string | null; designation: string | null } | null;
    return { id: g.employee_id, name: e?.full_name ?? "—", avatar: e?.avatar_url ?? null, designation: e?.designation ?? null, since: g.granted_at };
  });
  const candidates = (employees ?? []).filter((e) => !(e.left_on && e.left_on < today) && !holders.some((h) => h.id === e.id)).map((e) => ({ id: e.id, name: e.full_name }));
  const rot = ((rotation ?? []) as { item_id: string; people: string[] }[]).find((r) => r.item_id === id);
  const ready = vaultReady();

  return (
    <>
      <Link href="/admin/access" className="group -ml-3 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-body transition hover:bg-white hover:text-ink">
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> Access manager
      </Link>
      <div className="animate-enter mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-ink">{item.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-body">
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-info hover:underline">
                {item.url.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "")} <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <span>Password set {formatDate(item.password_changed_at)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <ItemButton disabled={!ready} item={{ id: item.id, name: item.name, url: item.url, username: item.username, hasCode: f.has_code, hasNotes: f.has_notes }} />
          <ArchiveButton id={item.id} name={item.name} />
        </div>
      </div>
      {!ready && <SetupNotice />}

      {rot && (
        <div role="alert" className="mt-6 flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning-tint/60 px-4 py-3.5 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-body">
            <b className="text-ink">Change this password.</b> {rot.people.join(", ")} saw the current password and no longer {rot.people.length === 1 ? "has" : "have"} access. Change it on the site, then click Edit and save the new one.
          </p>
        </div>
      )}

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Login" description="Revealing the password or a code is logged, for admins too." />
            <CardBody className="space-y-2.5">
              {item.username && <UsernameRow username={item.username} />}
              <PasswordRow id={item.id} />
              {f.has_code && <CodeRow id={item.id} />}
              {f.has_notes && <NotesRow id={item.id} />}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Activity" description="Who opened, changed or shared this account." />
            {(events ?? []).length === 0 ? (
              <p className="p-6 text-sm text-body">Nothing yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {(events ?? []).map((e) => {
                  const actor = (e.actor as unknown as { full_name: string } | null)?.full_name ?? (e.action === "revoke" ? "Portal" : "Someone");
                  const target = (e.target as unknown as { full_name: string } | null)?.full_name;
                  return (
                    <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-5 py-2.5 text-sm sm:px-6">
                      <span className="text-body">
                        <b className="font-semibold text-ink">{actor}</b> {ACTION[e.action] ?? e.action}
                        {target && <b className="font-semibold text-ink"> {target}</b>}
                        {e.action === "revoke" && !(e.actor as unknown) && " (left the company)"}
                      </span>
                      <span className="text-[13px] text-body">{timeText(e.at)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
        <People itemId={item.id} holders={holders} candidates={candidates} />
      </div>
    </>
  );
}
