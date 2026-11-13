import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LogoMark } from "@/components/ui/logo";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-app px-4">
      <div className="card animate-enter w-full max-w-md p-10 text-center">
        <span className="animate-pulse-ring mx-auto inline-block rounded-[15px]">
          <LogoMark size={48} />
        </span>
        <p className="mt-6 text-[13px] font-bold uppercase tracking-[0.14em] text-brand">404</p>
        <h1 className="mt-2 text-[28px] font-extrabold tracking-[-0.03em] text-ink">This page isn&apos;t here yet.</h1>
        <p className="mt-2 text-[15px] text-body">It may still be under construction, or the link is wrong.</p>
        <Link href="/" className={buttonClass("primary", "lg", "mt-8")}>
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
      </div>
    </div>
  );
}
