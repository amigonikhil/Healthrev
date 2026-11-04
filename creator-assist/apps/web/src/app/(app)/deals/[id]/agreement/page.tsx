import Link from "next/link";
import { Chip, Doc, Row, Top } from "@/components/ui";
import { fmtDateLong, fmtDay, fmtTimeIST, istDate } from "@creator-assist/shared/dates";
import { agreementView } from "@/server/agreements";
import { webCtx } from "@/server/context";
import { orRedirect } from "@/server/forms";
import { SendPanel } from "./send";

export default async function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { v, body, agreement: a, signLink } = await orRedirect(agreementView(await webCtx(), id), "/deals");
  const d = v.d;
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
        <a className="btn" href={`/api/v1/agreements/${a.id}/pdf`}>Download PDF</a>
        <Link className="btn sec" href={`/deals/${d.id}`}>Back to deal</Link>
      </>) : (<>
        {a && (
          <div className="info">Sent {fmtDay(istDate(a.sent_at))}{a.viewed_at ? ` · opened ${fmtDay(istDate(a.viewed_at))}` : " · not opened yet"} · awaiting signature</div>
        )}
        <SendPanel
          dealId={d.id} contact={contact} email={d.brand.contact_email} whatsapp={d.brand.contact_whatsapp}
          existingLink={signLink}
        />
      </>)}
    </main>
  );
}
