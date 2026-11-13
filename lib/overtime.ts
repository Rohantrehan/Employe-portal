export type OvertimeStatus = "pending" | "approved" | "rejected" | "cancelled";

/** 2.5 → "2h 30m", 1 → "1h", 0.25 → "15m" */
export function formatHours(hours: number | string | null | undefined) {
  const total = Math.round(Number(hours ?? 0) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h && !m) return "0h";
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
}

/** Extra time beyond a standard 8-hour day, rounded down to the quarter hour. */
export function extraFromMinutes(workedMinutes: number, standardMinutes = 480) {
  return Math.floor(Math.max(0, workedMinutes - standardMinutes) / 15) / 4;
}

export function monthLabel(month: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(month + "-01T00:00:00Z"));
}

export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
