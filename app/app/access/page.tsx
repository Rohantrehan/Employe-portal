import type { Metadata } from "next";
import { ExternalLink, KeyRound, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { CodeRow, NotesRow, PasswordRow, UsernameRow } from "@/components/vault/secret";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "My access" };

type Mine = { id: string; name: string; url: string | null; username: string | null; has_code: boolean; has_notes: boolean; granted_at: string };

export default async function MyAccessPage() {
  const { supabase } = await requireRole("employee");
  const { data } = await supabase.rpc("my_vault");
  const items = (data ?? []) as Mine[];

  return (
    <>
      <PageHeader eyebrow="Me" title="My access" description="Company logins you've been given. Use them only for work." />
      {items.length === 0 ? (
        <Card className="mt-8">
          <EmptyState icon={<KeyRound />} title="No shared logins" description="If you need access to a tool, send a request to HR." />
        </Card>
      ) : (
        <>
          <div className="mt-8 grid items-start gap-5 lg:grid-cols-2">
            {items.map((i) => (
              <section key={i.id} className="card p-5 sm:p-6" aria-label={i.name}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-tint text-brand">
                      <KeyRound className="h-[18px] w-[18px]" />
                    </span>
                    <h2 className="truncate text-base font-bold text-ink">{i.name}</h2>
                  </div>
                  {i.url && (
                    <a href={i.url} target="_blank" rel="noopener noreferrer" className="btn-secondary !min-h-8 h-8 shrink-0 !px-3.5 !text-[13px]">
                      Open <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
                <div className="mt-4 space-y-2.5">
                  {i.username && <UsernameRow username={i.username} />}
                  <PasswordRow id={i.id} />
                  {i.has_code && <CodeRow id={i.id} />}
                  {i.has_notes && <NotesRow id={i.id} />}
                </div>
              </section>
            ))}
          </div>
          <p className="mt-6 flex items-start gap-2 text-[13px] text-body">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            Every time a password or code is shown, it&apos;s recorded. Don&apos;t share these logins, change the passwords, or save them in a personal browser.
          </p>
        </>
      )}
    </>
  );
}
