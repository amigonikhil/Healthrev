// Dates are plain ISO 'YYYY-MM-DD' strings in India time. "Today" is IST.

const IST_OFFSET_MIN = 330;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function todayIST(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  return ist.toISOString().slice(0, 10);
}

const parse = (d: string) => new Date(d.slice(0, 10) + "T00:00:00Z");

export function addDays(d: string, n: number): string {
  const x = parse(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
}

/** IST calendar date of a timestamp. */
export function istDate(ts: string | Date): string {
  return todayIST(typeof ts === "string" ? new Date(ts) : ts);
}

/** 9:00 IST on the given date, as an ISO timestamp. */
export function nineAmIST(d: string): string {
  return new Date(parse(d).getTime() + (9 * 60 - IST_OFFSET_MIN) * 60_000).toISOString();
}

export const fmtDay = (d: string) => { const x = parse(d); return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`; };
export const fmtDate = (d: string) => { const x = parse(d); return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`; };
export const fmtDateLong = (d: string) => { const x = parse(d); return `${x.getUTCDate()} ${MONTHS_LONG[x.getUTCMonth()]} ${x.getUTCFullYear()}`; };
export const fmtWeekday = (d: string) => { const x = parse(d); return `${DAYS[x.getUTCDay()]}, ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`; };
export const fmtMonth = (d: string) => { const x = parse(d); return MONTHS_LONG[x.getUTCMonth()]; };

export function fmtTimeIST(ts: string): string {
  const x = new Date(new Date(ts).getTime() + IST_OFFSET_MIN * 60_000);
  let h = x.getUTCHours();
  const m = String(x.getUTCMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

/** Indian financial year (April–March) of a date: '2026-27'. */
export function fyOf(d: string): string {
  const x = parse(d);
  const y = x.getUTCMonth() >= 3 ? x.getUTCFullYear() : x.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export function fyRange(fy: string): { start: string; end: string } {
  const y = parseInt(fy.slice(0, 4), 10);
  return { start: `${y}-04-01`, end: `${y + 1}-03-31` };
}
