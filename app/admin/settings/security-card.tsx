"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { formatDate } from "@/lib/format";
import { resetMyFactor } from "@/app/(auth)/mfa/actions";

/** The signed-in admin's own 2-step sign-in status. */
export function SecurityCard({ since }: { since: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const reset = () =>
    start(async () => {
      const res = await resetMyFactor();
      if (!res.ok) return void toast.error(res.error);
      router.replace("/mfa");
    });

  return (
    <Card className="mt-6">
      <CardHeader title="Your sign-in security" description="Admins need a password and a code from their phone." />
      <CardBody className="flex flex-wrap items-center gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-success-tint text-success">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 basis-[220px]">
          <p className="font-bold text-ink">2-step sign-in is on</p>
          <p className="text-sm text-body">{since ? `Authenticator app added on ${formatDate(since.slice(0, 10))}.` : "Authenticator app added."}</p>
        </div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Smartphone className="h-4 w-4" /> Use a different phone
        </Button>
      </CardBody>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Move to a different phone?"
        description="The app on your current phone stops working. You'll scan a new QR code right away."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button loading={pending} onClick={reset}>
              Continue
            </Button>
          </>
        }
      />
    </Card>
  );
}
