import { radius, space, toneColors, type } from "@creator-assist/shared/tokens";
import { inr } from "@creator-assist/shared/money";
import { forwardRef, type ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance, type StyleProp, type TextInputInstance, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FONTS, useTheme, type Weight } from "../theme";

export const TAP = Platform.OS === "ios" ? 44 : 48;

type Variant = "hero" | "h1" | "h1Sub" | "h2" | "tile" | "amount" | "body" | "chip" | "small" | "sticker" | "tab";
const SIZE: Record<Variant, number> = { hero: type.hero, h1: type.h1, h1Sub: type.h1Sub, h2: type.h2, tile: type.tile, amount: type.amount, body: type.body, chip: type.chip, small: type.small, sticker: type.sticker, tab: type.tab };
const TRACK: Partial<Record<Variant, "tight" | "snug">> = { hero: "tight", h1: "snug", h1Sub: "snug", h2: "snug", tile: "tight", amount: "tight" };

/** Text in Space Grotesk at a DESIGN.md size. Scales with the phone's text-size setting. */
export function Txt({ v = "body", w, color, style, children, ...rest }: {
  v?: Variant; w?: Weight; color?: string; style?: StyleProp<TextStyle>; children: ReactNode;
} & Omit<React.ComponentProps<typeof Text>, "style">) {
  const { c } = useTheme();
  const size = SIZE[v];
  const weight: Weight = w ?? (["hero", "h1", "h1Sub", "h2", "tile", "amount"].includes(v) ? "bold" : "regular");
  return (
    <Text
      {...rest}
      style={[{ fontFamily: FONTS[weight], fontSize: size, color: color ?? c.text, letterSpacing: TRACK[v] ? type.tracking(size, TRACK[v]!) : 0, lineHeight: v === "hero" ? size * 1.05 : undefined }, style]}
    >
      {children}
    </Text>
  );
}

/**
 * A scrolling screen with 16pt sides, pull to refresh and the keyboard kept clear of fields.
 * Tabs pass edges with "top"; screens under a native header leave the top to the header.
 * `footer` (e.g. an ActionBar) stays pinned below the scroll area.
 */
export function Screen({ children, refreshing, onRefresh, edges = ["top", "left", "right"], footer, scrollRef }: {
  children: ReactNode; refreshing?: boolean; onRefresh?: () => void; edges?: ("top" | "bottom" | "left" | "right")[]; footer?: ReactNode;
  scrollRef?: React.RefObject<ScrollViewInstance | null>;
}) {
  const { c } = useTheme();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: space[6], gap: space[5], paddingBottom: space[8] * 2 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.muted} colors={[c.primary]} /> : undefined}
      >
        {children}
      </ScrollView>
      {footer}
    </SafeAreaView>
  );
}

/** Screen under the native header (deal screens, settings pages). */
export const SubScreen = (p: Omit<React.ComponentProps<typeof Screen>, "edges">) =>
  <Screen {...p} edges={p.footer ? ["left", "right"] : ["left", "right", "bottom"]} />;

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.cardBorder, padding: space[6], gap: space[5] }, style]}>{children}</View>;
}

export function Button({ title, onPress, kind = "primary", busy, disabled, accessibilityHint, flex }: {
  title: string; onPress: () => void; kind?: "primary" | "secondary" | "danger"; busy?: boolean; disabled?: boolean; accessibilityHint?: string; flex?: boolean;
}) {
  const { c } = useTheme();
  // Primary coral with #111 text; secondary neutral; destructive outlined coral (DESIGN.md).
  const bg = kind === "primary" ? c.primary : kind === "danger" ? "transparent" : c.surface3;
  const fg = kind === "primary" ? c.onPrimary : kind === "danger" ? c.primaryInk : c.text;
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={title} accessibilityHint={accessibilityHint} accessibilityState={{ disabled: !!off, busy: !!busy }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [{
        minHeight: Math.max(TAP, 52), borderRadius: radius.button, backgroundColor: bg, alignItems: "center", justifyContent: "center", paddingHorizontal: 18,
        borderWidth: kind === "danger" ? 2 : 0, borderColor: c.primary, opacity: off ? 0.5 : pressed ? 0.85 : 1,
      }, flex ? { flex: 1 } : null]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Txt w="bold" color={fg} style={{ textAlign: "center" }}>{title}</Txt>}
    </Pressable>
  );
}

