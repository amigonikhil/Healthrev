import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { fmtDate } from "@creator-assist/shared/dates";
import { radius } from "@creator-assist/shared/tokens";
import * as Haptics from "expo-haptics";
import { useState, type ReactNode } from "react";
import { FlatList, Modal, Platform, Pressable, Switch, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FONTS, useTheme } from "../theme";
import { Button, CheckTag, TAP, Txt } from "./index";

const tick = () => { if (Platform.OS !== "web") void Haptics.selectionAsync(); };

/** Bottom sheet on `surface` over a scrim (DESIGN.md). Android back and a tap on the scrim close it. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.scrim }} />
        <View
          accessibilityViewIsModal
          style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, paddingTop: 10, paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 16), gap: 12, maxHeight: "88%" }}
        >
          <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: c.line }} />
          {title ? <Txt v="h2" accessibilityRole="header">{title}</Txt> : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** A labelled on/off switch; the whole row is the tap target. */
export function Toggle({ label, value, onChange, disabled, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: string }) {
  const { c } = useTheme();
  const flip = () => { if (!disabled) { tick(); onChange(!value); } };
  return (
    <Pressable
      accessibilityRole="switch" accessibilityState={{ checked: value, disabled: !!disabled }} accessibilityLabel={label} accessibilityHint={hint}
      onPress={flip}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: TAP, opacity: disabled ? 0.5 : 1 }}
    >
      <Txt style={{ flex: 1 }} w="medium">{label}</Txt>
      <Switch
        value={value} onValueChange={flip} disabled={disabled} importantForAccessibility="no-hide-descendants" accessible={false}
        trackColor={{ false: c.surface3, true: c.text }} thumbColor={Platform.OS === "android" ? (value ? c.accent : c.surface) : undefined} ios_backgroundColor={c.surface3}
      />
    </Pressable>
  );
}

/** − n + with screen-reader increment/decrement. */
export function Stepper({ label, value, onChange, min = 1, max = 99, disabled }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; disabled?: boolean }) {
  const { c } = useTheme();
  const set = (v: number) => { if (!disabled) { tick(); onChange(Math.min(max, Math.max(min, v))); } };
  const btn = (icon: "remove" | "add", d: number, off: boolean) => (
    <Pressable
      accessible={false} importantForAccessibility="no" onPress={() => set(value + d)} disabled={off || disabled}
      style={{ width: TAP, height: TAP, borderRadius: radius.pill, backgroundColor: c.surface3, alignItems: "center", justifyContent: "center", opacity: off || disabled ? 0.4 : 1 }}
    >
      <Ionicons name={icon} size={20} color={c.text} />
    </Pressable>
  );
  return (
    <View
      accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min, max, now: value, text: String(value) }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => set(value + (e.nativeEvent.actionName === "increment" ? 1 : -1))}
      style={{ flexDirection: "row", alignItems: "center", gap: 8, opacity: disabled ? 0.5 : 1 }}
    >
      {btn("remove", -1, value <= min)}
      <Txt w="bold" style={{ minWidth: 32, textAlign: "center" }}>{value}</Txt>
      {btn("add", 1, value >= max)}
    </View>
  );
}

const toDate = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Date field: the native picker on each platform (iOS inline calendar in a sheet, Android
 * Material date picker dialog). Values are 'YYYY-MM-DD'.
 */
export function DateField({ label, value, onChange, min, max, placeholder = "Choose a date", clearable, check }: {
  label: string; value: string; onChange: (v: string) => void; min?: string; max?: string; placeholder?: string; clearable?: boolean; check?: boolean;
}) {
  const { c, scheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(new Date());
  const initial = () => (value ? toDate(value) : min && toDate(min) > new Date() ? toDate(min) : new Date());

  if (Platform.OS === "web") {
    // Browser preview only: a plain text field.
    return <FieldLike label={label} check={check}><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" placeholderTextColor={c.placeholder} style={{ color: c.text, fontFamily: FONTS.medium, fontSize: 16, flex: 1 }} /></FieldLike>;
  }

  const show = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initial(), mode: "date", design: "material",
        minimumDate: min ? toDate(min) : undefined, maximumDate: max ? toDate(max) : undefined,
        onChange: (e, d) => { if (e.type === "set" && d) onChange(toISO(d)); },
      });
    } else { setDraft(initial()); setOpen(true); }
  };

  return (<>
    <FieldLike label={label} onPress={show} value={value ? fmtDate(value) : ""} placeholder={placeholder} icon="calendar-outline" check={check} />
    {clearable && value ? <Pressable accessibilityRole="button" onPress={() => onChange("")} style={{ alignSelf: "flex-start", minHeight: 32, justifyContent: "center" }}><Txt v="small" w="semibold" color={c.text2} style={{ textDecorationLine: "underline" }}>Clear date</Txt></Pressable> : null}
    <Sheet open={open} onClose={() => setOpen(false)} title={label}>
      <DateTimePicker
        value={draft} mode="date" display="inline" themeVariant={scheme} accentColor={c.primary} textColor={c.text}
        minimumDate={min ? toDate(min) : undefined} maximumDate={max ? toDate(max) : undefined}
        onChange={(_e, d) => d && setDraft(d)}
      />
      <Button title="Done" onPress={() => { onChange(toISO(draft)); setOpen(false); }} />
    </Sheet>
  </>);
}

