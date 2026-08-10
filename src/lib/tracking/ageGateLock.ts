/**
 * Client-side retry lockout for the neutral DOB age gate (COPPA).
 *
 * FTC guidance: an age screen should prevent a child who answered honestly
 * from immediately backing up and re-entering a passing date. Once a DOB
 * resolves under-13 we persist a flag and every gate surface (AuthDialog
 * signup step, /auth/age interstitial) short-circuits to the blocked notice.
 *
 * localStorage is deliberately "good enough": a determined user can clear
 * it, as with any self-asserted age screen — the goal is stopping the
 * immediate second try, not device forensics. SSR-safe: no-ops without
 * localStorage.
 */

const KEY = "cm_age_gate_blocked";

export function isAgeGateBlocked(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setAgeGateBlocked(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, "1");
  } catch {
    // Private-mode storage errors: the in-memory state of the calling
    // component still blocks the current attempt.
  }
}
