import type { Metadata } from "next";
import { Download, FileText, Hourglass } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { MyLetters, type MyLetter } from "@/components/letters/my-letters";
import { requireFormer } from "@/lib/auth";
import { formatDate, formatINR } from "@/lib/format";
import { monthTitle } from "@/lib/payroll";

export const metadata: Metadata = { title: "My documents" };

export default async function FormerHome() {
  const { supabase, profile } = await requireFormer();
  const [{ data: letters }, { data: slips }] = await Promise.all([
    supabase.from("letters").select("id, kind, status, ref_no, issue_date, cancelled_at").eq("employee_id", profile.id).order("issue_date", { ascending: false }),
    supabase.from("payslips").select("id, month, net_pay, payment_status, paid_on").eq("employee_id", profile.id).order("month", { ascending: false }),
  ]);
  const first = profile.full_name.split(" ")[0];

  return (
    <>
      <div className="animate-enter relative overflow-hidden rounded-[28px] bg-rail p-7 text-white sm:p-9">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/30 blur-3xl" aria-hidden />
        <p className="relative text-[13px] font-bold uppercase tracking-[0.14em] text-white/60">Last working day · {formatDate(profile.left_on)}</p>
        <h1 className="relative mt-2 text-[30px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[36px]">Thank you, {first}.</h1>
        <p className="relative mt-2 max-w-xl text-rail-text">
          Your letters and payslips stay here so you can download them any time.
        </p>
      </div>

      {(letters ?? []).length > 0 ? (
        <MyLetters letters={(letters ?? []) as MyLetter[]} className="mt-6" />
      ) : (
        <Card className="mt-6">
          <EmptyState
            icon={<Hourglass />}
            title="Your letters are being prepared"
            description="Your experience and relieving letters will appear here once the company issues them."
          />
        </Card>
      )}

      <Card className="mt-6 overflow-hidden">
        <CardHeader title="Payslips" />
        {(slips ?? []).length === 0 ? (
          <EmptyState icon={<FileText />} title="No payslips" description="Published payslips appear here." />
        ) : (
          <ul className="divide-y divide-line">
            {(slips ?? []).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{monthTitle(s.month)}</p>
                  <p className="text-sm text-body">{formatINR(s.net_pay)}</p>
                </div>
                {s.payment_status === "paid" ? <Badge tone="success">Paid {formatDate(s.paid_on)}</Badge> : <Badge tone="warning">Payment pending</Badge>}
                <a href={`/api/payslips/${s.id}/pdf`} className={buttonClass("ghost", "sm")} aria-label={`Download ${monthTitle(s.month)} payslip`}>
                  <Download className="h-3.5 w-3.5" /> PDF
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
