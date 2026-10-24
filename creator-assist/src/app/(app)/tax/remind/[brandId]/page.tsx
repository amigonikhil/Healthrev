import { redirect } from "next/navigation";
import { Chip, Top } from "@/components/ui";
import { decrypt } from "@/lib/crypto";
import { loadViews } from "@/lib/data";
import { fmtDay, istDate } from "@/lib/dates";
import { STAGE_LABEL } from "@/lib/messages";
import { inr } from "@/lib/money";
import { taxHub } from "@/lib/tax";
import type { AisEntry, Reminder } from "@/lib/types";
import { TdsComposer } from "./composer";

export default async function TdsRemind({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const { db, views, today, profile } = await loadViews();
  const [{ data: ais }, { data: rems }] = await Promise.all([
    db.from("ais_entries").select("*"),
    db.from("reminders").select("*").eq("brand_id", brandId).eq("kind", "tds").order("scheduled_at"),
  ]);
  const payer = taxHub(views, (ais ?? []) as AisEntry[], today).payers.find((p) => p.brand.id === brandId);
  if (!payer) redirect("/tax");
  const b = payer.brand;
  const ladder = (rems ?? []) as Reminder[];
  const sentEmail = ladder.filter((r) => r.channel === "email" && r.sent_at);
  const rows = ladder.length
    ? ladder.filter((r) => r.channel === "email").map((r) => ({ label: `${STAGE_LABEL[r.stage] ?? r.stage} · ${fmtDay(istDate(r.scheduled_at))}`, chip: r.cancelled_at ? "Cancelled" : r.sent_at ? "Sent" : "Scheduled", tone: r.sent_at ? "ok" : "mute" }))
    : [
        { label: "Friendly · today", chip: "Ready", tone: "mute" },
        { label: "Follow-up · +7 days", chip: "Scheduled", tone: "mute" },
        { label: "Firm · +15 days", chip: "Scheduled", tone: "mute" },
      ];

  return (
    <main className="scr">
      <Top title="TDS reminder" fallback="/tax" />
      <p className="sub">{b.name} · {inr(payer.missing)} TDS missing from AIS</p>
      <div className="card">
        {rows.map((r) => <div className="row" key={r.label}><span>{r.label}</span><Chip tone={r.tone as "ok" | "mute"}>{r.chip}</Chip></div>)}
        {ladder.some((r) => r.channel === "whatsapp") && <p className="sub">{ladder.filter((r) => r.channel === "whatsapp").length} sent by you on WhatsApp</p>}
      </div>
      <TdsComposer
        brandId={b.id} contact={b.contact_name ?? ""} phone={b.contact_whatsapp} email={b.contact_email}
        amount={payer.missing} invoiceNos={payer.invoiceNos} pan={decrypt(profile.pan_enc) ?? profile.pan_masked ?? ""}
        creator={profile.name} defaultLang={profile.language} alreadyEmailed={sentEmail.length}
      />
    </main>
  );
}
