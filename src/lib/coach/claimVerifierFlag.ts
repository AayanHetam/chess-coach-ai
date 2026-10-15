/**
 * COACH_CLAIM_VERIFIER — the one switch for the claim-verifier work
 * (docs/coach-accuracy-notes.md): material footers and the model's
 * `material:` line from the verified end balance, the referee's claim check,
 * the depth-20 re-check of flagged moments and the verified game report.
 *
 * Default OFF in production, ON under Vitest. An explicit value wins either
 * way: "1" / "true" / "on" / "yes" or "0" / "false" / "off" / "no".
 *
 * Browser code can only read NEXT_PUBLIC_* values, which Next inlines at
 * build time and only for a literal `process.env.NEXT_PUBLIC_…` expression.
 * So the browser half (footers, the strip, the re-check) reads
 * NEXT_PUBLIC_COACH_CLAIM_VERIFIER, and server code reads
 * COACH_CLAIM_VERIFIER first. Set both to turn all of it on.
 */
const ON = new Set(["1", "true", "on", "yes"]);
const OFF = new Set(["0", "false", "off", "no"]);

/** True/false for an explicit setting, null when unset or unrecognised. */
export function parseClaimVerifierFlag(
  raw: string | undefined
): boolean | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (ON.has(v)) return true;
  if (OFF.has(v)) return false;
  return null;
}

export function isClaimVerifierEnabled(): boolean {
  const explicit =
    parseClaimVerifierFlag(process.env.COACH_CLAIM_VERIFIER) ??
    parseClaimVerifierFlag(process.env.NEXT_PUBLIC_COACH_CLAIM_VERIFIER);
  if (explicit !== null) return explicit;
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}
