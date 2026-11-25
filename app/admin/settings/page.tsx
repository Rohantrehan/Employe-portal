import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";
import { LetterSettings, type SignatureVersion } from "./letter-settings";
import { SecurityCard } from "./security-card";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase } = await requireRole("admin");
  const [{ data }, { data: sigs }, { data: used }, { data: factors }] = await Promise.all([
    supabase
      .from("settings")
      .select("company_name, work_start, work_end, grace_minutes, half_day_min_hours, letter_prefix, letter_experience_template, letter_relieving_template")
      .single(),
    supabase.from("letter_signatures").select("id, signer_name, signer_title, signature_path, seal_path, created_at, retired_at").order("created_at", { ascending: false }).limit(20),
    supabase.from("letters").select("signature_id").not("signature_id", "is", null),
    supabase.auth.mfa.listFactors(),
  ]);
  const factor = factors?.all.find((f) => f.factor_type === "totp" && f.status === "verified");

  // Private bucket: short-lived links so only the admin's browser can show the images.
  const paths = (sigs ?? []).flatMap((s) => [s.signature_path, s.seal_path]).filter((p): p is string => !!p);
  const { data: signed } = paths.length ? await supabase.storage.from("letter-assets").createSignedUrls(paths, 600) : { data: [] };
  const urlOf = (p: string | null) => (p ? (signed ?? []).find((s) => s.path === p)?.signedUrl ?? null : null);
  const versions: SignatureVersion[] = (sigs ?? []).map((s) => ({
    id: s.id,
    signer_name: s.signer_name,
    signer_title: s.signer_title,
    signature_url: urlOf(s.signature_path),
    seal_url: urlOf(s.seal_path),
    created_at: s.created_at,
    retired_at: s.retired_at,
    used: (used ?? []).filter((l) => l.signature_id === s.id).length,
  }));

  return (
    <>
      <PageHeader eyebrow="Company" title="Settings" description="Office hours, attendance rules, and the signature and wording on letters." />
      <SettingsForm
        initial={{
          company_name: data?.company_name ?? "RohTre Media",
          work_start: String(data?.work_start ?? "09:00").slice(0, 5),
          work_end: String(data?.work_end ?? "17:00").slice(0, 5),
          grace_minutes: Number(data?.grace_minutes ?? 15),
          half_day_min_hours: Number(data?.half_day_min_hours ?? 4),
        }}
      />
      <SecurityCard since={factor?.created_at ?? null} />
      <LetterSettings
        versions={versions}
        wording={{
          prefix: data?.letter_prefix ?? "RT",
          experience: data?.letter_experience_template ?? "",
          relieving: data?.letter_relieving_template ?? "",
        }}
      />
    </>
  );
}
