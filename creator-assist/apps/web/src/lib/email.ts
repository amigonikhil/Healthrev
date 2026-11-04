import "server-only";
import { Resend } from "resend";

export type SendResult = { sent: boolean; reason?: string };

const FROM = () => process.env.RESEND_FROM || "Creator Assist <noreply@example.com>";

/** Sends via Resend. Returns {sent:false} when Resend isn't configured instead of throwing. */
export async function sendEmail(msg: {
  to: string | string[]; subject: string; text: string; html?: string; cc?: string[]; replyTo?: string;
  attachments?: { filename: string; content: Buffer }[];
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key && process.env.DEV_MAILPIT_URL) return sendToMailpit(msg);
  if (!key) return { sent: false, reason: "Email is not configured yet" };
  const to = (Array.isArray(msg.to) ? msg.to : [msg.to]).filter(Boolean);
  if (!to.length) return { sent: false, reason: "No email address" };
  try {
    const { error } = await new Resend(key).emails.send({
      from: FROM(), to, cc: msg.cc?.filter(Boolean), subject: msg.subject, text: msg.text,
      html: msg.html ?? textToHtml(msg.text), replyTo: msg.replyTo, attachments: msg.attachments,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "Email failed" };
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function textToHtml(text: string, extra = ""): string {
  const body = esc(text).replace(/\n/g, "<br>");
  return `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#0F172A">${body}${extra}</div>`;
}

/** Local development only: deliver to the Supabase CLI's Mailpit inbox instead of Resend. */
async function sendToMailpit(msg: { to: string | string[]; subject: string; text: string; html?: string }): Promise<SendResult> {
  const to = (Array.isArray(msg.to) ? msg.to : [msg.to]).filter(Boolean).map((Email) => ({ Email }));
  const res = await fetch(`${process.env.DEV_MAILPIT_URL}/api/v1/send`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ From: { Email: "noreply@localhost", Name: "Creator Assist" }, To: to, Subject: msg.subject, Text: msg.text, HTML: msg.html ?? textToHtml(msg.text) }),
  });
  return res.ok ? { sent: true } : { sent: false, reason: `Mailpit ${res.status}` };
}
