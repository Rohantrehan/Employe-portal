"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, PasswordInput } from "@/components/ui/field";
import { login, type FormState } from "../actions";

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, undefined);
  const message = state?.error ?? notice;

  return (
    <form action={action} className="mt-8 space-y-5" noValidate>
      {message && (
        <div role="alert" className="animate-pop flex items-start gap-2.5 rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {message}
        </div>
      )}
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@rohtremedia.com"
        required
        autoFocus
        error={state?.fieldErrors?.email}
      />
      <PasswordInput
        label="Password"
        name="password"
        autoComplete="current-password"
        required
        error={state?.fieldErrors?.password}
      />
      <Button type="submit" size="lg" block loading={pending}>
        Log in
      </Button>
    </form>
  );
}
