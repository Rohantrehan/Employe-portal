"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, CalendarCheck, Clock3, Inbox, Plane, Plus, Users } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, PasswordInput, Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState, Eyebrow, PageHeader, Skeleton, StatTile } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { Modal } from "@/components/ui/modal";
import { LogoLoader } from "@/components/ui/logo";

const COLORS: Array<[string, string]> = [
  ["brand", "#d4000f"],
  ["brand-dark", "#b8000d"],
  ["ink", "#111827"],
  ["body", "#6b7280"],
  ["line", "#e5e7eb"],
  ["app", "#f4f5f7"],
  ["soft", "#fafafb"],
  ["tint", "#fbe6e7"],
  ["tint-2", "#fcebec"],
  ["rail", "#14161b"],
  ["success", "#15803d"],
  ["warning", "#b45309"],
  ["info", "#0069a4"],
];

const ROWS = [
  { name: "Aarav Sharma", code: "RT-001", status: "Working", tone: "success" as const, in: "09:02" },
  { name: "Diya Verma", code: "RT-002", status: "Late", tone: "warning" as const, in: "09:27" },
  { name: "Kabir Singh", code: "RT-003", status: "On leave", tone: "info" as const, in: "—" },
  { name: "Meera Iyer", code: "RT-004", status: "Not clocked in", tone: "neutral" as const, in: "—" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.14em] text-body">{title}</h2>
      {children}
    </section>
  );
}

