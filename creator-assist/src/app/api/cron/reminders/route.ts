import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { reminderTemplates } from "@/lib/app-settings";
import { track } from "@/lib/events";
import { safeEqual } from "@/lib/crypto";
import { normalizeDeal } from "@/lib/data";
import { daysBetween, fmtDay, todayIST } from "@/lib/dates";
import { sendEmail, textToHtml } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { paymentMessage, STAGE_LABEL, tdsMessage } from "@/lib/messages";
import { inr } from "@/lib/money";
import { everyHours, noticeDueAt } from "@/lib/reminder-schedule";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Brand, DealFull, Profile, Reminder } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Hourly (Supabase pg_cron calls this; vercel.json keeps a daily backup run).
// Marks overdue deals, emails reminders that have come due, emails each creator
// the WhatsApp reminders that just came due, and once per deal tells the creator
// it's time to send the legal notice (never sent automatically).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new NextResponse("Unauthorized", { status: 401 });

  const db = createAdminClient();
  const today = todayIST();
  const now = new Date();
  // WhatsApp nudges only for reminders that came due since the last hourly run.
  const justDue = new Date(now.getTime() - 70 * 60_000).toISOString();

  // 1. Invoiced deals past their due date become overdue.
  const { data: dueInv } = await db.from("invoices").select("deal_id").lt("due_date", today).eq("is_sample", false);
  if (dueInv?.length) {
    await db.from("deals").update({ status: "overdue" }).in("id", dueInv.map((i) => i.deal_id)).eq("status", "invoiced");
  }

  // 2. Due reminders.
  const { data: rows } = await db.from("reminders").select("*")
    .is("sent_at", null).is("cancelled_at", null).eq("is_sample", false).eq("channel", "email")
    .lte("scheduled_at", now.toISOString()).order("scheduled_at").limit(300);
  const reminders = (rows ?? []) as (Reminder & { user_id: string })[];
  const profiles = new Map<string, Profile>();
  const deals = new Map<string, DealFull>();
  const userIds = [...new Set(reminders.map((r) => r.user_id))];
  if (userIds.length) {
    const { data } = await db.from("profiles").select("*").in("id", userIds);
    for (const p of (data ?? []) as Profile[]) profiles.set(p.id, p);
  }
  const dealIds = [...new Set(reminders.map((r) => r.deal_id).filter(Boolean))] as string[];
  if (dealIds.length) {
    const { data } = await db.from("deals").select("*, brand:brands(*), deliverables:deal_deliverables(*), usage:usage_rights(*), invoice:invoices(*, payments(*)), agreements(*), reminders(*), escalations(*)").in("id", dealIds);
    for (const d of data ?? []) deals.set(d.id, normalizeDeal(d));
  }

  const templates = await reminderTemplates();
  const digest = new Map<string, string[]>();
  let sent = 0, cancelled = 0;
  for (const r of reminders) {
    const p = profiles.get(r.user_id);
    if (!p) continue;
    const deal = r.deal_id ? deals.get(r.deal_id) : null;
    let brand: Brand | null = deal?.brand ?? null;
    if (!brand && r.brand_id) {
      const { data } = await db.from("brands").select("*").eq("id", r.brand_id).single<Brand>();
      brand = data;
    }
    if (!brand) continue;

    let text = r.message ?? "";
    let subject = `Reminder from ${p.name}`;
    let waHref = "/tax";
    if (r.kind === "payment") {
      const inv = deal?.invoice;
      const paid = inv ? inv.payments.reduce((a, x) => a + x.amount_paise + x.tds_paise, 0) : 0;
      const remaining = inv ? inv.balance_due_paise - paid : 0;
      if (!deal || !inv || deal.status === "paid" || remaining <= 0) {
        await db.from("reminders").update({ cancelled_at: now.toISOString() }).eq("id", r.id);
        cancelled++;
        continue;
      }
      const daysToDue = daysBetween(today, inv.due_date);
      text = paymentMessage({
        lang: r.language, contact: (brand.contact_name ?? "").split(" ")[0], invoiceNo: inv.number, balance: remaining,
        dueDate: inv.due_date, daysToDue, stage: r.stage, msme: false, creator: p.name, // MSME interest is off by default; the creator adds it by hand from the Firm stage
      }, templates);
      subject = `Payment reminder: invoice ${inv.number} (${inr(remaining)})`;
      waHref = `/deals/${deal.id}/reminders`;
    } else if (r.kind === "tds" && !text) {
      text = tdsMessage({ lang: r.language, contact: (brand.contact_name ?? "").split(" ")[0], amount: 0, invoiceNos: [], pan: p.pan_masked ?? "", creator: p.name })
        .replace(/the TDS of ₹0 deducted on invoice /, "the TDS deducted on my invoices ");
      subject = `TDS not showing in AIS – ${p.name}`;
      waHref = `/tax/remind/${brand.id}`;
    } else if (r.kind === "tds") {
      subject = `Form 16A request from ${p.name}`;
    }

    // Email the brand automatically if the creator has that switched on.
    if (p.remind_email && brand.contact_email) {
      const pixel = `<img src="${siteUrl()}/api/r/${r.id}" width="1" height="1" alt="" style="display:none">`;
      const res = await sendEmail({
        to: brand.contact_email, cc: brand.cc_email ? [brand.cc_email] : undefined, replyTo: p.email ?? undefined,
        subject, text, html: textToHtml(text, pixel),
      });
      if (res.sent) {
        await db.from("reminders").update({ sent_at: now.toISOString(), message: text }).eq("id", r.id);
        await audit(db, r.user_id, "reminder_sent", "reminder", r.id, { channel: "email", kind: r.kind, stage: r.stage, auto: true });
        await track(r.user_id, "reminder_sent", { props: { channel: "email", kind: r.kind, auto: "true", deal_id: r.deal_id } });
        sent++;
      }
    }
    // WhatsApp is click-to-send only: tell the creator it's time, once, on the day.
    if (p.remind_whatsapp && brand.contact_whatsapp && r.scheduled_at >= justDue && p.email) {
      const line = `• ${brand.name}: ${STAGE_LABEL[r.stage] ?? "Reminder"} (${r.kind === "tds" ? "TDS" : "payment"}) – ${siteUrl()}${waHref}`;
      digest.set(r.user_id, [...(digest.get(r.user_id) ?? []), line]);
    }
  }

  for (const [uid, lines] of digest) {
    const p = profiles.get(uid)!;
    await sendEmail({
      to: p.email!, subject: `WhatsApp reminders to send now (${fmtDay(today)})`,
      text: `Hi ${p.name.split(" ")[0]},\n\nThese reminders are due now. Tap a link, then "Send now on WhatsApp":\n\n${lines.join("\n")}\n\n– Creator Assist`,
    });
  }

  // 3. Every reminder has gone out and the interval after the last one has passed:
  //    prompt the creator (once) to send the legal notice.
  let prompted = 0;
  const { data: overdue } = await db.from("deals")
    .select("*, brand:brands(*), deliverables:deal_deliverables(*), usage:usage_rights(*), invoice:invoices(*, payments(*)), agreements(*), reminders(*), escalations(*)")
    .eq("status", "overdue").eq("is_sample", false).is("notice_prompted_at", null).limit(200);
  for (const row of overdue ?? []) {
    const deal = normalizeDeal(row);
    const p = profiles.get(deal.user_id) ?? (await db.from("profiles").select("*").eq("id", deal.user_id).single<Profile>()).data;
    const inv = deal.invoice;
    if (!p || !inv || !p.email) continue;
    const paid = inv.payments.reduce((a, x) => a + x.amount_paise + x.tds_paise, 0);
    const remaining = inv.balance_due_paise - paid;
    const ladder = deal.reminders.filter((r) => r.kind === "payment" && r.channel === "email" && !r.cancelled_at).map((r) => r.scheduled_at).sort();
    if (remaining <= 0 || !ladder.length || deal.escalations.some((e) => e.type === "lawyer_notice" && e.status === "sent")) continue;
    if (Date.parse(noticeDueAt(ladder.at(-1)!, everyHours(p.remind_every_hours))) > now.getTime()) continue;
    const r = await sendEmail({
      to: p.email, subject: `Time to send the legal notice to ${deal.brand.name} (${inr(remaining)} unpaid)`,
      text: `Hi ${p.name.split(" ")[0]},\n\n${deal.brand.name} hasn't paid invoice ${inv.number} after ${ladder.length} reminders. ${inr(remaining)} is still unpaid.\n\nReview and send the legal notice here (nothing goes to the brand until you press send):\n${siteUrl()}/deals/${deal.id}/notice\n\n– Creator Assist`,
    });
    if (r.sent) {
      await db.from("deals").update({ notice_prompted_at: now.toISOString() }).eq("id", deal.id);
      prompted++;
    }
  }
  return NextResponse.json({ ok: true, due: reminders.length, sent, cancelled, digests: digest.size, notice_prompts: prompted });
}
