"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, startTransition, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

// ---------------------------------------------------------------- toast
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState("");
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    setOn(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className={`toast${on ? " on" : ""}`} role="status" aria-live="polite">{msg}</div>
    </ToastCtx.Provider>
  );
}

/** Shows ?t=… as a toast after a server-action redirect, then strips it from the URL. */
export function ToastFromQuery() {
  const params = useSearchParams();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const t = params.get("t");
    if (!t) return;
    toast(t);
    const next = new URLSearchParams(params);
    next.delete("t");
    router.replace(pathname + (next.size ? `?${next}` : ""), { scroll: false });
  }, [params, toast, router, pathname]);
  return null;
}

// ---------------------------------------------------------------- nav
export function BackButton({ fallback = "/home" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button
      type="button" className="back" aria-label="Back"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
    >←</button>
  );
}

// ---------------------------------------------------------------- forms
const PendingCtx = createContext(false);

/**
 * A form for useActionState actions that keeps what the user typed when the
 * action returns an error. (React 19 resets a <form action> after every
 * submission, which would wipe a half-filled form on a validation error.)
 */
export function ActionForm({ action, pending, children, style, className }: {
  action: (f: FormData) => void; pending: boolean; children: ReactNode; style?: React.CSSProperties; className?: string;
}) {
  return (
    <PendingCtx.Provider value={pending}>
      <form
        className={className} style={style}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          startTransition(() => action(fd));
        }}
      >
        {children}
      </form>
    </PendingCtx.Provider>
  );
}

export function SubmitButton({ children, className = "btn", pendingText, disabled, name, value, style }: {
  children: ReactNode; className?: string; pendingText?: string; disabled?: boolean; name?: string; value?: string; style?: React.CSSProperties;
}) {
  const status = useFormStatus();
  const ctxPending = useContext(PendingCtx);
  const pending = status.pending || ctxPending;
  return (
    <button type="submit" className={className} disabled={pending || disabled} name={name} value={value} style={style}>
      {pending ? pendingText ?? "Saving…" : children}
    </button>
  );
}

export function ToastButton({ msg, className = "btn sec", children }: { msg: string; className?: string; children: ReactNode }) {
  const toast = useToast();
  return <button type="button" className={className} onClick={() => toast(msg)}>{children}</button>;
}

export function Seg<T extends string>({ options, value, onChange, name, label }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; name?: string; label?: string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  );
}

/** − [n] + quantity control. Typing is allowed; the value is clamped on blur. */
export function Stepper({ value, onChange, min = 1, max = 999, label, name, disabled }: {
  value: number; onChange: (n: number) => void; min?: number; max?: number; label: string; name?: string; disabled?: boolean;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const clamp = (n: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
  return (
    <div className="stepper" aria-disabled={disabled}>
      <button type="button" aria-label={`Fewer ${label}`} disabled={disabled || value <= min} onClick={() => onChange(clamp(value - 1))}>−</button>
      <input
        aria-label={label} name={name} inputMode="numeric" value={text} disabled={disabled}
        onChange={(e) => { const t = e.target.value.replace(/\D/g, "").slice(0, 3); setText(t); if (t) onChange(clamp(parseInt(t, 10))); }}
        onBlur={() => setText(String(clamp(parseInt(text, 10))))}
      />
      <button type="button" aria-label={`More ${label}`} disabled={disabled || value >= max} onClick={() => onChange(clamp(value + 1))}>+</button>
    </div>
  );
}

// ---------------------------------------------------------------- appearance
type Theme = "system" | "light" | "dark";
const THEMES: { value: Theme; label: string }[] = [{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }];

/** Light / dark / follow-the-phone switch. Saved in a cookie so the server renders the same theme. */
export function ThemeSwitch({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const choose = (t: Theme) => {
    setTheme(t);
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    document.cookie = `theme=${t}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
  };
  return <Seg label="Appearance" value={theme} onChange={choose} options={THEMES} />;
}
