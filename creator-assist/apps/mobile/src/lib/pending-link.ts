// A screen the app was asked to open (deep link, notification tap, shared chat) that has to
// wait until the creator is signed in. The root layout opens it once the session is ready.
let pending: string | null = null;
const listeners = new Set<() => void>();

export function setPendingLink(path: string | null) {
  pending = path && path !== "/" ? path : null;
  listeners.forEach((l) => l());
}
export function takePendingLink(): string | null {
  const p = pending;
  pending = null;
  return p;
}
export const peekPendingLink = () => pending;
export function onPendingLink(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

// Set by the root layout: once signed in and loaded, links navigate directly.
let ready = false;
export const setAppReady = (v: boolean) => { ready = v; };
export const appIsReady = () => ready;
