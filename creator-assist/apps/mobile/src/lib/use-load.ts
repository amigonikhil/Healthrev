import { ApiError } from "@creator-assist/shared/api-client";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

/** Plain-language text for a failed request: the server's own message, or an offline hint. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return "Can't reach Creator Assist. Check your internet connection and try again.";
}

/**
 * Loads a screen's data when it comes into view (and again each time you return to it),
 * with pull-to-refresh state. Keeps the last good data on screen if a reload fails.
 */
export function useLoad<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      if (pull) setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return { data, error, refreshing, reload: () => load(false), refresh: () => load(true) };
}
