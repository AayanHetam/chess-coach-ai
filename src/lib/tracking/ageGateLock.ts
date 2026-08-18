/**
 * Legacy client-side lockout from the retired DOB age gate (COPPA).
 *
 * The old neutral DOB screen persisted this flag when a date resolved
 * under-13. The current gate is a 13+ affirmation checkbox and never sets
 * it, but every gate surface (AuthDialog signup step, /auth/age
 * interstitial) still honors flags already on devices: a child who answered
 * the old screen honestly stays locked out instead of getting a fresh try.
 *
 * localStorage is deliberately "good enough": a determined user can clear
 * it, as with any self-asserted age screen. SSR-safe: no-ops without
 * localStorage.
 */

const KEY = "cm_age_gate_blocked";

export function isAgeGateBlocked(): boolean {
  try {
    return (
      typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1"
    );
  } catch {
    return false;
  }
}
