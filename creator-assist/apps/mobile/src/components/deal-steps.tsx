import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FIELD_STEP, listOf, MISSING_LABEL, useDraft, type Step } from "@/components/deal-draft";
import { useTheme } from "@/theme";
import { Button, Note } from "@/ui";

/**
 * Pinned to the bottom of each step: Back (steps 2 and 3) and the step's main button, with an
 * optional second action under them.
 */
export function StepFooter({ next, onNext, back, busy, disabled, below, error }: {
  next: string; onNext: () => void; back?: boolean; busy?: boolean; disabled?: boolean; below?: ReactNode; error?: string;
}) {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="toolbar" style={{ gap: 4, paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12), backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.line }}>
      {error ? <View style={{ paddingBottom: 6 }}><Note tone="warn">{error}</Note></View> : null}
      <View style={{ flexDirection: "row", gap: 10 }}>
        {back && <View style={{ width: 104 }}><Button title="Back" kind="secondary" onPress={() => router.back()} disabled={disabled} /></View>}
        <Button title={next} onPress={onNext} busy={busy} disabled={disabled} flex />
      </View>
      {below}
    </View>
  );
}

/** What the AI filled in on this step: check the highlighted fields and add what the chat didn't say. */
export function AiNote({ step }: { step: Step }) {
  const { ai } = useDraft();
  if (!ai) return null;
  const unsure = [...ai.unsure].some((f) => FIELD_STEP[f] === step);
  const missing = ai.missing.filter((f) => FIELD_STEP[f] === step).map((f) => MISSING_LABEL[f]);
  const other = step === 2 ? ai.other : [];
  const add = missing.length ? `Add the ${listOf(missing)}: the chat didn't say.` : "";
  if (step === 1) {
    return (
      <Note>
        {["Filled in from your chat. Check each step, especially fields marked Check.", add, "Nothing is saved until the last step."].filter(Boolean).join(" ")}
      </Note>
    );
  }
  if (!unsure && !add && !other.length) return null;
  return (
    <Note>
      {[unsure ? "Check the fields marked Check." : "", add, other.length ? `Also mentioned, not in our list: ${other.join(", ")}.` : ""].filter(Boolean).join(" ")}
    </Note>
  );
}
