import Ionicons from "@expo/vector-icons/Ionicons";
import { radius } from "@creator-assist/shared/tokens";
import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useEffect, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { api } from "@/lib/api";
import { useFlag } from "@/lib/flags";
import { setPasted } from "@/lib/pasted";
import { errorText } from "@/lib/use-load";
import { useTheme } from "@/theme";
import { Button, Field, Note, SubScreen, TAP, Txt } from "@/ui";

type Shot = { uri: string; name: string; type: string; file?: File };

/**
 * Paste a chat (deal_from_chat flag): the brand's message or a screenshot of it, typed in or
 * shared from WhatsApp / Instagram / Mail through the share sheet. We read it and open the New
 * deal form filled in; nothing is saved until the creator saves, and the chat isn't kept.
 */
export default function PasteChat() {
  const { c } = useTheme();
  const router = useRouter();
  const on = useFlag("deal_from_chat");
  const { shared } = useLocalSearchParams<{ shared?: string }>();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const [text, setText] = useState("");
  const [shot, setShot] = useState<Shot | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Something shared into the app (WhatsApp → Forward → share, a screenshot from Photos…): read
  // it straight away and open the filled-in New deal form. The creator still reviews and saves.
  useEffect(() => {
    if (!hasShareIntent || !on) return;
    const t = [shareIntent.text, shareIntent.webUrl].filter(Boolean).join("\n").trim();
    const img = shareIntent.files?.find((f) => f.mimeType?.startsWith("image/"));
    const s: Shot | null = img ? { uri: img.path, name: img.fileName || "screenshot.jpg", type: img.mimeType } : null;
    if (t) setText(t);
    if (s) setShot(s);
    resetShareIntent();
    if (t || s) void read(t, s);
  }, [hasShareIntent, on]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!on) {
    return <SubScreen><Stack.Screen options={{ title: "Paste a chat" }} /><Note>This isn&apos;t available yet. Fill in the deal yourself for now.</Note><Button title="New deal" onPress={() => router.replace("/deals/new")} /></SubScreen>;
  }

  async function pick() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsMultipleSelection: false });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    setShot({ uri: a.uri, name: a.fileName || "screenshot.jpg", type: a.mimeType || "image/jpeg", file: (a as { file?: File }).file });
  }

  async function read(t: string = text, sh: Shot | null = shot) {
    setBusy(true); setErr("");
    try {
      const form = new FormData();
      if (t.trim()) form.append("text", t.trim());
      if (sh) form.append("image", sh.file ?? ({ uri: sh.uri, name: sh.name, type: sh.type } as unknown as Blob));
      const { deal } = await api.deals.extract(form);
      setPasted(deal);
      setText(""); setShot(null);
      router.replace("/deals/new");
    } catch (e) { setErr(errorText(e)); setBusy(false); }
  }

  return (
    <SubScreen>
      <Stack.Screen options={{ title: "Paste a chat" }} />
      <Txt color={c.muted}>Paste the brand&apos;s message or email, or add a screenshot of the chat. We&apos;ll fill in the deal for you to check.{shared ? "" : " You can also share a chat to Creator Assist from WhatsApp or Instagram."}</Txt>
      <Field label="Brand's message" value={text} onChangeText={setText} multiline placeholder="Hi! We'd love 2 Reels and 3 Stories for our launch…" style={{ minHeight: 160, textAlignVertical: "top" }} />
      {shot ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Image source={{ uri: shot.uri }} style={{ width: 72, height: 120, borderRadius: radius.input, backgroundColor: c.surface2 }} accessibilityLabel="Screenshot to read" />
          <Pressable accessibilityRole="button" accessibilityLabel="Remove screenshot" onPress={() => setShot(null)} style={{ minHeight: TAP, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="close-circle" size={22} color={c.muted} /><Txt w="semibold" color={c.text2}>Remove screenshot</Txt>
          </Pressable>
        </View>
      ) : <Button title="Add a screenshot" kind="secondary" onPress={pick} />}
      {err ? <Note tone="warn">{err}</Note> : null}
      <Button title={busy ? "Reading the chat…" : "Fill in the deal"} busy={busy} disabled={!text.trim() && !shot} onPress={() => read()} />
      <Txt v="small" color={c.muted} style={{ textAlign: "center" }}>We don&apos;t keep the chat. Nothing is saved until you review and save the deal.</Txt>
    </SubScreen>
  );
}
