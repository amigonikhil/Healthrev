import * as SecureStore from "expo-secure-store";

// Supabase session storage in the iOS Keychain / Android Keystore. SecureStore values
// are size-limited (about 2 KB), and a session is larger, so it is split into chunks
// under key.0, key.1, ... with the count at key.n. Nothing goes to plain storage.

const CHUNK = 1800;
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");

async function count(key: string): Promise<number> {
  return Number((await SecureStore.getItemAsync(`${safe(key)}.n`, OPTS)) ?? 0) || 0;
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const n = await count(key);
    if (!n) return null;
    const parts = await Promise.all(Array.from({ length: n }, (_, i) => SecureStore.getItemAsync(`${safe(key)}.${i}`, OPTS)));
    return parts.some((p) => p === null) ? null : parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    const before = await count(key);
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, "g")) ?? [""];
    for (let i = 0; i < parts.length; i++) await SecureStore.setItemAsync(`${safe(key)}.${i}`, parts[i], OPTS);
    await SecureStore.setItemAsync(`${safe(key)}.n`, String(parts.length), OPTS);
    for (let i = parts.length; i < before; i++) await SecureStore.deleteItemAsync(`${safe(key)}.${i}`, OPTS);
  },
  async removeItem(key: string): Promise<void> {
    const n = await count(key);
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${safe(key)}.${i}`, OPTS);
    await SecureStore.deleteItemAsync(`${safe(key)}.n`, OPTS);
  },
};
