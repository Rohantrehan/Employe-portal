import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase } = await requireRole("admin");
  const { data } = await supabase.from("settings").select("company_name, work_start, work_end, grace_minutes, half_day_min_hours").single();

  return (
    <>
      <PageHeader eyebrow="Company" title="Settings" description="Office hours and the rules used to mark late arrivals and half days." />
      <SettingsForm
        initial={{
          company_name: data?.company_name ?? "RohTre Media",
          work_start: String(data?.work_start ?? "09:00").slice(0, 5),
          work_end: String(data?.work_end ?? "17:00").slice(0, 5),
          grace_minutes: Number(data?.grace_minutes ?? 15),
          half_day_min_hours: Number(data?.half_day_min_hours ?? 4),
        }}
      />
    </>
  );
}
