// Reminder copy in English, Telugu-English and Hinglish. Pure functions so the
// reminders screen can re-render the bubble as toggles change.
import { fmtDay } from "./dates";
import { inr } from "./money";
import type { Lang } from "./types";

export const LANGS: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "te", label: "Telugu-Eng" },
  { value: "hi", label: "Hinglish" },
];

export const STAGES = ["friendly", "follow_up", "firm", "final"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<string, string> = {
  friendly: "Friendly", follow_up: "Follow-up", firm: "Firm", final: "Final notice", form16a: "Form 16A",
};
/** Ladder stage for the n-th configured offset (0, 7, 15, 30 …). */
export const stageAt = (i: number, n: number): Stage => (i >= n - 1 && n > 1 ? "final" : STAGES[Math.min(i, 2)]);

export type PaymentMsgInput = {
  lang: Lang;
  contact: string;
  invoiceNo: string;
  balance: number;     // paise
  dueDate: string;
  daysToDue: number;   // negative once overdue
  stage: string;
  msme: boolean;
  creator: string;
};

/** Editable in admin Settings. Placeholders: {contact} {amount} {invoice} {due} {days} {days_label} {when}. */
export type ReminderTemplates = Record<Lang, { upcoming: string; overdue: string }>;
export const DEFAULT_TEMPLATES: ReminderTemplates = {
  en: {
    overdue: "Hi {contact}, hope you are well. The balance of {amount} on invoice {invoice} was due on {due} and is now {days_label} overdue. Could you share an update on the payment date?",
    upcoming: "Hi {contact}, hope you are well. A gentle reminder that the balance of {amount} on invoice {invoice} is due {when}. Payment details are on the invoice. Thank you!",
  },
  te: {
    overdue: "Hi {contact} garu, invoice {invoice} balance {amount}, {due} ki due undi, ippudu {days} days overdue ayyindi. Payment eppudu vasthundo konchem update ivvagalara?",
    upcoming: "Hi {contact} garu, invoice {invoice} balance {amount}, {when} due undi. Payment details invoice lo unnayi. Thank you!",
  },
  hi: {
    overdue: "Hi {contact}, invoice {invoice} ka balance {amount}, {due} ko due tha, ab {days} din overdue hai. Payment kab tak ho jayega, please update kar dijiye?",
    upcoming: "Hi {contact}, invoice {invoice} ka balance {amount} {when} due hai. Payment details invoice mein hain. Thank you!",
  },
};
const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);

export function paymentMessage(m: PaymentMsgInput, templates: ReminderTemplates = DEFAULT_TEMPLATES): string {
  const c = m.contact || "there";
  const due = fmtDay(m.dueDate);
  const d = Math.max(0, -m.daysToDue);
  const today = m.daysToDue === 0;
  const when = { en: today ? "today" : `on ${due}`, te: today ? "ivala" : `${due} ki`, hi: today ? "aaj" : `${due} ko` }[m.lang];
  const vars = { contact: c, amount: inr(m.balance), invoice: m.invoiceNo, due, days: String(d), days_label: `${d} day${d === 1 ? "" : "s"}`, when };
  const t = templates[m.lang] ?? DEFAULT_TEMPLATES[m.lang];
  let body = fill(d > 0 ? t.overdue : t.upcoming, vars);
  if (m.stage === "final") {
    body += {
      en: " This is a final reminder before I escalate the matter.",
      te: " Idi final reminder, tarvata escalate cheyalsi vasthundi.",
      hi: " Yeh final reminder hai, iske baad mujhe escalate karna padega.",
    }[m.lang];
  }
  if (m.msme) {
    body += {
      en: "\n\nAs an MSME-registered supplier, interest applies to payments after the agreed date.",
      te: "\n\nNenu MSME registered supplier ni, so late payment ki interest apply avuthundi.",
      hi: "\n\nMain MSME registered supplier hoon, isliye late payment par interest lagta hai.",
    }[m.lang];
  }
  return `${body}\n\n– ${m.creator}`;
}

export function tdsMessage(m: { lang: Lang; contact: string; amount: number; invoiceNos: string[]; pan: string; creator: string }): string {
  const c = m.contact || "there";
  const inv = m.invoiceNos.join(", ");
  const plural = m.invoiceNos.length > 1 ? "invoices" : "invoice";
  const body = {
    en: `Hi ${c}, the TDS of ${inr(m.amount)} deducted on ${plural} ${inv} is not showing in my AIS (PAN ${m.pan}). Could you check that the TDS return has been filed and share Form 16A?`,
    te: `Hi ${c} garu, ${plural} ${inv} meeda deduct chesina TDS ${inr(m.amount)} naa AIS lo kanipinchatledu (PAN ${m.pan}). TDS return file ayyindo check chesi Form 16A share cheyagalara?`,
    hi: `Hi ${c}, ${plural} ${inv} par kata gaya TDS ${inr(m.amount)} mere AIS mein nahi dikh raha (PAN ${m.pan}). Please check kar lijiye ki TDS return file hua hai aur Form 16A share kar dijiye?`,
  }[m.lang];
  return `${body}\n\n– ${m.creator}`;
}

export function form16aMessage(m: { contact: string; amount: number; invoiceNo: string; creator: string }): string {
  return `Hi ${m.contact || "there"}, thank you for the payment against invoice ${m.invoiceNo}. Please share Form 16A for the TDS of ${inr(m.amount)} once the quarterly TDS return is filed.\n\n– ${m.creator}`;
}

/** wa.me click-to-send link. No automation: the creator presses send. */
export function waLink(phone: string | null | undefined, text: string): string {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) digits = "91" + digits;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
