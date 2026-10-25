import { byToken, markViewed } from "@/lib/sign";
import { Doc, Done } from "@/components/ui";
import { fmtDateLong, fmtTimeIST, istDate } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AgreementBody } from "@/lib/types";
import { SignForm } from "./form";

export const metadata = { title: "Review and sign · Creator Assist", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const a = await byToken(token);
  if (!a) {
    return (
      <main className="scr calm">
        <Done icon="?" tone="info" title="Link not found">
          <p className="sub">This signing link is invalid or has been withdrawn. Ask the creator to send it again.</p>
        </Done>
      </main>
    );
  }
  const { data: creator } = await createAdminClient().from("profiles").select("name").eq("id", a.user_id).single();
  const creatorName = creator?.name ?? "A creator";

  if (a.status === "signed") {
    return (
      <main className="scr calm">
        <Done icon="✓" title="Agreement signed">
          <p className="sub">
            Signed by {a.signer_name} on {fmtDateLong(istDate(a.signed_at!))}, {fmtTimeIST(a.signed_at!)}.
            {a.is_sample ? " (Sample agreement: no emails were sent.)" : " A copy has been emailed to both of you."}
          </p>
          <a className="btn" href={`/api/s/${token}/pdf`}>Download PDF copy</a>
        </Done>
      </main>
    );
  }

  await markViewed(a);
  return (
    <main className="scr calm">
      <h1>{creatorName} sent you an agreement</h1>
      <p className="sub">Review the terms and sign. It takes about a minute.</p>
      <Doc body={a.body as AgreementBody} />
      <SignForm token={token} brand={a.deal.brand.legal_name || a.deal.brand.name} email={a.deal.brand.contact_email ?? ""} />
      <p className="sub" style={{ textAlign: "center" }}>Secured by Creator Assist. Your email is used only to verify this signature.</p>
    </main>
  );
}
