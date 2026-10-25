import { redirect } from "next/navigation";
import { createProfile, provisionOwnerIfNeeded } from "@/app/actions/profile";
import { ProfileForm } from "@/components/profile-form";
import { getSession } from "@/lib/data";

export const metadata = { title: "Set up · Creator Assist" };

// Google sign-in gives us a display name; use it as a starting point (the user
// still confirms it matches their PAN).
const googleName = (m: Record<string, unknown> | undefined) => String(m?.full_name ?? m?.name ?? "");

export default async function Onboarding() {
  const { user, profile } = await getSession();
  if (profile) redirect("/home");
  // The demo owner skips onboarding and lands on a fully seeded account.
  if (await provisionOwnerIfNeeded()) redirect("/home");

  return (
    <main className="scr">
      <ProfileForm action={createProfile} mode="onboard" needPhone={!user.phone} defaults={{ email: user.email ?? "", name: googleName(user.user_metadata) }} />
    </main>
  );
}
