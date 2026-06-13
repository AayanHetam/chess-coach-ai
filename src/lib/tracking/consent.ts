/**
 * Consent + Global Privacy Control (TRK-6).
 *
 * Tracking is consent-gated: the server endpoints (/api/track*) only write when
 * the visitor has accepted analytics cookies AND has not signaled GPC. Pre-
 * consent (no cookie) is treated as "no" — conservative by design, the right
 * posture for an audience that includes minors.
 *
 * `cm_consent` is intentionally NOT httpOnly: it carries no secret, and both the
 * banner (set) and the client SDK (read) need it. The server reads it off the
 * request Cookie header.
 */

export const CONSENT_COOKIE_NAME = "cm_consent";
export type ConsentValue = "accepted" | "rejected";

const CONSENT_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function readConsentFromCookieString(cookie: string | null): ConsentValue | null {
  if (!cookie) return null;
  const m = cookie.match(
    new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE_NAME}=([^;]+)`),
  );
  if (!m) return null;
  const v = decodeURIComponent(m[1]);
  return v === "accepted" || v === "rejected" ? v : null;
}

// ── Server ───────────────────────────────────────────────────────────────────

/**
 * May we record tracking data for this request? Honors the Global Privacy
 * Control signal (`Sec-GPC: 1` → always no) and requires an explicit
 * `cm_consent=accepted` cookie. Absent cookie → no.
 */
export function hasTrackingConsent(request: Request): boolean {
  if (request.headers.get("sec-gpc") === "1") return false;
  return readConsentFromCookieString(request.headers.get("cookie")) === "accepted";
}

// ── Client ─────────────────────────────────────────────────────────────────

export function getClientConsent(): ConsentValue | null {
  if (typeof document === "undefined") return null;
  return readConsentFromCookieString(document.cookie);
}

export function setClientConsent(value: ConsentValue): void {
  if (typeof document === "undefined") return;
  const secure =
    typeof location !== "undefined" && location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie = `${CONSENT_COOKIE_NAME}=${value}; Max-Age=${CONSENT_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

/** Browser GPC signal (the `navigator.globalPrivacyControl` boolean). */
export function gpcEnabled(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    (navigator as unknown as { globalPrivacyControl?: boolean })
      .globalPrivacyControl === true
  );
}

/** Client mirror of hasTrackingConsent — used by the SDK to skip sending. */
export function clientHasConsent(): boolean {
  if (gpcEnabled()) return false;
  return getClientConsent() === "accepted";
}