export function StyleguideDemo() {
  const [area, setArea] = useState<"admin" | "employee">("admin");
  const [tab, setTab] = useState("pending");
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <AppShell
      area={area}
      user={{ name: "Riya Kapoor", email: "riya@rohtremedia.com", subtitle: area === "admin" ? "Administrator" : "Designer" }}
      topbarRight={
        <Tabs
          className="hidden sm:inline-flex"
          value={area}
          onChange={(v) => setArea(v as "admin" | "employee")}
          items={[
            { value: "admin", label: "Admin" },
            { value: "employee", label: "Employee" },
          ]}
        />
      }
    >
      <PageHeader
        eyebrow="Design system"
        title="Styleguide"
        description="Every building block of the portal, matched to seller.rohtremedia.com."
        actions={
          <>
            <Button variant="secondary" onClick={() => setArea(area === "admin" ? "employee" : "admin")} className="sm:hidden">
              Switch to {area === "admin" ? "employee" : "admin"}
            </Button>
            <Button onClick={() => setModal(true)}>
              <Plus className="h-4 w-4" /> Open modal
            </Button>
          </>
        }
      />

      <Section title="Colors">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {COLORS.map(([name, hex]) => (
            <div key={name} className="card overflow-hidden">
              <div className="h-14" style={{ background: hex }} />
              <div className="px-3 py-2">
                <p className="text-xs font-bold text-ink">{name}</p>
                <p className="text-[11px] text-body">{hex}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <Card>
          <CardBody className="space-y-4">
            <Eyebrow>Eyebrow label</Eyebrow>
            <p className="text-[44px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-[60px]">Every day, in one clear view.</p>
            <p className="text-[36px] font-extrabold leading-[1.08] tracking-[-0.03em]">Section heading</p>
            <p className="text-[32px] font-extrabold leading-tight tracking-[-0.03em]">Welcome back.</p>
            <p className="max-w-2xl text-[15px] leading-relaxed text-body">
              Body text in Plus Jakarta Sans. Clock in with your plan for the day, apply for leave, and download your payslips.
            </p>
          </CardBody>
        </Card>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button size="lg">
            Clock in <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Reject</Button>
          <Button size="sm">Small</Button>
          <Button
            loading={loading}
            onClick={() => {
              setLoading(true);
              setTimeout(() => {
                setLoading(false);
                toast.success("Saved", { description: "Your changes were saved." });
              }, 1200);
            }}
          >
            Save (loading + toast)
          </Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge tone="success" dot>Working</Badge>
          <Badge tone="success">Approved</Badge>
          <Badge tone="warning" dot>Pending</Badge>
          <Badge tone="warning">Late</Badge>
          <Badge tone="info">Holiday</Badge>
          <Badge tone="brand">Rejected</Badge>
          <Badge tone="neutral">Not clocked in</Badge>
          <Badge tone="dark">Floating</Badge>
        </div>
      </Section>

      <Section title="KPI tiles">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Employees" value="24" sub="2 joined this month" icon={<Users />} tone="dark" />
          <StatTile label="Present today" value="19" sub="3 late arrivals" icon={<CalendarCheck />} tone="success" />
          <StatTile label="On leave" value="3" sub="2 sick · 1 vacation" icon={<Plane />} tone="info" />
          <StatTile label="Pending requests" value="5" sub="Needs your review" icon={<Inbox />} tone="brand" />
        </div>
      </Section>

      <Section title="Form fields">
        <Card>
          <CardHeader title="Apply for leave" description="Sundays and company holidays are skipped automatically." />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <Input label="Email" type="email" placeholder="you@rohtremedia.com" />
            <PasswordInput label="Password" placeholder="••••••••" />
            <Select label="Leave type" defaultValue="paid">
              <option value="sick">Sick Leave</option>
              <option value="paid">Paid Leave</option>
              <option value="vacation">Vacation Leave</option>
              <option value="unpaid">Unpaid Leave</option>
            </Select>
            <Input label="From" type="date" error="Pick a working day" />
            <Textarea label="Today's tasks" placeholder="One task per line" hint="You can mark them done when you clock out." wrapperClassName="sm:col-span-2" />
          </CardBody>
        </Card>
      </Section>

      <Section title="Tabs + table">
        <Card>
          <CardHeader
            title="Today"
            description="Live status of the team"
            action={
              <Tabs
                value={tab}
                onChange={setTab}
                items={[
                  { value: "pending", label: "All", count: 4 },
                  { value: "working", label: "Working", count: 1 },
                  { value: "leave", label: "On leave", count: 1 },
                ]}
              />
            }
          />
          <Table>
            <THead>
              <tr>
                <TH>Employee</TH>
                <TH>Code</TH>
                <TH>Clock in</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {ROWS.map((r) => (
                <TR key={r.code}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={r.name} size={32} />
                      <span className="font-semibold">{r.name}</span>
                    </div>
                  </TD>
                  <TD className="text-body">{r.code}</TD>
                  <TD className="tabular-nums">{r.in}</TD>
                  <TD>
                    <Badge tone={r.tone} dot>
                      {r.status}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </Section>

      <Section title="Empty, skeleton and loader">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <EmptyState icon={<Clock3 />} title="No extra hours yet" description="Log extra work and your admin will review it." action={<Button size="sm">Log hours</Button>} />
          </Card>
          <Card>
            <CardBody className="space-y-3">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton />
              <Skeleton className="w-5/6" />
              <Skeleton className="h-24" />
            </CardBody>
          </Card>
          <Card className="overflow-hidden">
            <div className="[&>div]:min-h-[220px]">
              <LogoLoader />
            </div>
          </Card>
        </div>
      </Section>

      <Section title="Dark block">
        <div className="relative overflow-hidden rounded-[32px] bg-rail px-8 py-14 text-center text-white sm:px-16">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-brand/20 blur-3xl" />
          <p className="relative text-[32px] font-extrabold tracking-[-0.03em] sm:text-[40px]">Ready for today?</p>
          <p className="relative mt-2 text-rail-text">Write your plan and clock in.</p>
          <Button size="lg" className="relative mt-8">
            Clock in <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </Section>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Clock in"
        description="Write what you plan to finish today."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setModal(false);
                toast.success("Clocked in at 09:02");
              }}
            >
              Clock in
            </Button>
          </>
        }
      >
        <Textarea label="Today's tasks" placeholder={"Finish payroll screen\nReview leave requests"} rows={5} />
      </Modal>
    </AppShell>
  );
}
