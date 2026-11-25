import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { MyChecklist, SafetyNote } from "@/components/checklist/my-checklist";
import { requireRole } from "@/lib/auth";
import { TASK_COLUMNS, type Task } from "@/lib/checklists";

export const metadata: Metadata = { title: "Getting started" };

export default async function SetupPage() {
  const { supabase, profile } = await requireRole("employee");
  // RLS returns only this employee's onboarding steps.
  const { data } = await supabase.from("employee_tasks").select(TASK_COLUMNS).eq("employee_id", profile.id).eq("kind", "onboarding");
  const tasks = (data ?? []) as Task[];
  const mine = tasks.filter((t) => t.owner === "employee");
  const left = mine.filter((t) => !t.done_at).length;
  const doneAll = tasks.filter((t) => t.done_at).length;
  const pct = tasks.length ? Math.round((doneAll / tasks.length) * 100) : 0;

  return (
    <>
      <PageHeader
        eyebrow="Me"
        title="Getting started"
        description="Set up your tools and accounts. Tick each step as you finish it."
      />

      {tasks.length === 0 ? (
        <Card className="mt-8">
          <EmptyState icon={<ListChecks />} title="Nothing to set up" description="Your admin hasn't given you any setup steps." />
        </Card>
      ) : (
        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <MyChecklist tasks={tasks} />
            <SafetyNote />
          </div>
          <aside className="card animate-enter relative overflow-hidden bg-rail p-6 text-white lg:sticky lg:top-24">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand/30 blur-3xl" aria-hidden />
            <p className="relative text-[12px] font-bold uppercase tracking-[0.14em] text-white/60">Your progress</p>
            <p className="relative mt-4 text-[44px] font-extrabold leading-none tracking-[-0.04em]">{pct}%</p>
            <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-white/10" aria-hidden>
              <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
            </div>
            <p className="relative mt-4 text-sm text-rail-text">
              {left === 0
                ? doneAll === tasks.length
                  ? "All done. Welcome to the team!"
                  : "Your part is done. Your admin is finishing the rest."
                : `${left} step${left === 1 ? "" : "s"} left for you.`}
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
