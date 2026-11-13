"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/field";
import { changePassword, type FormState } from "../actions";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, undefined);
  return (
    <form action={action} className="mt-8 space-y-5" noValidate>
      {state?.error && (
        <div role="alert" className="animate-pop flex items-start gap-2.5 rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}
      <PasswordInput label="New password" name="password" autoComplete="new-password" required autoFocus error={state?.fieldErrors?.password} />
      <PasswordInput label="Confirm new password" name="confirm" autoComplete="new-password" required error={state?.fieldErrors?.confirm} />
      <Button type="submit" size="lg" block loading={pending}>
        Save and continue
      </Button>
    </form>
  );
}
