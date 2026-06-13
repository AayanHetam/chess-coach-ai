/**
 * Client-side Web Push helpers: register the service worker, subscribe via the
 * PushManager with the VAPID public key, and shape the subscription for the
 * profile. Inert if push isn't supported or NEXT_PUBLIC_VAPID_PUBLIC_KEY isn't
 * set (returns null / false).
 */

export interface ClientPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function pushConfigured(): boolean {
  return pushSupported() && !!VAPID_PUBLIC_KEY;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

function toClientSub(sub: PushSubscription): ClientPushSubscription | null {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  };
}

/** Request permission + subscribe. Returns the subscription or null on
 *  denial / unsupported / unconfigured. */
export async function subscribeToPush(): Promise<ClientPushSubscription | null> {
  if (!pushConfigured() || !VAPID_PUBLIC_KEY) return null;
  try {
    const reg =
      (await navigator.serviceWorker.getRegistration()) ??
      (await registerServiceWorker());
    if (!reg) return null;
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));
    return toClientSub(sub);
  } catch {
    return null;
  }
}

/** Returns the current device's subscription endpoint (for pruning), if any. */
export async function currentPushEndpoint(): Promise<string | null> {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub?.endpoint ?? null;
  } catch {
    return null;
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
  } catch {
    /* ignore */
  }
}
