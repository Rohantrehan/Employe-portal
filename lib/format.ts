const TZ = "Asia/Kolkata";

/** "13 Nov 2026" (accepts "YYYY-MM-DD" or a Date/ISO string). */
export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + "T00:00:00+05:30") : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ }).format(d);
}

/** "₹25,000" or "₹38,750.50" (Indian digit grouping). Paise are shown whenever present, never rounded away. */
export function formatINR(value: number | string | null | undefined, opts: { decimals?: boolean } = {}) {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const showPaise = opts.decimals ?? Math.round(safe * 100) % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: showPaise ? 2 : 0,
    maximumFractionDigits: showPaise ? 2 : 0,
  }).format(safe);
}

/** Today's date in IST as "YYYY-MM-DD". */
export function todayIST() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** "+91 98765 43210" for Indian mobile numbers; other numbers are returned as stored. */
export function formatPhone(value: string | null | undefined) {
  if (!value) return "";
  const m = value.match(/^(?:\+?91)?([6-9]\d{4})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : value;
}
