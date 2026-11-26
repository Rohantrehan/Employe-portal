import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * Shared-account secrets are encrypted here, on the app server, before they
 * reach the database: AES-256-GCM with the key in the VAULT_KEY env var
 * (32 random bytes, base64). The item id and field name are bound in as
 * associated data, so a value can't be copied onto another account or field.
 *
 * Generate a key once:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * Keep a copy somewhere safe: without it the saved passwords can't be read.
 */
export type VaultField = "password" | "notes" | "totp";

function key(): Buffer | null {
  const raw = process.env.VAULT_KEY;
  if (!raw) return null;
  const k = Buffer.from(raw, "base64");
  return k.length === 32 ? k : null;
}

export const vaultReady = () => key() !== null;

export function encrypt(itemId: string, field: VaultField, plain: string): string {
  const k = key();
  if (!k) throw new Error("VAULT_KEY is not set");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  c.setAAD(Buffer.from(`${itemId}:${field}`));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64")}`;
}

export function decrypt(itemId: string, field: VaultField, stored: string): string {
  const k = key();
  if (!k) throw new Error("VAULT_KEY is not set");
  if (!stored.startsWith("v1:")) throw new Error("Unknown format");
  const buf = Buffer.from(stored.slice(3), "base64");
  const d = createDecipheriv("aes-256-gcm", k, buf.subarray(0, 12));
  d.setAAD(Buffer.from(`${itemId}:${field}`));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}

// ---------------------------------------------------------------------
// Authenticator codes (RFC 6238, the 6-digit codes apps like Google Authenticator show)
// ---------------------------------------------------------------------
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(s: string): Buffer | null {
  const clean = s.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  let bits = 0, val = 0;
  const out: number[] = [];
  for (const ch of clean) {
    val = (val << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Accepts the setup key ("JBSW Y3DP ...") or the otpauth:// link from the QR code. Returns the clean key or null. */
export function normaliseTotpSecret(input: string): string | null {
  let s = input.trim();
  if (/^otpauth:\/\//i.test(s)) {
    try {
      s = new URL(s).searchParams.get("secret") ?? "";
    } catch {
      return null;
    }
  }
  s = s.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  const b = base32(s);
  return b && b.length >= 10 ? s : null;
}

export function totp(secret: string, now = Date.now()): { code: string; secondsLeft: number } {
  const k = base32(secret);
  if (!k) throw new Error("Bad secret");
  const step = Math.floor(now / 1000 / 30);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", k).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
  return { code: n, secondsLeft: 30 - (Math.floor(now / 1000) % 30) };
}
