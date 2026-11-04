// Home and Brands summaries, computed from deal views so every app shows the same numbers.
import { addDays, daysBetween } from "./dates";
import { sumAmounts, type DealView, type Tone } from "./deal-view";
import type { Brand } from "./types";

const ORDER = { overdue: 0, due: 1, sign: 2, ready: 3, draft: 4, paid: 5 } as const;

export type HomeNumbers = {
  owed: { due: number; afterTds: number };
  openCount: number;
  overdue: number;
  dueThisWeek: number;
  tdsPending: number;
  /** Unpaid deals, most urgent first. */
  attention: DealView[];
};

export function homeNumbers(views: DealView[], today: string): HomeNumbers {
  const open = views.filter((v) => v.phase === "overdue" || v.phase === "due");
  const weekEnd = addDays(today, 6);
  return {
    owed: sumAmounts(open),
    openCount: open.length,
    overdue: views.filter((v) => v.phase === "overdue").reduce((a, v) => a + v.remaining, 0),
    dueThisWeek: open.filter((v) => v.dueDate! >= today && v.dueDate! <= weekEnd).reduce((a, v) => a + v.remaining, 0),
    tdsPending: open.reduce((a, v) => a + v.tdsRemaining, 0),
    attention: views
      .filter((v) => v.phase !== "paid")
      .sort((a, b) => ORDER[a.phase] - ORDER[b.phase] || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9")),
  };
}

/** How a brand pays, from its deals: slow payer, paid on time / late, agreement pending, or new. */
export function brandBehaviour(vs: DealView[], today: string): { sub: string; chip: string; tone: Tone } {
  const b = vs[0].d.brand;
  const who = b.agency_name ? `via ${b.agency_name} · ${b.contact_name ?? ""}` : b.contact_name ?? b.city ?? "";
  const paid = vs.filter((v) => v.phase === "paid" && v.paidOn && v.d.invoice);
  const overdue = vs.filter((v) => v.phase === "overdue");
  if (overdue.length) {
    const days = Math.max(...overdue.map((v) => daysBetween(v.d.invoice!.invoice_date, today)));
    return { sub: `${b.contact_name ?? ""} · pays in ~${days} days`, chip: "Slow payer", tone: "over" };
  }
  if (paid.length) {
    const avg = Math.round(paid.reduce((a, v) => a + daysBetween(v.d.invoice!.invoice_date, v.paidOn!), 0) / paid.length);
    const late = paid.some((v) => v.paidOn! > v.d.invoice!.due_date);
    return { sub: `${b.contact_name ?? ""} · paid in ${avg} days`, chip: late ? "Paid late" : "On time", tone: late ? "info" : "ok" };
  }
  if (vs.some((v) => v.phase === "sign")) return { sub: `${b.contact_name ?? ""} · agreement pending`, chip: "To sign", tone: "info" };
  return { sub: who || (b.city ?? ""), chip: "New", tone: "mute" };
}

export type BrandRow = {
  brand: Brand; sub: string; chip: string; tone: Tone;
  /** Still owed: what's due across unpaid deals; fully paid brands show what they paid. */
  amount: { due: number; afterTds: number; label: "due" | "paid" };
  /** The deal a tap on the brand opens: its first unpaid deal, else its first deal. */
  open: DealView;
};

export function brandRows(views: DealView[], today: string): BrandRow[] {
  const groups = new Map<string, DealView[]>();
  for (const v of views) groups.set(v.d.brand.id, [...(groups.get(v.d.brand.id) ?? []), v]);
  return [...groups.values()].map((vs) => {
    const unpaid = vs.filter((v) => v.phase !== "paid");
    const amount = unpaid.length ? { ...sumAmounts(unpaid), label: "due" as const } : { ...sumAmounts(vs), label: "paid" as const };
    return { brand: vs[0].d.brand, ...brandBehaviour(vs, today), amount, open: unpaid[0] ?? vs[0] };
  });
}
