import { redirect } from "next/navigation";
import { createProfile, provisionOwnerIfNeeded } from "@/app/actions/profile";
import { ProfileForm } from "@/components/profile-form";
import { getSession } from "@/lib/data";

export const metadata = { title: "Set up · Creator Assist" };

export default async function Onboarding() {
  const { user, profile } = await getSession();
  if (profile) redirect("/home");
  // The demo owner skips onboarding and lands on a fully seeded account.
  if (await provisionOwnerIfNeeded()) redirect("/home");

  return (
    <main className="scr">
      <ProfileForm action={createProfile} mode="onboard" needPhone={!user.phone} defaults={{ email: user.email ?? "" }} />
    </main>
  );
}
