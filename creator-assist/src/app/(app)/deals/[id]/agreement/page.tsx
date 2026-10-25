import Link from "next/link";
import { Chip, Doc, Row, Top } from "@/components/ui";
import { buildAgreement } from "@/lib/agreement";
import { lateTerms } from "@/lib/calc";
import { decrypt } from "@/lib/crypto";
import { fmtDateLong, fmtDay, fmtTimeIST, todayIST, istDate } from "@/lib/dates";
import { loadDealView } from "@/lib/data";
import { siteUrl } from "@/lib/env";
import { SendPanel } from "./send";

export default async function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { v, profile, tax } = await loadDealView(id);
  const d = v.d;
  const a = d.agreement;
  const body = a?.body ?? buildAgreement({ profile, pan: decrypt(profile.pan_enc), brand: d.brand, deal: d, deliverables: d.deliverables, usage: d.usage, date: todayIST(), lateInterest: lateTerms(tax) });
  const contact = d.brand.contact_name || d.brand.name;

  return (
    <main className="scr">
      <Top title="Agreement" fallback={`/deals/${d.id}`} />
      <Chip tone="mute" style={{ alignSelf: "flex-start" }}>Paid collab · {d.paid_by === "agency" ? "via agency" : "brand direct"}</Chip>
      <Doc body={body} />

      {a?.status === "signed" ? (<>
        <div className="card">
          <h2>Signed</h2>
          <Row k="Signed by" v={`${a.signer_name}${a.signer_designation ? `, ${a.signer_designation}` : ""}`} />
          <Row k="When" v={`${fmtDateLong(istDate(a.signed_at!))}, ${fmtTimeIST(a.signed_at!)}`} />
          <Row k="Verified by" v={`Email OTP · ${a.signer_email}`} />
        </div>
        <a className="btn" href={`/api/agreements/${a.id}/pdf`}>Download PDF</a>
        <Link className="btn sec" href={`/deals/${d.id}`}>Back to deal</Link>
      </>) : (<>
        {a && (
          <div className="info">Sent {fmtDay(istDate(a.sent_at))}{a.viewed_at ? ` · opened ${fmtDay(istDate(a.viewed_at))}` : " · not opened yet"} · awaiting signature</div>
        )}
        <SendPanel
          dealId={d.id} contact={contact} email={d.brand.contact_email} whatsapp={d.brand.contact_whatsapp}
          existingLink={a ? `${siteUrl()}/s/${a.sign_token}` : null}
        />
      </>)}
    </main>
  );
}
