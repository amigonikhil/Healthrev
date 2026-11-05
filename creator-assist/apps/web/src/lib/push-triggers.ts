import "server-only";
import { addDays, fmtDay, todayIST } from "@creator-assist/shared/dates";
import { viewDeal } from "@creator-assist/shared/deal-view";
import { STAGE_LABEL } from "@creator-assist/shared/messages";
import { inr } from "@creator-assist/shared/money";
import { taxHub, upcomingFilings } from "@creator-assist/shared/tax";
import type { AisEntry, Filing, Profile } from "@creator-assist/shared/types";
import { DEAL_SELECT, normalizeDeal, toTax } from "./data";
import { pushHours, sendPush } from "./push";
import type { createAdminClient } from "./supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * The scheduled pushes, run by the hourly reminders cron (service role). Each one is sent
 * once per event (push_log) and only in the day (09:00–21:00 IST), so an event that comes
 * due at night notifies at the first run after 9 AM. Sample deals never notify.
 */
export async function runPushTriggers(db: Admin, now = new Date()): Promise<Record<string, number>> {
  const out = { whatsapp_due: 0, payment_due_today: 0, overdue: 0, tds_mismatch: 0, filing_due: 0 };
  if (!pushHours(now)) return out;
  const { data: tokenRows } = await db.from("push_tokens").select("user_id");
  const users = [...new Set((tokenRows ?? []).map((t) => t.user_id as string))];
  if (!users.length) return out;
  const today = todayIST(now);
  const { data: profRows } = await db.from("profiles").select("*").in("id", users);
  const profiles = new Map(((profRows ?? []) as Profile[]).map((p) => [p.id, p]));

  // 1. WhatsApp reminders that came due in the last 12 hours (click-to-send: the creator sends them).
  const since = new Date(now.getTime() - 12 * 3600_000).toISOString();
  const { data: rems } = await db.from("reminders")
    .select("id, user_id, kind, stage, deal_id, brand_id, scheduled_at, brand:brands(id, name, contact_whatsapp), deal:deals(id, status, brand:brands(id, name, contact_whatsapp))")
    .eq("channel", "email").eq("is_sample", false).is("cancelled_at", null)
    .gte("scheduled_at", since).lte("scheduled_at", now.toISOString()).in("user_id", users);
  for (const r of rems ?? []) {
    const p = profiles.get(r.user_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deal = (Array.isArray(r.deal) ? r.deal[0] : r.deal) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const brand = ((Array.isArray(r.brand) ? r.brand[0] : r.brand) ?? (Array.isArray(deal?.brand) ? deal.brand[0] : deal?.brand)) as any;
    if (!p?.remind_whatsapp || !brand?.contact_whatsapp || deal?.status === "paid") continue;
    const url = r.kind === "payment" && r.deal_id ? `/deals/${r.deal_id}/reminders` : `/tax/remind/${brand.id}`;
    const res = await sendPush(r.user_id, "whatsapp_due", {
      title: "Time to send a WhatsApp reminder",
      body: `${brand.name}: ${STAGE_LABEL[r.stage] ?? "Reminder"} (${r.kind === "tds" ? "TDS" : "payment"}). Tap to send it from your WhatsApp.`,
      url, ref: r.id,
    }, { prefs: p.push_prefs });
    out.whatsapp_due += res.sent ? 1 : 0;
  }

  // 2. Balances due today, and ones that went overdue in the last 3 days (covers missed runs).
  const { data: invs } = await db.from("invoices")
    .select("id, number, due_date, balance_due_paise, payments(amount_paise, tds_paise), deal:deals!inner(id, user_id, status, is_sample, brand:brands(name))")
    .gte("due_date", addDays(today, -3)).lte("due_date", today).eq("is_sample", false).in("deal.user_id", users);
  for (const inv of invs ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deal = (Array.isArray(inv.deal) ? inv.deal[0] : inv.deal) as any;
    if (!deal || deal.is_sample || deal.status === "paid") continue;
    const paid = (inv.payments ?? []).reduce((a: number, x: { amount_paise: number; tds_paise: number }) => a + x.amount_paise + x.tds_paise, 0);
    const left = inv.balance_due_paise - paid;
    if (left <= 0) continue;
    const brand = (Array.isArray(deal.brand) ? deal.brand[0] : deal.brand)?.name ?? "A brand";
    const p = profiles.get(deal.user_id);
    if (inv.due_date === today) {
      const res = await sendPush(deal.user_id, "payment_due_today", {
        title: `${brand}'s payment is due today`, body: `${inr(left)} due on invoice ${inv.number}.`, url: `/deals/${deal.id}`, ref: `due:${inv.id}`,
      }, { prefs: p?.push_prefs });
      out.payment_due_today += res.sent ? 1 : 0;
    } else {
      const res = await sendPush(deal.user_id, "overdue", {
        title: `${brand} is overdue`, body: `${inr(left)} was due ${fmtDay(inv.due_date)}. Send a reminder or mark it paid.`, url: `/deals/${deal.id}`, ref: `overdue:${inv.id}`,
      }, { prefs: p?.push_prefs });
      out.overdue += res.sent ? 1 : 0;
    }
  }

  // 3. Per creator with the app: TDS missing from AIS (once they've uploaded an AIS), and
  //    filings due in exactly 7 days that they haven't sent their CA yet.
  for (const uid of users) {
    const p = profiles.get(uid);
    if (!p) continue;
    const [{ data: dealRows }, { data: taxRow }, { data: ais }, { data: filings }] = await Promise.all([
      db.from("deals").select(DEAL_SELECT).eq("user_id", uid).eq("is_sample", false),
      db.from("tax_config").select("*").eq("user_id", uid).maybeSingle(),
      db.from("ais_entries").select("*").eq("user_id", uid).eq("is_sample", false),
      db.from("filings").select("*").eq("user_id", uid),
    ]);
    const tax = toTax(taxRow);
    const views = (dealRows ?? []).map((d) => viewDeal(normalizeDeal(d), p, tax, today));
    const hub = taxHub(views, (ais ?? []) as AisEntry[], today);
    if (p.ais_updated_at && hub.missingTotal > 0) {
      const n = hub.payers.filter((x) => x.missing > 0).length;
      const res = await sendPush(uid, "tds_mismatch", {
        title: "TDS missing from your AIS", body: `${inr(hub.missingTotal)} deducted by ${n} brand${n === 1 ? "" : "s"} isn't showing yet. Remind them to file it.`,
        url: "/tax", ref: `tds:${hub.fy}:${hub.missingTotal}`,
      }, { prefs: p.push_prefs });
      out.tds_mismatch += res.sent ? 1 : 0;
    }
    for (const c of upcomingFilings(views, p, (filings ?? []) as Filing[], today, hub)) {
      if (c.due !== addDays(today, 7) || c.filing?.data_sent_at) continue;
      const res = await sendPush(uid, "filing_due", {
        title: `${c.title} is due in 7 days`, body: `Due ${fmtDay(c.due)}. Send your summary to your CA from the Tax hub.`, url: "/tax", ref: `filing:${c.type}:${c.period}`,
      }, { prefs: p.push_prefs });
      out.filing_due += res.sent ? 1 : 0;
    }
  }
  return out;
}
