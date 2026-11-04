// Browser preview only (expo start --web). Metro uses this file for web bundles; the iOS and
// Android apps use secure-storage.ts (Keychain / Keystore). Session storage, cleared with the tab.
const store = () => (typeof sessionStorage === "undefined" ? null : sessionStorage);

export const secureStorage = {
  async getItem(key: string): Promise<string | null> { return store()?.getItem(key) ?? null; },
  async setItem(key: string, value: string): Promise<void> { store()?.setItem(key, value); },
  async removeItem(key: string): Promise<void> { store()?.removeItem(key); },
};
