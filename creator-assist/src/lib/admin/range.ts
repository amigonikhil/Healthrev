import { addDays, todayIST } from "../dates";

export type RangeKey = "today" | "7d" | "30d" | "all" | "custom";
export type Range = {
  key: RangeKey; label: string;
  /** Inclusive IST dates; `from` is null for All time. */
  from: string | null; to: string;
  /** ISO bounds for queries. */
  fromIso: string | null; toIso: string;
  /** Same-length window just before, for "change vs previous period". */
  prevFromIso: string | null; prevToIso: string | null;
  days: string[];
};

export type SP = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const startIso = (d: string) => new Date(`${d}T00:00:00+05:30`).toISOString();
const endIso = (d: string) => new Date(`${d}T23:59:59.999+05:30`).toISOString();
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Date range picker state from the URL: ?range=today|7d|30d|all|custom&from=&to= (default 30d). */
export function parseRange(sp: SP, earliest = "2026-01-01"): Range {
  const today = todayIST();
  let key = (one(sp.range) || "30d") as RangeKey;
  let from: string | null, to = today;
  if (key === "today") from = today;
  else if (key === "7d") from = addDays(today, -6);
  else if (key === "all") from = null;
  else if (key === "custom" && isDate(one(sp.from)) && isDate(one(sp.to)) && one(sp.from) <= one(sp.to)) { from = one(sp.from); to = one(sp.to); }
  else { key = "30d"; from = addDays(today, -29); }
  const span = from ? Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1 : 0;
  const days: string[] = [];
  for (let d = from ?? earliest; d <= to && days.length < 400; d = addDays(d, 1)) days.push(d);
  const label = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", all: "All time", custom: `${from} → ${to}` }[key];
  return {
    key, label, from, to, days,
    fromIso: from ? startIso(from) : null, toIso: endIso(to),
    prevFromIso: from ? startIso(addDays(from, -span)) : null, prevToIso: from ? endIso(addDays(from, -1)) : null,
  };
}

/** Keeps the range (and other params) when linking between admin pages. */
export function qs(sp: SP, extra: Record<string, string | null> = {}): string {
  const p = new URLSearchParams();
  for (const k of ["range", "from", "to", "sample", "admins"]) if (one(sp[k])) p.set(k, one(sp[k]));
  for (const [k, v] of Object.entries(extra)) if (v === null) p.delete(k); else p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const inRange = (iso: string | null | undefined, r: Range) => !!iso && (!r.fromIso || iso >= r.fromIso) && iso <= r.toIso;
export const istDay = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3600e3).toISOString().slice(0, 10);
