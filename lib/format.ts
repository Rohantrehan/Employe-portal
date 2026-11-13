const TZ = "Asia/Kolkata";

/** "13 Nov 2026" (accepts "YYYY-MM-DD" or a Date/ISO string). */
export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + "T00:00:00+05:30") : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ }).format(d);
}

/** "₹25,000" (Indian digit grouping). */
export function formatINR(value: number | string | null | undefined, opts: { decimals?: boolean } = {}) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  }).format(Number.isFinite(n) ? n : 0);
}

/** Today's date in IST as "YYYY-MM-DD". */
export function todayIST() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
