// Shared by the admin editor (live preview) and the server (PDF). No server-only imports.
import { amountInWords } from "./payroll";

export type LetterKind = "experience" | "relieving" | "offer" | "contract";
export type ExitKind = "experience" | "relieving";
export type HireKind = "offer" | "contract";
export type LetterStatus = "draft" | "issued" | "cancelled";
export type Pronoun = "he" | "she" | "they";
export type Conduct = "excellent" | "good" | "satisfactory";
export type ExitReason = "resigned" | "contract_ended" | "terminated" | "other";

export const KIND_LABEL: Record<LetterKind, string> = {
  experience: "Experience letter",
  relieving: "Relieving letter",
  offer: "Offer letter",
  contract: "Employment contract",
};
export const KIND_TITLE: Record<LetterKind, string> = {
  experience: "Experience Certificate",
  relieving: "Relieving Letter",
  offer: "Offer Letter",
  contract: "Employment Contract",
};
export const isHireKind = (k: LetterKind): k is HireKind => k === "offer" || k === "contract";
export const REASON_LABEL: Record<ExitReason, string> = {
  resigned: "Resigned",
  contract_ended: "Contract ended",
  terminated: "Terminated",
  other: "Other",
};
export const CONDUCT_LABEL: Record<Conduct, string> = { excellent: "Excellent", good: "Good", satisfactory: "Satisfactory" };
export const PRONOUN_LABEL: Record<Pronoun, string> = { he: "He / his", she: "She / her", they: "They / their" };

const PRONOUNS: Record<Pronoun, { they: string; them: string; their: string }> = {
  he: { they: "he", them: "him", their: "his" },
  she: { they: "she", them: "her", their: "her" },
  they: { they: "they", them: "them", their: "their" },
};

/** Placeholders for offer letters and contracts. */
export const HIRE_PLACEHOLDERS = [
  ["{name}", "Full name"],
  ["{emp_code}", "Employee code"],
  ["{designation}", "Position"],
  ["{department}", "Department"],
  ["{company}", "Company name"],
  ["{start}", "Start / joining date"],
  ["{end}", "End date (contracts)"],
  ["{duration}", "Length of the contract, e.g. 6 months"],
  ["{salary}", "Monthly salary, e.g. Rs. 25,000"],
  ["{salary_words}", "Salary in words"],
  ["{they} {them} {their}", "He/him/his, she/her/her or they/them/their"],
  ["{They} {Their}", "Same, capitalised"],
] as const;

export const PLACEHOLDERS = [
  ["{name}", "Full name"],
  ["{emp_code}", "Employee code"],
  ["{designation}", "Designation"],
  ["{department}", "Department"],
  ["{company}", "Company name"],
  ["{from}", "Joining date"],
  ["{to}", "Last working day"],
  ["{duration}", "Time worked, e.g. 1 year 2 months"],
  ["{conduct}", "Excellent / good / satisfactory"],
  ["{they} {them} {their}", "He/him/his, she/her/her or they/them/their"],
  ["{They} {Their}", "Same, capitalised"],
] as const;

/** "5 January 2026" — the formal style used on letters. */
export function longDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

/** Whole years and months between two dates, counting the last day as worked. withDays adds leftover days (contracts). */
export function durationText(from: string, to: string, withDays = false) {
  const a = new Date(from + "T00:00:00Z");
  const b = new Date(to + "T00:00:00Z");
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return "—";
  b.setUTCDate(b.getUTCDate() + 1); // inclusive
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (months <= 0) {
    const days = Math.round((b.getTime() - a.getTime()) / 86_400_000);
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  const parts = [];
  if (y) parts.push(`${y} year${y === 1 ? "" : "s"}`);
  if (m) parts.push(`${m} month${m === 1 ? "" : "s"}`);
  if (withDays) {
    const c = new Date(a);
    c.setUTCMonth(c.getUTCMonth() + months);
    const d = Math.round((b.getTime() - c.getTime()) / 86_400_000);
    if (d > 0) parts.push(`${d} day${d === 1 ? "" : "s"}`);
  }
  return parts.join(" ");
}

export type LetterVars = {
  name: string;
  emp_code: string;
  designation: string;
  department: string | null;
  company: string;
  from: string;
  to: string | null;
  conduct: Conduct | null;
  pronoun: Pronoun;
  salary?: number | null;
};

/** "Rs. 25,000" or "Rs. 25,000.50" (PDF fonts have no ₹ sign). */
export function salaryText(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return "Rs. " + new Intl.NumberFormat("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n);
}

export type ContractState = "upcoming" | "current" | "ended";
/** Where today falls in a contract term. */
export function contractState(from: string, to: string | null, today: string): ContractState {
  if (today < from) return "upcoming";
  if (to && today > to) return "ended";
  return "current";
}

/** Whole days from today until the date (0 = today). */
export function daysUntil(today: string, date: string) {
  return Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Fill {placeholders}. Unknown placeholders are left as typed so mistakes are visible. */
export function renderTemplate(template: string, v: LetterVars) {
  const p = PRONOUNS[v.pronoun] ?? PRONOUNS.they;
  const map: Record<string, string> = {
    name: v.name,
    emp_code: v.emp_code,
    designation: v.designation || "—",
    department: v.department || "—",
    company: v.company,
    from: longDate(v.from),
    to: longDate(v.to),
    start: longDate(v.from),
    end: longDate(v.to),
    duration: v.to ? durationText(v.from, v.to, !!v.salary) : "—",
    salary: salaryText(v.salary),
    salary_words: v.salary ? amountInWords(v.salary) : "—",
    conduct: (v.conduct ?? "good").toLowerCase(),
    they: p.they,
    them: p.them,
    their: p.their,
    They: cap(p.they),
    Them: cap(p.them),
    Their: cap(p.their),
  };
  return template.replace(/\{(\w+)\}/g, (all, key: string) => map[key] ?? all);
}

/** QR / verification link printed on a letter. */
export function verifyUrl(origin: string, code: string) {
  return `${origin.replace(/\/$/, "")}/verify/${code}`;
}