/** A text-style button (secondary links like "Clear date", "Preview what the brand sees"). */
export function LinkButton({ title, onPress, hint }: { title: string; onPress: () => void; hint?: string }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={hint} onPress={onPress} style={{ minHeight: TAP, justifyContent: "center", alignSelf: "center", paddingHorizontal: 8 }}>
      <Txt w="semibold" color={c.text2} style={{ textDecorationLine: "underline" }}>{title}</Txt>
    </Pressable>
  );
}

/** Status tag ("Overdue 18 days", "Paid"…). */
export function Chip({ label, tone }: { label: string; tone: "over" | "info" | "ok" | "mute" }) {
  const { c } = useTheme();
  const t = toneColors(c, tone);
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: radius.pill, minHeight: 24, paddingHorizontal: 10, justifyContent: "center", alignSelf: "flex-end" }}>
      <Txt v="sticker" w="bold" color={t.text}>{label}</Txt>
    </View>
  );
}

const AV = (c: ReturnType<typeof useTheme>["c"]) => [c.stOver, c.stInfo, c.accent, c.stNew, c.stOk, "#F5F5F5"];
/** Brand initials on a colour that's stable per name (same rule as the web). */
export function Avatar({ name }: { name: string }) {
  const { c } = useTheme();
  const initials = name.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w[0] ?? "")).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const hue = [...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 6;
  return (
    <View accessible={false} importantForAccessibility="no" style={{ width: 44, height: 44, borderRadius: radius.avatar, backgroundColor: AV(c)[hue], alignItems: "center", justifyContent: "center", borderWidth: hue === 5 ? 1 : 0, borderColor: c.line }}>
      <Txt w="bold" color="#111111">{initials}</Txt>
    </View>
  );
}

/** "₹X due" with "₹Y after TDS" underneath (labelled gross and net, from the shared amounts function). */
export function Amounts({ due, afterTds, label = "due" }: { due: number; afterTds: number; label?: "due" | "paid" }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: "flex-end", gap: 2 }}>
      <Txt v="amount">{inr(due)} <Txt v="small" w="semibold" color={c.text2}>{label}</Txt></Txt>
      <Txt v="small" color={c.muted}>{inr(afterTds)} after TDS</Txt>
    </View>
  );
}

/** A deal or brand row: avatar, title and detail on the left; amounts and status on the right. */
export function Row({ title, sub, avatar, amount, chip, onPress }: {
  title: string; sub?: string; avatar?: string; amount?: { due: number; afterTds: number; label?: "due" | "paid" };
  chip?: { label: string; tone: "over" | "info" | "ok" | "mute" }; onPress?: () => void;
}) {
  const { c } = useTheme();
  const a11y = [title, sub, amount && `${inr(amount.due)} ${amount.label ?? "due"}, ${inr(amount.afterTds)} after TDS`, chip?.label].filter(Boolean).join(". ");
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={a11y} onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: c.surface, borderColor: c.cardBorder, opacity: pressed ? 0.85 : 1 }]}
    >
      {avatar && <Avatar name={avatar} />}
      <View style={{ flex: 1, gap: 6 }}>
        <Txt w="semibold" numberOfLines={2}>{title}</Txt>
        {sub ? <Txt v="small" w="medium" color={c.muted}>{sub}</Txt> : null}
      </View>
      <View style={{ alignItems: "flex-end", gap: 6, flexShrink: 0, maxWidth: "50%" }}>
        {amount && <Amounts {...amount} />}
        {chip && <Chip {...chip} />}
      </View>
    </Pressable>
  );
}

/** A neutral number tile (Home, Tax hub). */
export function Stat({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={{ flex: 1, minWidth: 140, backgroundColor: c.surface2, borderRadius: radius.card, borderWidth: 1, borderColor: c.cardBorder, padding: 16, gap: 6 }}>
      <Txt v="small" w="semibold" color={c.text2}>{label}</Txt>
      <Txt v="tile">{value}</Txt>
      {children}
    </View>
  );
}

