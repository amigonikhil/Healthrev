import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

// AES-256-GCM for PAN and bank account numbers. ENCRYPTION_KEY is 32 bytes,
// base64 or hex. Ciphertext format: v1.<iv>.<tag>.<data> (base64url).

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set");
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes (base64 or hex)");
  return buf;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decrypt(blob: string | null | undefined): string | null {
  if (!blob) return null;
  const [v, iv, tag, data] = blob.split(".");
  if (v !== "v1") return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export const maskPan = (pan: string) => pan.slice(0, 5) + "••••" + pan.slice(-1);
export const last4 = (acct: string) => acct.replace(/\D/g, "").slice(-4);

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 24) => randomBytes(bytes).toString("base64url");
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
