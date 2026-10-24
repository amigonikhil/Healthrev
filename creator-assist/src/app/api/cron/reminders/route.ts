import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { safeEqual } from "@/lib/crypto";
import { normalizeDeal } from "@/lib/data";
import { daysBetween, fmtDay, todayIST } from "@/lib/dates";
import { sendEmail, textToHtml } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { paymentMessage, STAGE_LABEL, tdsMessage } from "@/lib/messages";
import { inr } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Brand, DealFull, Profile, Reminder } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily (vercel.json). Sends due email reminders, marks overdue deals and
// emails each creator a digest of WhatsApp reminders that are due today.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new NextResponse("Unauthorized", { status: 401 });

  const db = createAdminClient();
  const today = todayIST();
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();

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
        dueDate: inv.due_date, daysToDue, stage: r.stage, msme: !!p.udyam_no && daysToDue < 0, creator: p.name,
      });
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
        sent++;
      }
    }
    // WhatsApp is click-to-send only: tell the creator it's time, once, on the day.
    if (p.remind_whatsapp && brand.contact_whatsapp && r.scheduled_at >= dayAgo && p.email) {
      const line = `• ${brand.name}: ${STAGE_LABEL[r.stage] ?? "Reminder"} (${r.kind === "tds" ? "TDS" : "payment"}) – ${siteUrl()}${waHref}`;
      digest.set(r.user_id, [...(digest.get(r.user_id) ?? []), line]);
    }
  }

  for (const [uid, lines] of digest) {
    const p = profiles.get(uid)!;
    await sendEmail({
      to: p.email!, subject: `WhatsApp reminders to send today (${fmtDay(today)})`,
      text: `Hi ${p.name.split(" ")[0]},\n\nThese reminders are due today. Tap a link, then "Send now on WhatsApp":\n\n${lines.join("\n")}\n\n– Creator Assist`,
    });
  }
  return NextResponse.json({ ok: true, due: reminders.length, sent, cancelled, digests: digest.size });
}
