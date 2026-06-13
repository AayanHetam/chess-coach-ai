import webpush from "web-push";

/**
 * Web Push sender (VAPID). Server-only. Inert until the VAPID env vars are set
 * (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) — generate them once with
 * `npx web-push generate-vapid-keys`. Until then sendPush returns "unconfigured"
 * and the reminder cron falls back to email.
 */

export interface StoredPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export type PushSendResult = "sent" | "expired" | "failed" | "unconfigured";

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@chessmasti.com";
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch {
    configured = false;
  }
  return configured;
}

export function isPushConfigured(): boolean {
  return ensureConfigured();
}

/**
 * Send one push. Returns "expired" for dead subscriptions (404/410) so the
 * caller can prune them; "unconfigured" when VAPID isn't set up.
 */
export async function sendPush(
  sub: StoredPushSubscription,
  payload: PushPayload
): Promise<PushSendResult> {
  if (!ensureConfigured()) return "unconfigured";
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload)
    );
    return "sent";
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404 || statusCode === 410) return "expired";
    console.error("[webpush] send failed", statusCode, err);
    return "failed";
  }
}
