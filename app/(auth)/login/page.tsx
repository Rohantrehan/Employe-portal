import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/misc";
import { AuthFrame } from "../auth-frame";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

const NOTICES: Record<string, string> = {
  inactive: "This account has been deactivated. Please contact your admin.",
  "signed-out": "You have been logged out.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <AuthFrame>
      <Eyebrow className="animate-enter mt-10">Employee portal</Eyebrow>
      <h1 className="animate-enter mt-4 text-[32px] font-extrabold leading-tight tracking-[-0.03em] text-ink">Welcome back.</h1>
      <p className="animate-enter mt-2 text-[15px] text-body">
        Log in to <span className="font-semibold text-ink">RohTre Media</span>. Use the email and password your admin gave you.
      </p>
      <LoginForm notice={reason ? NOTICES[reason] : undefined} />
      <p className="mt-8 text-sm text-body">
        No login yet? Ask your admin. Accounts are created by the RohTre team.
      </p>
    </AuthFrame>
  );
}
