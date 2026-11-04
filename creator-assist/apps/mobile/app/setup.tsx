import { useState } from "react";
import { Linking } from "react-native";
import { WEB_URL } from "@/lib/env";
import { useSession } from "@/session";
import { useTheme } from "@/theme";
import { Button, Card, Head, Screen, Txt } from "@/ui";

/**
 * Signed in, but no creator profile yet. Native onboarding (name, PAN, state, bank, consent)
 * arrives with the rest of the screens; until then the web finishes setup on the same account.
 */
export default function Setup() {
  const { c } = useTheme();
  const { session, refresh, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const who = session?.user.email ?? session?.user.phone ?? "";

  return (
    <Screen edges={["top", "left", "right", "bottom"]}>
      <Head eyebrow="Creator Assist · set up" title="Finish setting up" />
      <Card>
        <Txt>We need your name, PAN, state and bank details to make your agreements and GST invoices.</Txt>
        <Txt color={c.muted}>Open Creator Assist on the web, sign in with {who || "the same account"}, fill in your details, then come back here.</Txt>
        <Button title="Open setup on the web" onPress={() => void Linking.openURL(`${WEB_URL}/onboarding`)} />
        <Button title="I've finished, check again" kind="secondary" busy={busy} onPress={async () => { setBusy(true); await refresh(); setBusy(false); }} />
      </Card>
      <Button title="Sign out" kind="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
