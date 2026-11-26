import type { Metadata } from "next";
import { Download, Eye, FileSignature } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { MyLetters, type MyLetter } from "@/components/letters/my-letters";
import { requireRole } from "@/lib/auth";
import { formatDate, todayIST } from "@/lib/format";
import { contractState, daysUntil, durationText, salaryText } from "@/lib/letters";

export const metadata: Metadata = { title: "Documents" };

type Row = MyLetter & { designation: string; department: string | null; date_from: string; date_to: string | null; salary: number | null };

export default async function DocumentsPage() {
  const { supabase, profile } = await requireRole("employee");
  const today = todayIST();

  // Only this person's letters, never drafts (HR could otherwise see drafts through admin rights).
  const { data } = await supabase
    .from("letters")
    .select("id, kind, status, ref_no, issue_date, cancelled_at, designation, department, date_from, date_to, salary")
    .eq("employee_id", profile.id)
    .neq("status", "draft")
    .order("issue_date", { ascending: false });
  const letters = ((data ?? []) as Row[]).map((l) => ({ ...l, salary: l.salary == null ? null : Number(l.salary) }));

  const contracts = letters.filter((l) => l.kind === "contract" && l.status === "issued").sort((a, b) => a.date_from.localeCompare(b.date_from));
  const shown =
    contracts.find((c) => contractState(c.date_from, c.date_to, today) === "current") ??
    contracts.find((c) => contractState(c.date_from, c.date_to, today) === "upcoming") ??
    contracts.at(-1) ??
    null;
  const state = shown ? contractState(shown.date_from, shown.date_to, today) : null;
  const pdf = (id: string, view = false) => `/api/letters/${id}/pdf${view ? "?view=1" : ""}`;

  return (
    <>
      <PageHeader eyebrow="Me" title="Documents" description="Your offer letter, contract and other letters from the company, signed and with a QR check." />

      {shown ? (
        <section aria-label="Your contract" className="animate-enter relative mt-8 overflow-hidden rounded-[28px] bg-rail p-7 text-white sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/30 blur-3xl" aria-hidden />
          <div className="relative">
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-white/60">
              {state === "current" ? "Current contract" : state === "upcoming" ? "Next contract" : "Last contract (ended)"}
            </p>
            <p className="mt-2 text-[30px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[36px]">{shown.designation}</p>
            {shown.department && <p className="text-rail-text">{shown.department}</p>}
            <dl className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Starts", formatDate(shown.date_from)],
                ["Ends", formatDate(shown.date_to)],
                ["Length", shown.date_to ? durationText(shown.date_from, shown.date_to, true) : "—"],
                ["Monthly salary", salaryText(shown.salary).replace("Rs. ", "₹")],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[12px] font-bold uppercase tracking-wider text-white/50">{k}</dt>
                  <dd className="mt-1 text-lg font-bold">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-white/80">
                {state === "current" && shown.date_to
                  ? (() => {
                      const n = daysUntil(today, shown.date_to);
                      return n === 0 ? "Your contract ends today." : `${n} day${n === 1 ? "" : "s"} left in this contract.`;
                    })()
                  : state === "upcoming"
                    ? `Starts in ${daysUntil(today, shown.date_from)} days.`
                    : "Ask your admin about a renewal."}
                <span className="text-white/50"> · {shown.ref_no}</span>
              </p>
              <div className="flex gap-2">
                <a href={pdf(shown.id, true)} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>
                  <Eye className="h-3.5 w-3.5" /> View
                </a>
                <a href={pdf(shown.id)} className={buttonClass("primary", "sm")}>
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <Card className="mt-8">
          <EmptyState icon={<FileSignature />} title="No contract yet" description="Your employment contract appears here once your admin issues it." />
        </Card>
      )}

      {letters.length > 0 && <MyLetters letters={letters} className="mt-6" />}
    </>
  );
}
