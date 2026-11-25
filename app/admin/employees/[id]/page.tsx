import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";
import { formatDate, formatINR, formatPhone, todayIST } from "@/lib/format";
import { EditEmployeeForm } from "./edit-employee-form";
import { AccountActions } from "./account-actions";
import { ExitPanel, type AdminLetter, type ExitInfo, type FinalPayslip, type LetterEvent } from "./exit-panel";

export const metadata: Metadata = { title: "Employee" };

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, profile: me } = await requireRole("admin");

  const [{ data: emp }, { data: departments }, { data: balances }, { data: exit }, { data: letters }, { data: events }, { data: settings }, { count: signatures }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, emp_code, full_name, email, phone, designation, department_id, date_of_joining, basic_salary, role, schedule, shift_start, shift_end, is_active, must_change_password, avatar_url, created_at, left_on, former_access, departments(name)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("departments").select("id, name").order("name"),
    supabase
      .from("leave_balances")
      .select("allotted, carried, used, pending, year, leave_types(name, color, sort_order)")
      .eq("employee_id", id)
      .eq("year", new Date().getFullYear()),
    supabase.from("employee_exits").select("last_day, reason, conduct, letters_allowed, note").eq("employee_id", id).maybeSingle(),
    supabase
      .from("letters")
      .select("id, kind, status, ref_no, issue_date, designation, department, date_from, date_to, conduct, pronoun, body, verify_code, cancelled_at, cancel_reason, created_at")
      .eq("employee_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("letter_events")
      .select("letter_id, event, created_at, actor:profiles!letter_events_actor_id_fkey(full_name), letters!inner(employee_id)")
      .eq("letters.employee_id", id)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("settings").select("company_name, letter_experience_template, letter_relieving_template").single(),
    supabase.from("letter_signatures").select("id", { count: "exact", head: true }).is("retired_at", null),
  ]);
  if (!emp) notFound();

  const isMe = emp.id === me.id;
  const today = todayIST();
  const exitMonth = exit ? exit.last_day.slice(0, 7) + "-01" : null;
  const { data: finalSlip } = exitMonth
    ? await supabase.from("payslips").select("status, payment_status").eq("employee_id", id).eq("month", exitMonth).maybeSingle()
    : { data: null };
  const finalPayslip: FinalPayslip | null = exitMonth ? { month: exitMonth, status: finalSlip?.status ?? null, payment_status: finalSlip?.payment_status ?? null } : null;
  const letterEvents: LetterEvent[] = (events ?? []).map((e) => ({
    letter_id: e.letter_id,
    event: e.event as LetterEvent["event"],
    created_at: e.created_at,
    actor: (e.actor as unknown as { full_name: string } | null)?.full_name ?? null,
  }));
  const dept = (emp.departments as unknown as { name: string } | null)?.name;
  const sortedBalances = (balances ?? [])
    .map((b) => ({ ...b, type: b.leave_types as unknown as { name: string; color: string; sort_order: number } }))
    .sort((a, b) => a.type.sort_order - b.type.sort_order);

  return (
    <>
      <Link
        href="/admin/employees"
        className="group -ml-3 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-body transition hover:bg-white hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> Employees
      </Link>

      {/* Header */}
      <div className="animate-enter mt-3 flex flex-wrap items-center gap-4">
        <Avatar name={emp.full_name} src={emp.avatar_url} size={64} className="text-xl" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-ink">{emp.full_name}</h1>
            {emp.left_on && emp.left_on < today ? (
              <Badge>Left {formatDate(emp.left_on)}</Badge>
            ) : emp.left_on ? (
              <Badge tone="warning" dot>Leaving {formatDate(emp.left_on)}</Badge>
            ) : emp.is_active ? (
              <Badge tone="success" dot>Active</Badge>
            ) : (
              <Badge>Deactivated</Badge>
            )}
            {emp.role === "admin" && <Badge tone="dark">Admin</Badge>}
            {emp.must_change_password && emp.is_active && <Badge tone="warning">Hasn&apos;t set password yet</Badge>}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-body">
            <span className="font-mono">{emp.emp_code}</span>
            {emp.designation && <span>{emp.designation}{dept ? ` · ${dept}` : ""}</span>}
            <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{emp.email}</span>
            {emp.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{formatPhone(emp.phone)}</span>}
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
        <EditEmployeeForm
          id={emp.id}
          isMe={isMe}
          departments={departments ?? []}
          defaults={{
            full_name: emp.full_name,
            email: emp.email,
            emp_code: emp.emp_code,
            phone: emp.phone,
            designation: emp.designation,
            department_id: emp.department_id,
            date_of_joining: emp.date_of_joining,
            basic_salary: Number(emp.basic_salary),
            role: emp.role,
            schedule: emp.schedule,
            shift_start: emp.shift_start,
            shift_end: emp.shift_end,
          }}
        />
        <div id="exit">
          <ExitPanel
            employee={{
              id: emp.id,
              full_name: emp.full_name,
              emp_code: emp.emp_code,
              designation: emp.designation,
              department: dept ?? null,
              date_of_joining: emp.date_of_joining,
              role: emp.role,
              left_on: emp.left_on,
              former_access: emp.former_access,
            }}
            exit={(exit as ExitInfo | null) ?? null}
            letters={(letters ?? []) as AdminLetter[]}
            events={letterEvents}
            templates={{ experience: settings?.letter_experience_template ?? "", relieving: settings?.letter_relieving_template ?? "" }}
            company={settings?.company_name ?? "RohTre Media"}
            hasSignature={(signatures ?? 0) > 0}
            finalPayslip={finalPayslip}
            today={today}
          />
        </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="At a glance" />
            <CardBody>
              <dl className="space-y-3 text-sm">
                {[
                  ["Joined", formatDate(emp.date_of_joining)],
                  ["Basic salary", `${formatINR(emp.basic_salary)} / month`],
                  ["Account created", formatDate(emp.created_at)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-body">{k}</dt>
                    <dd className="font-semibold text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={`Leave balance ${new Date().getFullYear()}`} description="Unpaid leave has no limit." />
            <CardBody className="space-y-4">
              {sortedBalances.length === 0 && <p className="text-sm text-body">No balances for this year{emp.role === "admin" ? " (admins don't get them automatically)" : ""}.</p>}
              {sortedBalances.map((b) => {
                const total = Number(b.allotted) + Number(b.carried);
                const left = total - Number(b.used) - Number(b.pending);
                const pct = total > 0 ? Math.min(100, (Number(b.used) / total) * 100) : 0;
                return (
                  <div key={b.type.name}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-semibold text-ink">{b.type.name}</span>
                      <span className="text-body">
                        <b className="text-ink">{left}</b> of {total} left
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-grey-tile">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: b.type.color }} />
                    </div>
                  </div>
                );
              })}
            </CardBody>
          </Card>

          <AccountActions id={emp.id} name={emp.full_name} isActive={emp.is_active} isMe={isMe} hasExit={!!exit} formerAccess={emp.former_access} />
        </div>
      </div>
    </>
  );
}
