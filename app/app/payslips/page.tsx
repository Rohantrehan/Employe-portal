import type { Metadata } from "next";
import { Download, Eye, FileText, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, StatTile } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { formatDate, formatINR, todayIST } from "@/lib/format";
import { formatHours } from "@/lib/overtime";
import { monthTitle, multiplierText, ratingInfo } from "@/lib/payroll";

export const metadata: Metadata = { title: "Payslips" };

export default async function PayslipsPage() {
  const { supabase, profile } = await requireRole("employee");
  const year = todayIST().slice(0, 4);

  // RLS only returns this employee's PUBLISHED payslips.
  const [{ data }] = await Promise.all([
    supabase
      .from("payslips")
      .select("id, month, working_days, present_days, leave_days, overtime_hours, basic_salary, excellence_bonus, rating, performance_bonus, night_shift_pay, remarks, net_pay, payment_status, paid_on, payment_ref")
      .eq("employee_id", profile.id)
      .order("month", { ascending: false }),
  ]);

  const slips = (data ?? []).map((s) => ({
    ...s,
    basic_salary: Number(s.basic_salary),
    excellence_bonus: Number(s.excellence_bonus),
    rating: s.rating == null ? null : Number(s.rating),
    performance_bonus: Number(s.performance_bonus),
    night_shift_pay: Number(s.night_shift_pay),
    net_pay: Number(s.net_pay),
  }));
  const latest = slips[0];
  const latestRating = ratingInfo(latest?.rating);
  const yearTotal = slips.filter((s) => s.month.startsWith(year)).reduce((t, s) => t + s.net_pay, 0);
  const pdf = (id: string, view = false) => `/api/payslips/${id}/pdf${view ? "?view=1" : ""}`;

  return (
    <>
      <PageHeader eyebrow="Me" title="Payslips" description="Your monthly salary slips. Download any of them as a PDF." />

      {!latest ? (
        <Card className="mt-8">
          <EmptyState icon={<FileText />} title="No payslips yet" description="Your payslip appears here once your admin publishes it for the month." />
        </Card>
      ) : (
        <>
          <div className="animate-enter relative mt-8 overflow-hidden rounded-[28px] bg-rail p-7 text-white sm:p-8">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/30 blur-3xl" aria-hidden />
            <div className="relative flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-white/60">Latest payslip · {monthTitle(latest.month)}</p>
                <p className="mt-2 text-[40px] font-extrabold leading-none tracking-[-0.035em]">{formatINR(latest.net_pay)}</p>
                <p className="mt-2 text-rail-text">
                  Basic {formatINR(latest.basic_salary)}
                  {latest.excellence_bonus > 0 && <> · Excellence {formatINR(latest.excellence_bonus)}</>} · Performance {formatINR(latest.performance_bonus)}
                  {latest.night_shift_pay > 0 && <> · Night shift {formatINR(latest.night_shift_pay)}</>}
                </p>
                {latestRating && (
                  <p className="mt-1 text-sm text-white/60">
                    Rating {latestRating.value}/5 · {multiplierText(latestRating.multiplier)} ({latestRating.label.toLowerCase()})
                  </p>
                )}
                {latest.remarks && <p className="mt-2 max-w-xl whitespace-pre-line text-sm text-white/80">“{latest.remarks}”</p>}
                <div className="mt-3">
                  {latest.payment_status === "paid" ? (
                    <Badge tone="success" dot>
                      Paid on {formatDate(latest.paid_on)}
                    </Badge>
                  ) : (
                    <Badge tone="warning">Payment pending</Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={pdf(latest.id, true)} target="_blank" rel="noopener" className={buttonClass("secondary", "lg", "!bg-white/10 !text-white !border-white/20 hover:!bg-white/15")}>
                  <Eye className="h-4 w-4" /> View
                </a>
                <a href={pdf(latest.id)} className={buttonClass("primary", "lg")}>
                  <Download className="h-4 w-4" /> Download PDF
                </a>
              </div>
            </div>
            <dl className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Working days", latest.working_days],
                ["Present", latest.present_days],
                ["Leave", latest.leave_days],
                ["Extra hours", formatHours(latest.overtime_hours)],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-2xl bg-white/[0.06] px-4 py-3">
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-white/50">{k}</dt>
                  <dd className="mt-0.5 text-lg font-extrabold">{typeof v === "string" ? v : Number(v)}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <StatTile label={`Total in ${year}`} value={formatINR(yearTotal)} sub="Net pay, published slips" icon={<Wallet />} tone="dark" />
            <StatTile label="Payslips" value={slips.length} sub="All time" icon={<FileText />} tone="brand" />
          </div>

          <Card className="mt-6 overflow-hidden">
            <CardHeader title="All payslips" />
            <Table>
              <THead>
                <tr>
                  <TH>Month</TH>
                  <TH className="text-right">Basic</TH>
                  <TH className="text-right">Excellence</TH>
                  <TH className="text-right">Performance</TH>
                  <TH className="text-right">Night shift</TH>
                  <TH className="text-right">Net pay</TH>
                  <TH>Payment</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {slips.map((s) => (
                  <TR key={s.id}>
                    <TD className="font-semibold">{monthTitle(s.month)}</TD>
                    <TD className="text-right tabular-nums text-body">{formatINR(s.basic_salary)}</TD>
                    <TD className="text-right tabular-nums text-body">{formatINR(s.excellence_bonus)}</TD>
                    <TD className="text-right tabular-nums text-body">
                      {formatINR(s.performance_bonus)}
                      {s.rating != null && <span className="block text-[11px]">rating {s.rating}</span>}
                    </TD>
                    <TD className="text-right tabular-nums text-body">{formatINR(s.night_shift_pay)}</TD>
                    <TD className="text-right font-extrabold tabular-nums">{formatINR(s.net_pay)}</TD>
                    <TD>
                      {s.payment_status === "paid" ? (
                        <Badge tone="success">Paid {formatDate(s.paid_on).slice(0, 6)}</Badge>
                      ) : (
                        <Badge tone="warning">Pending</Badge>
                      )}
                    </TD>
                    <TD className="text-right">
                      <a href={pdf(s.id)} className={buttonClass("ghost", "sm")} aria-label={`Download ${monthTitle(s.month)} payslip`}>
                        <Download className="h-3.5 w-3.5" /> PDF
                      </a>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
