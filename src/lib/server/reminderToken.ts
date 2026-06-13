import { createHmac, timingSafeEqual } from "crypto";

/**
 * Stateless one-click unsubscribe tokens for reminder emails. HMAC(uid) with
 * the session secret — no DB lookup, can't be forged, and never expires (an
 * unsubscribe link should always work). Server-only.
 */

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set.");
  return s;
}

export function signReminderToken(uid: string): string {
  return createHmac("sha256", secret())
    .update(`reminders:${uid}`)
    .digest("hex");
}

export function verifyReminderToken(uid: string, token: string): boolean {
  try {
    const expected = signReminderToken(uid);
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(token, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function unsubscribeUrl(uid: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://chessmasti.com";
  return `${base}/api/reminders/unsubscribe?uid=${encodeURIComponent(uid)}&t=${signReminderToken(uid)}`;
}
