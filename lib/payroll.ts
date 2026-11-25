export type PayslipStatus = "draft" | "published";
export type PaymentStatus = "pending" | "paid";

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number) {
  return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
}

function belowThousand(n: number) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? belowHundred(r) : ""].filter(Boolean).join(" ");
}

/** Indian numbering: 2,45,300.50 → "Rupees Two Lakh Forty-Five Thousand Three Hundred and Fifty Paise Only" */
export function amountInWords(amount: number) {
  const rupees = Math.floor(Math.max(0, amount));
  const paise = Math.round((Math.max(0, amount) - rupees) * 100);
  if (rupees === 0 && paise === 0) return "Rupees Zero Only";

  const parts: string[] = [];
  let n = rupees;
  const crore = Math.floor(n / 1_00_00_000);
  n %= 1_00_00_000;
  const lakh = Math.floor(n / 1_00_000);
  n %= 1_00_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${crore >= 1000 ? amountInWords(crore).replace(/^Rupees |\sOnly$/g, "") : belowThousand(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));

  const words = parts.join(" ");
  const paiseText = paise ? `${words ? " and " : ""}${belowHundred(paise)} Paise` : "";
  return `Rupees ${words}${paiseText} Only`.replace(/\s+/g, " ");
}

/** "Rs. 2,45,300.00" (for PDFs, where the ₹ glyph isn't available) */
export function formatRs(value: number | string | null | undefined) {
  const raw = Number(value ?? 0);
  const n = Number.isFinite(raw) ? raw : 0;
  return (n < 0 ? "- " : "") + "Rs. " + new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));
}

export function monthTitle(month: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(month.slice(0, 7) + "-01T00:00:00Z"));
}

/* ---------- Performance rating → multiplier (same table as the database) ---------- */

export const RATINGS = [
  { value: 5, multiplier: 1.2, label: "Outstanding" },
  { value: 4.5, multiplier: 1.1, label: "Very good" },
  { value: 4, multiplier: 1.05, label: "Good" },
  { value: 3.5, multiplier: 1, label: "Neutral" },
  { value: 3, multiplier: 0.9, label: "Penalty" },
] as const;

export const DEFAULT_RATING = 4;

export function ratingInfo(rating: number | null | undefined) {
  return RATINGS.find((r) => r.value === Number(rating)) ?? null;
}

/** Performance bonus = (Basic + Excellence bonus) × (multiplier − 1). Negative at rating 3. */
export function performanceBonus(basic: number, excellence: number, rating: number) {
  const m = ratingInfo(rating)?.multiplier;
  if (m == null) return NaN;
  return Math.round((basic + excellence) * (m - 1) * 100) / 100;
}

/** "×1.10" */
export const multiplierText = (m: number) => `×${m.toFixed(2)}`;

/** First 10 days of the month, when last month's salaries are still being worked out. */
export const isSalaryWindow = (todayISO: string) => Number(todayISO.slice(8, 10)) <= 10;
