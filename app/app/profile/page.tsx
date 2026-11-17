import type { Metadata } from "next";
import { BadgeCheck, Building2, CalendarDays, IdCard, Mail, Phone, Wallet } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Avatar, PageHeader } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";
import { formatDate, formatINR, formatPhone, todayIST } from "@/lib/format";
import { PasswordForm, PhoneForm } from "./profile-forms";

export const metadata: Metadata = { title: "Profile" };

function tenure(joined: string | null, today: string) {
  if (!joined) return null;
  const [y1, m1, d1] = joined.split("-").map(Number);
  const [y2, m2, d2] = today.split("-").map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 0) return null;
  const years = Math.floor(months / 12);
  months %= 12;
  const parts = [years && `${years} ${years === 1 ? "year" : "years"}`, months && `${months} ${months === 1 ? "month" : "months"}`].filter(Boolean);
  return parts.length ? parts.join(" ") : "Less than a month";
}

export default async function ProfilePage() {
  const { supabase, profile } = await requireRole("employee");
  const { data: me } = await supabase
    .from("profiles")
    .select("phone, date_of_joining, basic_salary, departments(name)")
    .eq("id", profile.id)
    .single<{ phone: string | null; date_of_joining: string | null; basic_salary: number; departments: { name: string } | null }>();

  const since = tenure(me?.date_of_joining ?? null, todayIST());
  const rows: [React.ReactNode, string, React.ReactNode][] = [
    [<IdCard key="i" />, "Employee code", profile.emp_code],
    [<Mail key="m" />, "Work email", profile.email],
    [<Phone key="p" />, "Phone", me?.phone ? formatPhone(me.phone) : "Not added"],
    [<BadgeCheck key="b" />, "Designation", profile.designation ?? "—"],
    [<Building2 key="d" />, "Department", me?.departments?.name ?? "—"],
    [<CalendarDays key="c" />, "Date of joining", formatDate(me?.date_of_joining)],
    [<Wallet key="w" />, "Basic salary", `${formatINR(me?.basic_salary ?? 0)} / month`],
  ];

  return (
    <>
      <PageHeader eyebrow="Me" title="Profile" description="Your details at RohTre Media. Ask your admin to change anything other than your phone number." />

      <div className="animate-enter relative mt-8 overflow-hidden rounded-[28px] bg-rail p-7 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/30 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-5">
          <Avatar name={profile.full_name} src={profile.avatar_url} size={72} className="ring-4 ring-white/10" />
          <div className="min-w-0">
            <p className="text-[28px] font-extrabold leading-tight tracking-[-0.03em]">{profile.full_name}</p>
            <p className="mt-1 text-rail-text">
              {[profile.designation, me?.departments?.name].filter(Boolean).join(" · ") || "Team member"} · {profile.emp_code}
            </p>
            {since && <p className="mt-2 text-[13px] font-semibold text-white/70">With RohTre Media for {since}</p>}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Your details" />
          <dl className="divide-y divide-line">
            {rows.map(([icon, k, v]) => (
              <div key={k} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-grey-tile text-body [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
                <dt className="w-32 shrink-0 text-[13px] text-body">{k}</dt>
                <dd className="min-w-0 text-sm font-semibold text-ink [overflow-wrap:anywhere]">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader title="Contact" description="Keep your phone number up to date." />
            <CardBody>
              <PhoneForm phone={me?.phone ? formatPhone(me.phone) : null} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Password" description="You'll stay signed in on this device." />
            <CardBody>
              <PasswordForm />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
