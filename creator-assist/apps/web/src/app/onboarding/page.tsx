import { redirect } from "next/navigation";
import { createProfile } from "@/app/actions/profile";
import { FeedbackButton } from "@/components/feedback";
import { ProfileForm } from "@/components/profile-form";
import { webSession } from "@/server/context";
import { provisionOwnerIfNeeded } from "@/server/profile";

export const metadata = { title: "Set up · Creator Assist" };

// Google sign-in gives us a display name; use it as a starting point (the user
// still confirms it matches their PAN).
const googleName = (m: Record<string, unknown> | undefined) => String(m?.full_name ?? m?.name ?? "");

export default async function Onboarding() {
  const session = await webSession();
  const { user, profile } = session;
  if (profile) redirect("/home");
  // The demo owner skips onboarding and lands on a fully seeded account.
  if (await provisionOwnerIfNeeded(session)) redirect("/home");

  return (
    <main className="scr">
      <div className="top" style={{ justifyContent: "space-between", minHeight: 44 }}>
        <p className="sub" style={{ fontWeight: 700 }}>Creator Assist · set up</p>
        <FeedbackButton />
      </div>
      <ProfileForm action={createProfile} mode="onboard" needPhone={!user.phone} defaults={{ email: user.email ?? "", name: googleName(user.user_metadata) }} />
    </main>
  );
}
