"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { resetEmployeePassword, setEmployeeActive } from "../actions";
import { CredentialsPanel } from "../credentials-panel";

export function AccountActions({ id, name, isActive, isMe }: { id: string; name: string; isActive: boolean; isMe: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<null | "reset" | "deactivate">(null);
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);

  const close = () => {
    setDialog(null);
    setCreds(null);
  };

  const doReset = () =>
    start(async () => {
      const res = await resetEmployeePassword(id);
      if (!res.ok) return void toast.error(res.error ?? "Could not reset the password");
      setCreds(res.data!);
      router.refresh();
    });

  const doToggle = (active: boolean) =>
    start(async () => {
      const res = await setEmployeeActive(id, active);
      if (!res.ok) return void toast.error(res.error ?? "Something went wrong");
      toast.success(res.message ?? "Updated");
      setDialog(null);
      router.refresh();
    });

  if (isMe) {
    return (
      <Card>
        <CardHeader title="Account" />
        <CardBody>
          <p className="text-sm text-body">This is your own account. You can&apos;t deactivate it or reset its password from here.</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Account" description="Login access for this person." />
      <CardBody className="space-y-2.5">
        <Button variant="secondary" block onClick={() => setDialog("reset")} disabled={!isActive}>
          <KeyRound className="h-4 w-4" /> Reset password
        </Button>
        {isActive ? (
          <Button variant="danger" block onClick={() => setDialog("deactivate")}>
            <UserX className="h-4 w-4" /> Deactivate
          </Button>
        ) : (
          <Button block loading={pending} onClick={() => doToggle(true)}>
            <ShieldCheck className="h-4 w-4" /> Re-activate
          </Button>
        )}
        {!isActive && <p className="pt-1 text-[13px] text-body">Deactivated people can&apos;t log in. Their history is kept.</p>}
      </CardBody>

      <Modal
        open={dialog === "reset"}
        onClose={close}
        title={creds ? "New temporary password" : "Reset password?"}
        description={creds ? undefined : `${name} will get a new temporary password and must set their own at next login.`}
        footer={
          creds ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button loading={pending} onClick={doReset}>
                Reset password
              </Button>
            </>
          )
        }
      >
        {creds && <CredentialsPanel email={creds.email} password={creds.password} />}
      </Modal>

      <Modal
        open={dialog === "deactivate"}
        onClose={close}
        title={`Deactivate ${name}?`}
        description="They will be logged out and can't log in again until re-activated. Attendance, leave and payslip history is kept."
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button loading={pending} onClick={() => doToggle(false)}>
              Deactivate
            </Button>
          </>
        }
      />
    </Card>
  );
}
