"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { tempPassword } from "@/lib/password";
import { employeeSchema, fieldErrorsOf } from "./schema";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> };

const BAN_FOREVER = "876000h"; // ~100 years

function formToObject(formData: FormData) {
  return Object.fromEntries(Array.from(formData.entries()).filter(([, v]) => typeof v === "string")) as Record<string, string>;
}

function friendlyDbError(message: string): { error?: string; fieldErrors?: Record<string, string> } {
  if (message.includes("profiles_emp_code_key")) return { fieldErrors: { emp_code: "This employee code is already used" } };
  if (message.includes("profiles_email_key")) return { fieldErrors: { email: "This email is already used" } };
  return { error: "Something went wrong while saving. Please try again." };
}

// ---------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------
export async function createEmployee(
  _prev: ActionResult<{ id: string; email: string; password: string }> | undefined,
  formData: FormData,
): Promise<ActionResult<{ id: string; email: string; password: string }>> {
  const { supabase } = await requireRole("admin");
  const parsed = employeeSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  const input = parsed.data;

  const admin = createAdminClient();
  const password = tempPassword();
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: input.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name },
    app_metadata: { role: input.role, must_change_password: true },
  });
  if (authError || !created.user) {
    const exists = authError?.message.toLowerCase().includes("already");
    return exists
      ? { ok: false, fieldErrors: { email: "An account with this email already exists" } }
      : { ok: false, error: "Could not create the login. Please try again." };
  }

  const id = created.user.id;
  // Profile row was created by the DB trigger; fill in the details (RLS: admin write).
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: input.full_name,
      phone: input.phone ?? null,
      designation: input.designation ?? null,
      department_id: input.department_id ?? null,
      date_of_joining: input.date_of_joining ?? null,
      basic_salary: input.basic_salary,
      role: input.role,
      must_change_password: true,
      ...(input.emp_code ? { emp_code: input.emp_code } : {}),
    })
    .eq("id", id);

  if (profileError) {
    await admin.auth.admin.deleteUser(id); // roll back the half-created account
    return { ok: false, ...friendlyDbError(profileError.message) };
  }

  await supabase.rpc("log_action", {
    p_action: "employee.create",
    p_entity: "profile",
    p_entity_id: id,
    p_payload: { email: input.email, role: input.role },
  });
  revalidatePath("/admin/employees");
  return { ok: true, data: { id, email: input.email, password } };
}

// ---------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------
export async function updateEmployee(id: string, _prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { supabase, profile: me } = await requireRole("admin");
  const parsed = employeeSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  const input = parsed.data;

  if (id === me.id && input.role !== "admin") {
    return { ok: false, fieldErrors: { role: "You can't remove your own admin access" } };
  }

  const { data: current } = await supabase.from("profiles").select("email, role").eq("id", id).single();
  if (!current) return { ok: false, error: "Employee not found." };

  const admin = createAdminClient();
  const authChanges: { email?: string; email_confirm?: boolean; app_metadata?: Record<string, unknown> } = {};
  if (input.email !== current.email) Object.assign(authChanges, { email: input.email, email_confirm: true });
  if (input.role !== current.role) authChanges.app_metadata = { role: input.role };
  if (Object.keys(authChanges).length) {
    const { error } = await admin.auth.admin.updateUserById(id, authChanges);
    if (error) {
      return error.message.toLowerCase().includes("already")
        ? { ok: false, fieldErrors: { email: "An account with this email already exists" } }
        : { ok: false, error: "Could not update the login. Please try again." };
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: input.full_name,
      email: input.email,
      phone: input.phone ?? null,
      designation: input.designation ?? null,
      department_id: input.department_id ?? null,
      date_of_joining: input.date_of_joining ?? null,
      basic_salary: input.basic_salary,
      role: input.role,
      ...(input.emp_code ? { emp_code: input.emp_code } : {}),
    })
    .eq("id", id);
  if (error) return { ok: false, ...friendlyDbError(error.message) };

  await supabase.rpc("log_action", { p_action: "employee.update", p_entity: "profile", p_entity_id: id, p_payload: null });
  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${id}`);
  return { ok: true, message: "Changes saved" };
}

// ---------------------------------------------------------------------
// Activate / deactivate
// ---------------------------------------------------------------------
export async function setEmployeeActive(id: string, active: boolean): Promise<ActionResult> {
  const { supabase, profile: me } = await requireRole("admin");
  if (id === me.id) return { ok: false, error: "You can't deactivate your own account." };

  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(id, { ban_duration: active ? "none" : BAN_FOREVER });
  if (banError) return { ok: false, error: "Could not update the login. Please try again." };

  const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", id);
  if (error) return { ok: false, error: "Could not update the employee. Please try again." };

  await supabase.rpc("log_action", {
    p_action: active ? "employee.activate" : "employee.deactivate",
    p_entity: "profile",
    p_entity_id: id,
    p_payload: null,
  });
  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${id}`);
  return { ok: true, message: active ? "Employee re-activated" : "Employee deactivated. They can no longer log in." };
}

// ---------------------------------------------------------------------
// Reset password (returns a new temporary password, shown once)
// ---------------------------------------------------------------------
export async function resetEmployeePassword(id: string): Promise<ActionResult<{ email: string; password: string }>> {
  const { supabase, profile: me } = await requireRole("admin");
  if (id === me.id) return { ok: false, error: "Change your own password from your profile instead." };

  const { data: target } = await supabase.from("profiles").select("email").eq("id", id).single();
  if (!target) return { ok: false, error: "Employee not found." };

  const password = tempPassword();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) return { ok: false, error: "Could not reset the password. Please try again." };

  await supabase.from("profiles").update({ must_change_password: true }).eq("id", id);
  await supabase.rpc("log_action", { p_action: "employee.reset_password", p_entity: "profile", p_entity_id: id, p_payload: null });
  return { ok: true, data: { email: target.email, password } };
}

// ---------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------
const deptName = z.string().trim().min(1, "Enter a name").max(80, "Use at most 80 characters");

export async function createDepartment(name: string): Promise<ActionResult> {
  const { supabase } = await requireRole("admin");
  const parsed = deptName.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { error } = await supabase.from("departments").insert({ name: parsed.data });
  if (error) return { ok: false, error: error.code === "23505" ? "That department already exists." : "Could not add the department." };
  revalidatePath("/admin/employees");
  return { ok: true };
}

export async function renameDepartment(id: string, name: string): Promise<ActionResult> {
  const { supabase } = await requireRole("admin");
  const parsed = deptName.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { error } = await supabase.from("departments").update({ name: parsed.data }).eq("id", id);
  if (error) return { ok: false, error: error.code === "23505" ? "That department already exists." : "Could not rename the department." };
  revalidatePath("/admin/employees");
  return { ok: true };
}

export async function deleteDepartment(id: string): Promise<ActionResult> {
  const { supabase } = await requireRole("admin");
  // Employees in it are kept; their department becomes empty (FK on delete set null).
  const { error } = await supabase.from("departments").delete().eq("id", id);
  if (error) return { ok: false, error: "Could not delete the department." };
  revalidatePath("/admin/employees");
  return { ok: true };
}
