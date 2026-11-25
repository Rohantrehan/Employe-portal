export type ChecklistKind = "onboarding" | "offboarding";
export type Owner = "employee" | "admin";
export type Applies = "all" | "short" | "long" | "pick";

/** A step in the company's list (Settings → Checklists). */
export type ChecklistItem = {
  id: string;
  kind: ChecklistKind;
  title: string;
  details: string | null;
  link_url: string | null;
  link_label: string | null;
  owner: Owner;
  ask_link: string | null;
  applies: Applies;
  key: string | null;
  sort_order: number;
};

/** One person's copy of a step. */
export type Task = {
  id: string;
  kind: ChecklistKind;
  item_id: string | null;
  item_key: string | null;
  title: string;
  details: string | null;
  link_url: string | null;
  link_label: string | null;
  owner: Owner;
  ask_link: string | null;
  sort_order: number;
  answer: string | null;
  done_at: string | null;
};

export const TASK_COLUMNS = "id, kind, item_id, item_key, title, details, link_url, link_label, owner, ask_link, sort_order, answer, done_at";
export const ITEM_COLUMNS = "id, kind, title, details, link_url, link_label, owner, ask_link, applies, key, sort_order";

export const APPLIES_LABEL: Record<Applies, string> = {
  all: "Everyone",
  short: "Contracts up to 4 months",
  long: "Contracts over 4 months",
  pick: "Only when picked",
};

export const sortTasks = <T extends { sort_order: number; title: string }>(t: T[]) =>
  [...t].sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));

/** Same rule as the database: a contract of up to 4 months (123 days) is "short". */
export function contractClass(from: string | null, to: string | null): "short" | "long" | null {
  if (!from || !to) return null;
  return (Date.parse(to) - Date.parse(from)) / 86_400_000 <= 123 ? "short" : "long";
}

/** Steps ticked by default when starting someone's list. */
export function defaultPick(items: ChecklistItem[], cls: "short" | "long" | null) {
  return items.filter((i) => i.applies === "all" || i.applies === cls).map((i) => i.id);
}

// ---------------------------------------------------------------------
// LinkedIn work anniversaries
// ---------------------------------------------------------------------
export const LINKEDIN_POST_URL = "https://www.linkedin.com/feed/?shareActive=true";
/** How long the "post about it" card stays up after the anniversary. */
export const ANNIVERSARY_WINDOW_DAYS = 30;

const addYears = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y + n, m - 1, d));
  if (dt.getUTCDate() !== d) dt.setUTCDate(0); // 29 Feb → 28 Feb
  return dt.toISOString().slice(0, 10);
};

/** The latest work anniversary on or before today, if it was in the last 30 days. */
export function recentAnniversary(joined: string | null, today: string): { years: number; date: string; daysSince: number } | null {
  if (!joined || joined >= today) return null;
  let years = Number(today.slice(0, 4)) - Number(joined.slice(0, 4));
  if (addYears(joined, years) > today) years -= 1;
  if (years < 1) return null;
  const date = addYears(joined, years);
  const daysSince = Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
  return daysSince <= ANNIVERSARY_WINDOW_DAYS ? { years, date, daysSince } : null;
}

export const yearsText = (n: number) => `${n} year${n === 1 ? "" : "s"}`;
