"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, PasswordInput } from "@/components/ui/field";
import { changeMyPassword, savePhone, type ProfileState } from "./actions";

function useToast(state: ProfileState, onOk?: () => void) {
  const last = useRef<ProfileState>(undefined);
  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.ok) {
      toast.success(state.message ?? "Saved");
      onOk?.();
    } else if (state.error) toast.error(state.error);
  }, [state, onOk]);
}

export function PhoneForm({ phone }: { phone: string | null }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(savePhone, undefined);
  useToast(state);
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Input
        label="Phone number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        defaultValue={phone ?? ""}
        placeholder="+91 98765 43210"
        hint="Used by the office to reach you. Leave empty to remove."
        wrapperClassName="flex-1"
      />
      <Button type="submit" variant="secondary" loading={pending} className="sm:mb-[26px]">
        Save
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ProfileState, FormData>(changeMyPassword, undefined);
  useToast(state, () => form.current?.reset());
  const fe = state?.fieldErrors;
  return (
    <form ref={form} action={action} className="space-y-4" noValidate>
      <PasswordInput label="Current password" name="current" autoComplete="current-password" required error={fe?.current} />
      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordInput
          label="New password"
          name="password"
          autoComplete="new-password"
          required
          error={fe?.password}
          hint="8+ characters, with a letter and a number"
        />
        <PasswordInput label="Confirm new password" name="confirm" autoComplete="new-password" required error={fe?.confirm} />
      </div>
      <Button type="submit" loading={pending}>
        Change password
      </Button>
    </form>
  );
}
