"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { todayIST } from "@/lib/format";

export type FixResult = { ok: true } | { ok: false; error: string };

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const fixSchema = z
  .object({
    employeeId: z.string().uuid(),
    attendanceId: z.string().uuid().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    clockIn: time,
    clockOut: time.or(z.literal("")),
    note: z.string().trim().max(500, "Keep the note under 500 characters"),
  })
  .refine((v) => v.date <= todayIST(), { message: "Can't record attendance for a future date", path: ["date"] })
  .refine((v) => v.clockOut !== v.clockIn, { message: "Clock-out must be after clock-in", path: ["clockOut"] });

const ist = (date: string, hhmm: string) => `${date}T${hhmm}:00+05:30`;
const nextDay = (date: string) => new Date(Date.parse(date + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);

/** Admin creates or corrects one attendance record. Status is recomputed by the DB trigger. */
export async function saveAttendance(input: z.input<typeof fixSchema>): Promise<FixResult> {
  const { supabase } = await requireRole("admin");
  const parsed = fixSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;

  // Night shift: a clock-out earlier than the clock-in is the next morning.
  let outDate = v.date;
  if (v.clockOut && v.clockOut < v.clockIn) {
    const { data: emp } = await supabase.from("profiles").select("schedule, shift_start, shift_end").eq("id", v.employeeId).single();
    const overnight = emp?.schedule === "custom" && !!emp.shift_start && !!emp.shift_end && emp.shift_end < emp.shift_start;
    if (!overnight) return { ok: false, error: "Clock-out must be after clock-in" };
    outDate = nextDay(v.date);
  }

  const row = {
    clock_in: ist(v.date, v.clockIn),
    clock_out: v.clockOut ? ist(outDate, v.clockOut) : null,
    admin_note: v.note || null,
  };

  const { error } = v.attendanceId
    ? await supabase.from("attendance").update(row).eq("id", v.attendanceId).eq("employee_id", v.employeeId)
    : await supabase.from("attendance").insert({ ...row, employee_id: v.employeeId, work_date: v.date });
  if (error) return { ok: false, error: error.code === "23505" ? "This day already has a record. Refresh and edit it." : "Could not save. Please try again." };

  await supabase.rpc("log_action", {
    p_action: v.attendanceId ? "attendance.edit" : "attendance.create",
    p_entity: "attendance",
    p_entity_id: v.attendanceId ?? `${v.employeeId}:${v.date}`,
    p_payload: { date: v.date, clock_in: v.clockIn, clock_out: v.clockOut || null },
  });
  revalidatePath("/admin/today");
  return { ok: true };
}

const reviewSchema = z.object({
  id: z.string().uuid(),
  approve: z.boolean(),
  note: z.string().trim().max(500, "Keep the note under 500 characters"),
  time: time.or(z.literal("")),
});

/** Approve (optionally with a corrected time) or reject an employee's missed clock-out request. */
export async function reviewClockoutFix(input: z.input<typeof reviewSchema>): Promise<FixResult> {
  const { supabase } = await requireRole("admin");
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  const { error } = await supabase.rpc("review_clockout_fix", { p_id: v.id, p_approve: v.approve, p_note: v.note, p_time: v.time || null });
  if (error) return { ok: false, error: error.code === "P0001" ? error.message : "Could not save the review. Please try again." };
  revalidatePath("/admin", "layout");
  revalidatePath("/app", "layout");
  return { ok: true };
}
