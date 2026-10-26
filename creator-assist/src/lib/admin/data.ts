import "server-only";
import { NOTICE_DAYS } from "../advocate";
import { addDays, daysBetween, istDate, todayIST } from "../dates";
import type { DB } from "../supabase/server";
import { adminIds } from "./auth";
import { redact } from "./privacy";
import { inRange, one, type SP } from "./range";

export type Filters = { sample: boolean; admins: boolean };
export const filtersOf = (sp: SP): Filters => ({ sample: one(sp.sample) === "1", admins: one(sp.admins) === "1" });

export type Ev = { user_id: string | null; anon_id: string | null; event_name: string; screen: string | null; properties: Record<string, string>; is_sample: boolean; created_at: string };

/** Events from `sinceIso`, without sample data or admins' own activity unless asked for. */
export async function loadEvents(db: DB, sinceIso: string | null, f: Filters, names?: string[]): Promise<Ev[]> {
  const exclude = f.admins ? [] : await adminIds(db);
  const out: Ev[] = [];
  for (let page = 0; page < 20; page++) {
    let q = db.from("events").select("user_id, anon_id, event_name, screen, properties, is_sample, created_at").order("created_at", { ascending: true }).range(page * 5000, page * 5000 + 4999);
    if (sinceIso) q = q.gte("created_at", sinceIso);
    if (!f.sample) q = q.eq("is_sample", false);
    if (names) q = q.in("event_name", names);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Ev[]));
    if ((data ?? []).length < 5000) break;
  }
  return exclude.length ? out.filter((e) => !e.user_id || !exclude.includes(e.user_id)) : out;
}

/** "Active" = did at least one of these (ADMIN.md §3). */
export const isActiveEvent = (e: Ev) =>
  ["deal_created", "reminder_sent", "payment_recorded"].includes(e.event_name) || (e.event_name === "page_view" && e.screen === "/tax");

export const FEATURES: { key: string; label: string; match: (e: Ev) => boolean }[] = [
  { key: "deal_created", label: "New deal", match: (e) => e.event_name === "deal_created" },
  { key: "agreement_sent", label: "Agreement sent", match: (e) => e.event_name === "agreement_sent" },
  { key: "agreement_signed", label: "Agreement signed by brand", match: (e) => e.event_name === "agreement_signed" },
  { key: "invoice_generated", label: "Invoice", match: (e) => e.event_name === "invoice_generated" },
  { key: "reminder_sent", label: "Reminder", match: (e) => e.event_name === "reminder_sent" },
  { key: "payment_recorded", label: "Payment recorded", match: (e) => e.event_name === "payment_recorded" },
  { key: "escalation_opened", label: "Escalation opened", match: (e) => e.event_name === "escalation_opened" },
  { key: "tax_hub", label: "Tax hub visited", match: (e) => e.event_name === "page_view" && e.screen === "/tax" },
  { key: "ais_uploaded", label: "AIS uploaded", match: (e) => e.event_name === "ais_uploaded" },
  { key: "filing_option_chosen", label: "Filing option chosen", match: (e) => e.event_name === "filing_option_chosen" },
];

export const EVENT_LABEL: Record<string, string> = {
  signed_up: "Signed up", signed_in: "Signed in", onboarding_completed: "Onboarded", sample_loaded: "Loaded sample data", sample_cleared: "Cleared sample data",
  deal_created: "Deal created", agreement_sent: "Agreement sent", agreement_signed: "Agreement signed", invoice_generated: "Invoice generated",
  invoice_sent: "Invoice sent", reminder_sent: "Reminder sent", payment_recorded: "Payment recorded", escalation_opened: "Escalation opened",
  legal_call_booked: "Legal call booked", ais_uploaded: "AIS uploaded", filing_option_chosen: "Filing option chosen", filing_data_sent: "Filing data sent",
  ai_call_booked: "AI call booked", feedback_sent: "Feedback sent", page_view: "Screen view", signin_opened: "Sign-in opened",
  otp_requested: "OTP requested", otp_verified: "OTP verified", whatsapp_clicked: "WhatsApp link clicked",
};

export type Person = { id: string; name: string | null; handle: string | null; city: string | null; state: string | null; phone: string | null; email: string | null; created_at: string; onboarded_at: string | null; sample: boolean };

/** Everyone with an account (auth users + profiles). Admins are dropped unless asked for. */
export async function loadPeople(db: DB, f: Filters): Promise<Person[]> {
  const admin = db as unknown as { auth: { admin: { listUsers: (o: { page: number; perPage: number }) => Promise<{ data: { users: { id: string; email?: string; phone?: string; created_at: string }[] } }> } } };
  const users: { id: string; email?: string; phone?: string; created_at: string }[] = [];
  for (let page = 1; page < 50; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    users.push(...(data?.users ?? []));
    if ((data?.users ?? []).length < 1000) break;
  }
  const { data: profiles } = await db.from("profiles").select("id, name, handle, city, state, phone, email, consent_at, sample_seeded_at");
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const exclude = f.admins ? [] : await adminIds(db);
  return users.filter((u) => !exclude.includes(u.id)).map((u) => {
    const p = byId.get(u.id);
    return {
      id: u.id, name: p?.name ?? null, handle: p?.handle ?? null, city: p?.city ?? null, state: p?.state ?? null,
      phone: p?.phone ?? (u.phone ? `+${u.phone}` : null), email: p?.email ?? u.email ?? null,
      created_at: u.created_at, onboarded_at: p?.consent_at ?? null, sample: !!p?.sample_seeded_at,
    };
  });
}

