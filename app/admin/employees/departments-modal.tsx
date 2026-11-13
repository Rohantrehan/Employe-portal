"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { createDepartment, deleteDepartment, renameDepartment } from "./actions";

type Dept = { id: string; name: string; count: number };

export function DepartmentsButton({ departments }: { departments: Dept[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Building2 className="h-4 w-4" /> Departments
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Departments" description="Group employees for filtering and reports.">
        <DepartmentsEditor departments={departments} />
      </Modal>
    </>
  );
}

function DepartmentsEditor({ departments }: { departments: Dept[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Something went wrong");
      toast.success(success);
      after?.();
      router.refresh();
    });

  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createDepartment(name), "Department added", () => setName(""));
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New department, e.g. Design"
          aria-label="New department name"
          className="h-11 min-w-0 flex-1 rounded-2xl border border-line bg-white px-4 text-[15px] outline-none transition focus:border-brand focus:ring-4 focus:ring-tint"
        />
        <Button type="submit" disabled={!name.trim()} loading={pending && !editing && !confirmDelete} className="h-11">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>

      <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
        {departments.length === 0 && <li className="px-4 py-6 text-center text-sm text-body">No departments yet.</li>}
        {departments.map((d) => (
          <li key={d.id} className="flex items-center gap-2 px-4 py-2.5">
            {editing === d.id ? (
              <form
                className="flex flex-1 items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => renameDepartment(d.id, editName), "Department renamed", () => setEditing(null));
                }}
              >
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  aria-label="Department name"
                  className="h-9 min-w-0 flex-1 rounded-xl border border-line px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-tint"
                />
                <IconBtn label="Save" type="submit">
                  <Check className="h-4 w-4 text-success" />
                </IconBtn>
                <IconBtn label="Cancel" onClick={() => setEditing(null)}>
                  <X className="h-4 w-4" />
                </IconBtn>
              </form>
            ) : confirmDelete === d.id ? (
              <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-ink">
                  Delete <b>{d.name}</b>?{d.count > 0 && <span className="text-body"> {d.count} employee(s) will have no department.</span>}
                </p>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(null)}>
                    Keep
                  </Button>
                  <Button size="sm" loading={pending} onClick={() => run(() => deleteDepartment(d.id), "Department deleted", () => setConfirmDelete(null))}>
                    Delete
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <span className="flex-1 text-sm font-semibold text-ink">{d.name}</span>
                <span className="text-xs text-body">{d.count} people</span>
                <IconBtn
                  label={`Rename ${d.name}`}
                  onClick={() => {
                    setEditing(d.id);
                    setEditName(d.name);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </IconBtn>
                <IconBtn label={`Delete ${d.name}`} onClick={() => setConfirmDelete(d.id)}>
                  <Trash2 className="h-4 w-4" />
                </IconBtn>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function IconBtn({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-body transition-colors hover:bg-app hover:text-ink"
      {...props}
    >
      {children}
    </button>
  );
}
