import type { AppConfig, Me } from "@creator-assist/shared/api";
import { ApiError } from "@creator-assist/shared/api-client";
import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./lib/api";
import { supabase } from "./lib/supabase";

type Status = "loading" | "signedOut" | "needsProfile" | "ready";

type SessionState = {
  status: Status;
  session: Session | null;
  me: Me | null;
  config: AppConfig | null;
  /** Set when the server can't be reached at start-up (no internet / server error). */
  error: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [me, setMe] = useState<Me | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Remote switches and sign-in methods, read once at start-up.
  useEffect(() => { api.config().then(setConfig).catch(() => setConfig(null)); }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      // First call after sign-in also sets up the demo/reviewer account when it's that number.
      setMe(await api.bootstrap());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { await supabase.auth.signOut(); return; }
      setError(e instanceof ApiError ? e.message : "Can't reach Creator Assist. Check your internet connection.");
    }
  }, []);

  useEffect(() => {
    if (session) void load();
    else setMe(null);
  }, [session?.user.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<SessionState>(() => {
    const status: Status = session === undefined || (session && !me && !error) ? "loading"
      : !session ? "signedOut"
      : me?.profile ? "ready" : me ? "needsProfile" : "loading";
    return {
      status, session: session ?? null, me, config, error,
      refresh: load,
      signOut: async () => { await supabase.auth.signOut(); setMe(null); },
    };
  }, [session, me, config, error, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession must be used inside SessionProvider");
  return s;
}