/** Info or warning message block. */
export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole={tone === "warn" ? "alert" : undefined} style={{ backgroundColor: tone === "warn" ? c.warnBg : c.infoBg, borderRadius: radius.input, padding: 14 }}>
      <Txt v="small" w="semibold" color={tone === "warn" ? c.warnText : c.infoText}>{children}</Txt>
    </View>
  );
}

export const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.card, borderWidth: 1 },
});

/** A labelled text input (16pt radius, 48pt+ tall, label read with the field). */
export const Field = forwardRef<TextInputInstance, { label: string; error?: string | null; hint?: string } & TextInputProps>(function Field({ label, error, hint, style, ...rest }, ref) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Txt v="small" w="semibold" color={c.text2} importantForAccessibility="no" accessibilityElementsHidden>{label}</Txt>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={c.placeholder}
        selectionColor={c.primary}
        {...rest}
        style={[{
          minHeight: 52, borderRadius: radius.input, borderWidth: 1, borderColor: error ? c.primary : c.field, backgroundColor: c.surface,
          paddingHorizontal: 14, paddingVertical: 12, color: c.text, fontFamily: FONTS.medium, fontSize: type.body + 1,
          opacity: rest.editable === false ? 0.6 : 1,
        }, style]}
      />
      {error ? <Txt v="small" w="semibold" color={c.warnText} accessibilityRole="alert">{error}</Txt> : null}
    </View>
  );
});

/** Two or three options side by side (Mobile / Email, filters). */
export function Seg<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", backgroundColor: c.surface2, borderRadius: radius.pill, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight: TAP, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.text : "transparent" }}
          >
            <Txt w="bold" color={on ? c.bg : c.text2}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Filter chips that wrap onto more lines rather than scrolling sideways (DESIGN.md). */
export function FilterChips<T extends string>({ value, options, onChange, label }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  const { c } = useTheme();
  return (
    <View accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={{ minHeight: TAP, paddingHorizontal: 16, borderRadius: radius.pill, justifyContent: "center", backgroundColor: on ? c.accent : c.surface2, borderWidth: 1, borderColor: on ? c.accent : c.line }}
          >
            <Txt v="chip" w={on ? "bold" : "semibold"} color={on ? c.onAccent : c.text2}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Screen title with an optional small line above it (the date on Home) and an action on the right. */
export function Head({ title, eyebrow, sub, action }: { title: string; eyebrow?: string; sub?: string; action?: { label: string; onPress: () => void } }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12, paddingTop: 4 }}>
      <View style={{ flex: 1, gap: 2 }}>
        {eyebrow ? <Txt v="small" w="semibold" color={c.muted}>{eyebrow}</Txt> : null}
        <Txt v="h1" accessibilityRole="header">{title}</Txt>
        {sub ? <Txt color={c.muted}>{sub}</Txt> : null}
      </View>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress}
          style={({ pressed }) => ({ minHeight: TAP, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: c.primary, justifyContent: "center", marginBottom: 4, opacity: pressed ? 0.85 : 1 })}>
          <Txt v="chip" w="bold" color={c.onPrimary}>{action.label}</Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Placeholder blocks shown while a screen loads. */
export function Skeleton({ rows = 3, hero }: { rows?: number; hero?: boolean }) {
  const { c } = useTheme();
  return (
    <View accessible accessibilityLabel="Loading" style={{ gap: 12 }}>
      {hero && <View style={{ height: 180, borderRadius: radius.card, backgroundColor: c.surface2 }} />}
      {Array.from({ length: rows }, (_, i) => <View key={i} style={{ height: 72, borderRadius: radius.card, backgroundColor: c.surface2 }} />)}
    </View>
  );
}

/** A load error with a retry (no internet, server down). */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ gap: 12 }}>
      <Note tone="warn">{message}</Note>
      <Button title="Try again" kind="secondary" onPress={onRetry} />
    </View>
  );
}

export * from "./forms";
export * from "./toast";
