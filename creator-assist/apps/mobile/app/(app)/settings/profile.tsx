import type { UpdateProfileInput } from "@creator-assist/shared/api";
import { Stack, useRouter } from "expo-router";
import { useRef } from "react";
import type { ScrollViewInstance } from "react-native";
import { ProfileForm } from "@/components/profile-form";
import { api } from "@/lib/api";
import { useSession } from "@/session";
import { SubScreen, useToast } from "@/ui";

export default function EditProfile() {
  const { me, refresh } = useSession();
  const router = useRouter();
  const toast = useToast();
  const scrollRef = useRef<ScrollViewInstance>(null);
  return (
    <SubScreen scrollRef={scrollRef}>
      <Stack.Screen options={{ title: "Edit profile" }} />
      <ProfileForm
        mode="edit" profile={me?.profile} scrollRef={scrollRef}
        onSubmit={async (i) => { await api.updateProfile(i as UpdateProfileInput); await refresh(); toast("Profile saved"); router.back(); }}
      />
    </SubScreen>
  );
}
