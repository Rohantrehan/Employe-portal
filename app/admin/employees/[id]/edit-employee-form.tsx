"use client";

import { useActionState, useEffect } from "react";
import { AlertCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { updateEmployee } from "../actions";
import { EmployeeFields, type Department, type EmployeeDefaults } from "../employee-fields";

export function EditEmployeeForm({
  id,
  isMe,
  departments,
  defaults,
}: {
  id: string;
  isMe: boolean;
  departments: Department[];
  defaults: EmployeeDefaults;
}) {
  const [state, action, pending] = useActionState(updateEmployee.bind(null, id), undefined);

  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Saved");
  }, [state]);

  const errors = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} noValidate>
      <Card>
        <CardHeader title="Details" description="Profile, salary and access." />
        <CardBody>
          {state && !state.ok && state.error && (
            <div role="alert" className="animate-pop mb-5 flex items-start gap-2.5 rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {state.error}
            </div>
          )}
          <EmployeeFields departments={departments} defaults={defaults} errors={errors} isEdit lockRole={isMe} />
        </CardBody>
        <div className="flex justify-end border-t border-line px-5 py-4 sm:px-6">
          <Button type="submit" loading={pending}>
            <Save className="h-4 w-4" /> Save changes
          </Button>
        </div>
      </Card>
    </form>
  );
}