/** Something that looks like a text field but opens a picker. */
function FieldLike({ label, value, placeholder, onPress, icon, children, check, error, hint }: {
  label: string; value?: string; placeholder?: string; onPress?: () => void; icon?: React.ComponentProps<typeof Ionicons>["name"]; children?: ReactNode;
  check?: boolean; error?: string | null; hint?: string;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Txt v="small" w="semibold" color={c.text2}>{label}</Txt>
        {check ? <CheckTag /> : null}
      </View>
      <Pressable
        disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={onPress ? `${label}${check ? ", please check" : ""}: ${value || placeholder}` : undefined}
        accessibilityHint={hint}
        style={{ minHeight: 52, borderRadius: radius.input, borderWidth: check || error ? 2 : 1, borderColor: error ? c.primary : check ? c.accent : c.field, backgroundColor: c.surface, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        {children ?? <Txt w="medium" color={value ? c.text : c.placeholder} style={{ flex: 1, fontSize: 16 }}>{value || placeholder}</Txt>}
        {icon ? <Ionicons name={icon} size={20} color={c.muted} /> : null}
      </Pressable>
      {error ? <Txt v="small" w="semibold" color={c.warnText} accessibilityRole="alert">{error}</Txt> : hint ? <Txt v="small" color={c.muted}>{hint}</Txt> : null}
    </View>
  );
}

/** Pick one from a list in a bottom sheet (states, durations…), with search for long lists. */
export function Select<T extends string>({ label, value, options, onChange, placeholder = "Choose", check, error, hint }: {
  label: string; value: T | ""; options: { value: T; label: string }[]; onChange: (v: T) => void; placeholder?: string;
  /** Filled in by the AI but not sure: highlighted with a Check tag. */ check?: boolean; error?: string | null; hint?: string;
}) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const current = options.find((o) => o.value === value)?.label ?? "";
  return (<>
    <FieldLike label={label} value={current} placeholder={placeholder} onPress={() => { setQ(""); setOpen(true); }} icon="chevron-down" check={check} error={error} hint={hint} />
    <Sheet open={open} onClose={() => setOpen(false)} title={label}>
      {options.length > 8 && (
        <TextInput
          value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={c.placeholder} accessibilityLabel={`Search ${label}`}
          style={{ minHeight: 48, borderRadius: radius.input, backgroundColor: c.surface2, paddingHorizontal: 14, color: c.text, fontFamily: FONTS.medium, fontSize: 16 }}
        />
      )}
      <FlatList
        data={shown} keyExtractor={(o) => o.value} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}
        renderItem={({ item }) => {
          const on = item.value === value;
          return (
            <Pressable
              accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => { tick(); onChange(item.value); setOpen(false); }}
              style={{ minHeight: TAP + 4, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: c.line }}
            >
              <Txt style={{ flex: 1 }} w={on ? "bold" : "regular"}>{item.label}</Txt>
              {on && <Ionicons name="checkmark" size={20} color={c.text} />}
            </Pressable>
          );
        }}
      />
    </Sheet>
  </>);
}

/** A tappable row that opens another screen or a sheet. */
export function ListItem({ title, sub, onPress, right, danger }: { title: string; sub?: string; onPress?: () => void; right?: ReactNode; danger?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={[title, sub].filter(Boolean).join(". ")} onPress={onPress} disabled={!onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.card, borderWidth: 1, borderColor: danger ? c.primary : c.cardBorder, backgroundColor: c.surface, opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Txt w="semibold" color={danger ? c.primaryInk : c.text}>{title}</Txt>
        {sub ? <Txt v="small" w="medium" color={c.muted}>{sub}</Txt> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={20} color={c.muted} /> : null)}
    </Pressable>
  );
}

/** Label and value on one line (deal facts, invoice lines). */
export function KV({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  const { c } = useTheme();
  return (
    <View accessible accessibilityLabel={`${k}: ${v}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, minHeight: 26 }}>
      <Txt color={strong ? c.text : c.muted} w={strong ? "bold" : "regular"} style={{ flexShrink: 1 }}>{k}</Txt>
      <Txt w={strong ? "bold" : "semibold"} v={strong ? "amount" : "body"} style={{ flexShrink: 1, textAlign: "right" }}>{v}</Txt>
    </View>
  );
}

export function Hr() {
  const { c } = useTheme();
  return <View style={{ height: 1, backgroundColor: c.line }} />;
}

/** A message preview, like the chat bubble the brand will see. */
export function Bubble({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: c.okBg, borderRadius: radius.input, borderTopLeftRadius: 4, padding: 14 }}>
      <Txt selectable>{text}</Txt>
    </View>
  );
}

/** A deal's next steps, pinned to the bottom of the screen above the home indicator. */
export function ActionBar({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="toolbar" accessibilityLabel="Next steps" style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12), backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.line }}>
      {children}
    </View>
  );
}

/** The native stack header in the app's colours and type (signed-in stack and the New deal wizard). */
export function useHeaderOptions() {
  const { c } = useTheme();
  return {
    headerStyle: { backgroundColor: c.bg },
    headerTintColor: c.text,
    headerTitleStyle: { fontFamily: FONTS.bold, fontSize: 18 },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: "minimal" as const,
    contentStyle: { backgroundColor: c.bg },
  };
}
