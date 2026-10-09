/**
 * The diagnosing question on /analysis (pathway 4.6): once per game, at the
 * player's costliest move, the coach asks what the opponent was
 * threatening and grades the answer from the review's own search.
 */

/**
 * Off until its flip: its own one-line PR changes this default, and the
 * env overrides it either way, which is how the Playwright legs run it on.
 */
export const DIAGNOSE_DEFAULT = false;

/**
 * Read once at module level by the analysis page. `NEXT_PUBLIC_` values are
 * inlined at build time, and only for this literal spelling of the name.
 */
export function isDiagnoseEnabledPublic(): boolean {
  const v = (process.env.NEXT_PUBLIC_COACH_DIAGNOSE ?? "").trim().toLowerCase();
  if (v === "1" || v === "on" || v === "true") return true;
  if (v === "0" || v === "off" || v === "false") return false;
  return DIAGNOSE_DEFAULT;
}
