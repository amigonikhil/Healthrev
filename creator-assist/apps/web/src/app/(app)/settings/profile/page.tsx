import { updateProfile } from "@/app/actions/profile";
import { ProfileForm } from "@/components/profile-form";
import { Top } from "@/components/ui";
import { webCtx } from "@/server/context";

export default async function EditProfile() {
  const { profile: p } = await webCtx();
  return (
    <main className="scr">
      <Top title="Edit profile" fallback="/settings" />
      <ProfileForm
        action={updateProfile} mode="edit"
        defaults={{
          name: p.name, handle: p.handle ?? "", email: p.email ?? "", city: p.city ?? "", address: p.address ?? "", state: p.state,
          gstin: p.gstin ?? "", udyam: p.udyam_no ?? "", ifsc: p.ifsc ?? "", upi: p.upi ?? "", panMasked: p.pan_masked ?? "",
          bankLast4: p.bank_account_last4 ?? "", invoicePrefix: p.invoice_prefix,
        }}
      />
    </main>
  );
}
