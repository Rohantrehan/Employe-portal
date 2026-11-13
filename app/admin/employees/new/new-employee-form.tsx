"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, UserPlus } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { createEmployee } from "../actions";
import { CredentialsPanel } from "../credentials-panel";
import { EmployeeFields, type Department } from "../employee-fields";

/** Changing the key remounts the form, which clears the action state for "Add another". */
export function NewEmployeeForm({ departments }: { departments: Department[] }) {
  const [round, setRound] = useState(0);
  return <NewEmployeeFormInner key={round} departments={departments} onAddAnother={() => setRound((r) => r + 1)} />;
}

function NewEmployeeFormInner({ departments, onAddAnother }: { departments: Department[]; onAddAnother: () => void }) {
  const [state, action, pending] = useActionState(createEmployee, undefined);

  if (state?.ok && state.data) {
    const { id, email, password } = state.data;
    return (
      <Card className="animate-pop mx-auto max-w-xl">
        <CardBody>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-success-tint text-success">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink">Employee added</h2>
              <p className="text-sm text-body">They will be asked to set their own password at first login.</p>
            </div>
          </div>
          <div className="mt-6">
            <CredentialsPanel email={email} password={password} />
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href={`/admin/employees/${id}`} className={buttonClass("primary")}>
              View employee <ArrowRight className="h-4 w-4" />
            </Link>
            <Button variant="secondary" onClick={onAddAnother}>
              <UserPlus className="h-4 w-4" /> Add another
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  const errors = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} noValidate>
      <Card>
        <CardHeader title="Employee details" description="A login is created with a temporary password you can share." />
        <CardBody>
          {state && !state.ok && state.error && (
            <div role="alert" className="animate-pop mb-5 flex items-start gap-2.5 rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {state.error}
            </div>
          )}
          <EmployeeFields departments={departments} errors={errors} />
        </CardBody>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4 sm:px-6">
          <Link href="/admin/employees" className={buttonClass("secondary")}>
            Cancel
          </Link>
          <Button type="submit" loading={pending}>
            <UserPlus className="h-4 w-4" /> Create employee
          </Button>
        </div>
      </Card>
    </form>
  );
}
