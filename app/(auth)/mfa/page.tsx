import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Eyebrow } from "@/components/ui/misc";
import { getSession, homeFor } from "@/lib/auth";
import { AuthFrame } from "../auth-frame";
import { MfaSetup, MfaVerify } from "./mfa-form";

export const metadata: Metadata = { title: "2-step sign-in" };

export default async function MfaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const { profile, supabase, aal } = session;
  if (!profile || !profile.is_active) redirect("/auth/logout?reason=inactive");
  if (profile.role !== "admin") redirect(homeFor(profile.role));

  const { data } = await supabase.auth.mfa.listFactors();
  const factor = data?.all.find((f) => f.factor_type === "totp" && f.status === "verified");
  if (factor && aal === "aal2") redirect("/admin");
  const firstName = profile.full_name.split(" ")[0];

  return (
    <AuthFrame>
      <Eyebrow className="animate-enter mt-10">Admin security</Eyebrow>
      {factor ? (
        <>
          <h1 className="animate-enter mt-4 text-[32px] font-extrabold leading-tight tracking-[-0.03em] text-ink">Enter your code.</h1>
          <p className="animate-enter mt-2 text-[15px] text-body">Open your authenticator app and type the 6-digit code for RohTre Media Portal.</p>
          <MfaVerify factorId={factor.id} />
        </>
      ) : (
        <>
          <h1 className="animate-enter mt-4 text-[32px] font-extrabold leading-tight tracking-[-0.03em] text-ink">
            {firstName}, protect the admin account.
          </h1>
          <p className="animate-enter mt-2 text-[15px] text-body">
            Admins sign in with a password <b className="text-ink">and</b> a code from an authenticator app on their phone, so a leaked password alone can&apos;t open
            payroll or staff data. It takes a minute, once.
          </p>
          <MfaSetup />
        </>
      )}
      <a href="/auth/logout" className="animate-enter mt-8 inline-block text-sm font-semibold text-body hover:text-brand">
        Log out
      </a>
    </AuthFrame>
  );
}
