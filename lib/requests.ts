import type { BadgeTone } from "@/components/ui/badge";

export type RequestCategory = "documents" | "salary" | "leave_attendance" | "access" | "concern" | "other";
export type RequestStatus = "open" | "in_progress" | "resolved" | "withdrawn";

export type HrRequest = {
  id: string;
  employee_id: string;
  category: RequestCategory;
  subject: string;
  status: RequestStatus;
  last_employee_at: string;
  last_admin_at: string | null;
  employee_seen_at: string;
  admin_seen_at: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type RequestMessage = { id: string; from_admin: boolean; body: string; created_at: string; author: string | null };

export const REQUEST_COLUMNS =
  "id, employee_id, category, subject, status, last_employee_at, last_admin_at, employee_seen_at, admin_seen_at, resolved_at, created_at";

export const CATEGORY_LABEL: Record<RequestCategory, string> = {
  documents: "Letter or document",
  salary: "Salary or payslip",
  leave_attendance: "Leave or attendance",
  access: "Tool or account access",
  concern: "Concern or complaint",
  other: "Something else",
};

export const CATEGORY_HINT: Record<RequestCategory, string> = {
  documents: "e.g. a salary certificate, address proof or a copy of a letter",
  salary: "e.g. a question about this month's payslip",
  leave_attendance: "e.g. a wrong attendance day or a leave balance question",
  access: "e.g. you can't log in to Frame.io or need ChatGPT access",
  concern: "Something that's bothering you at work. Only admins can read it.",
  other: "Anything else for HR",
};

export const STATUS_LABEL: Record<RequestStatus, string> = {
  open: "Waiting for HR",
  in_progress: "In progress",
  resolved: "Resolved",
  withdrawn: "Withdrawn",
};
export const STATUS_TONE: Record<RequestStatus, BadgeTone> = {
  open: "warning",
  in_progress: "info",
  resolved: "success",
  withdrawn: "neutral",
};

/** A reply from the other side that this side hasn't opened yet. */
export const unreadForEmployee = (r: Pick<HrRequest, "last_admin_at" | "employee_seen_at">) =>
  !!r.last_admin_at && r.last_admin_at > r.employee_seen_at;
export const unreadForAdmin = (r: Pick<HrRequest, "last_employee_at" | "admin_seen_at">) => !r.admin_seen_at || r.last_employee_at > r.admin_seen_at;

export const lastActivity = (r: Pick<HrRequest, "last_employee_at" | "last_admin_at">) =>
  r.last_admin_at && r.last_admin_at > r.last_employee_at ? r.last_admin_at : r.last_employee_at;

/** "5 min ago", "3 h ago", "2 days ago", then a date. */
export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) {
    const d = Math.floor(s / 86400);
    return `${d} day${d === 1 ? "" : "s"} ago`;
  }
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export const timeText = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
