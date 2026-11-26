import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Eyebrow } from "@/components/ui/misc";
import { getSession, isFormer } from "@/lib/auth";
import { AuthFrame } from "../auth-frame";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Set your password" };

export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Password changes need the 2-step code first (except for people who have left).
  if (session.aal !== "aal2" && !(session.profile && isFormer(session.profile))) redirect("/mfa");
  const firstName = session.profile?.full_name.split(" ")[0];

  return (
    <AuthFrame>
      <Eyebrow className="animate-enter mt-10">First login</Eyebrow>
      <h1 className="animate-enter mt-4 text-[32px] font-extrabold leading-tight tracking-[-0.03em] text-ink">
        {firstName ? `Hi ${firstName}, set your password.` : "Set your password."}
      </h1>
      <p className="animate-enter mt-2 text-[15px] text-body">
        Replace the temporary password your admin gave you. Use at least 8 characters with a letter and a number.
      </p>
      <ChangePasswordForm />
    </AuthFrame>
  );
}