// ---------------------------------------------------------------- queues
export type QueueKind = "lawyer_notice" | "ai_call" | "filing" | "ais_upload" | "legal_call";
export const QUEUE_TABS: { kind: QueueKind; label: string }[] = [
  { kind: "lawyer_notice", label: "Lawyer notices" },
  { kind: "ai_call", label: "AI call bookings" },
  { kind: "filing", label: "Filing requests" },
  { kind: "ais_upload", label: "AIS uploads" },
  { kind: "legal_call", label: "Legal calls (₹599)" },
];
export const QUEUE_STATUSES = ["new", "in_review", "done", "rejected"] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export type QueueItem = {
  kind: QueueKind; id: string; user_id: string; created_at: string; status: QueueStatus; note: string | null; sample: boolean;
  fields: Record<string, string | number | boolean | null>;
};

/** All queue items (each request type from its own table, status from queue_state). */
export async function loadQueues(db: DB, f: Filters): Promise<QueueItem[]> {
  const today = todayIST();
  const [esc, ai, filings, uploads, calls, states] = await Promise.all([
    db.from("escalations").select("id, user_id, status, channel, draft, is_sample, created_at, deal:deals(id, brand:brands(name), invoices(due_date, balance_due_paise, payments(amount_paise, tds_paise)))")
      .eq("type", "lawyer_notice").order("created_at", { ascending: false }).limit(1000),
    db.from("ai_call_bookings").select("*").order("created_at", { ascending: false }).limit(1000),
    db.from("filings").select("*").eq("handled_by", "creator_assist").order("due_date", { ascending: true }).limit(1000),
    db.from("ais_uploads").select("*").order("created_at", { ascending: false }).limit(1000),
    db.from("legal_call_bookings").select("*, deal:deals(brand:brands(name))").order("created_at", { ascending: false }).limit(1000),
    db.from("queue_state").select("*"),
  ]);
  const st = new Map((states.data ?? []).map((s) => [`${s.kind}:${s.source_id}`, s]));
  const pick = (kind: QueueKind, id: string) => { const s = st.get(`${kind}:${id}`); return { status: (s?.status ?? "new") as QueueStatus, note: (s?.note ?? null) as string | null }; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const one1 = (x: any) => (Array.isArray(x) ? x[0] : x);
  const items: QueueItem[] = [];
  for (const e of esc.data ?? []) {
    const deal = one1(e.deal); const inv = one1(deal?.invoices);
    const paid = (inv?.payments ?? []).reduce((a: number, p: { amount_paise: number; tds_paise: number }) => a + p.amount_paise + p.tds_paise, 0);
    items.push({ kind: "lawyer_notice", id: e.id, user_id: e.user_id, created_at: e.created_at, sample: e.is_sample, ...pick("lawyer_notice", e.id), fields: {
      brand: one1(deal?.brand)?.name ?? "—", amount: inv ? Math.max(0, inv.balance_due_paise - paid) : 0,
      days_overdue: inv ? Math.max(0, daysBetween(inv.due_date, today)) : 0, channel: e.channel, pay_by: addDays(istDate(e.created_at), NOTICE_DAYS),
      draft: e.draft ? redact(e.draft) : null,
    } });
  }
  for (const a of ai.data ?? []) items.push({ kind: "ai_call", id: a.id, user_id: a.user_id, created_at: a.created_at, sample: false, ...pick("ai_call", a.id), fields: { slot: a.slot, language: a.language, consent: a.consent } });
  for (const x of filings.data ?? []) items.push({ kind: "filing", id: x.id, user_id: x.user_id, created_at: x.data_sent_at ?? x.created_at, sample: x.is_sample, ...pick("filing", x.id), fields: { type: x.type, period: x.period, due_date: x.due_date, handled_by: x.handled_by, data_sent_at: x.data_sent_at } });
  for (const u of uploads.data ?? []) items.push({ kind: "ais_upload", id: u.id, user_id: u.user_id, created_at: u.created_at, sample: false, ...pick("ais_upload", u.id), fields: { fy: u.fy, parsed: u.parsed, entries: u.entries, mismatches: u.mismatches } });
  for (const c of calls.data ?? []) items.push({ kind: "legal_call", id: c.id, user_id: c.user_id, created_at: c.created_at, sample: c.is_sample, ...pick("legal_call", c.id), fields: { slot: c.slot, brand: one1(one1(c.deal)?.brand)?.name ?? "—", note: c.note ? redact(c.note) : null } });
  const exclude = f.admins ? [] : await adminIds(db);
  return items.filter((i) => (f.sample || !i.sample) && !exclude.includes(i.user_id));
}

export const waitingHours = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 3600e3));
export const waitingLabel = (iso: string) => { const h = waitingHours(iso); return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`; };

export const inR = inRange;
