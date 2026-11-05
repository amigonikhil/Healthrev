import type { OnboardInput } from "@creator-assist/shared/api";
import { useRef } from "react";
import type { ScrollViewInstance } from "react-native";
import { ProfileForm } from "@/components/profile-form";
import { api } from "@/lib/api";
import { useSession } from "@/session";
import { Button, Screen } from "@/ui";

/** First run after sign-in: the creator's details for agreements and GST invoices. */
export default function Onboarding() {
  const { session, refresh, signOut } = useSession();
  const scrollRef = useRef<ScrollViewInstance>(null);
  return (
    <Screen edges={["top", "left", "right", "bottom"]} scrollRef={scrollRef}>
      <ProfileForm
        mode="onboard" needPhone={!session?.user.phone} defaultEmail={session?.user.email ?? ""} scrollRef={scrollRef}
        onSubmit={async (i) => { await api.onboard(i as OnboardInput); await refresh(); }}
      />
      <Button title="Sign out" kind="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
