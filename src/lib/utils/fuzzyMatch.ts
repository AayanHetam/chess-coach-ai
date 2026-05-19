/**
 * Fuzzy string-matching helpers shared across the validator surface.
 *
 * Extracted from `src/lib/mastermind/validators/scoutCitation.ts` during
 * PR 1.C Stage A.8 (Aayan T2 ratified) so `userHistoryCitation` can reuse
 * the same matcher for opening-name claims. The token-overlap fallback
 * was added during Stage A.6 implementation as a documented deviation
 * from the original substring-match spec.
 *
 * Stage C watchpoint (Aayan 2026-05-18): token overlap can over-match
 * when distinct openings share common tokens like "Defense" or "Gambit".
 * If false positives surface in the sweep, the fix is requiring overlap
 * on the *distinctive* tokens specifically (drop a stopword list like
 * ["defense", "opening", "gambit"] from both sides before checking).
 * Not a code change now; the watch lives in this comment.
 */

/**
 * Lowercase + trim. Returns "" for nullish input.
 */
export function lower(s: string | undefined | null): string {
  return (s ?? "").toLowerCase().trim();
}

/**
 * Case-insensitive name match. Returns true when:
 *   (a) `needle` is a contiguous substring of `haystack`, OR
 *   (b) all of `needle`'s whitespace-split tokens appear in `haystack`'s
 *       tokens (word-order-tolerant).
 *
 * Empty needle returns false.
 */
export function substringMatch(haystack: string, needle: string): boolean {
  const h = lower(haystack);
  const n = lower(needle);
  if (!n) return false;
  if (h.includes(n)) return true;
  const haystackTokens = new Set(h.split(/\s+/).filter(Boolean));
  const needleTokens = n.split(/\s+/).filter(Boolean);
  if (needleTokens.length === 0) return false;
  return needleTokens.every((t) => haystackTokens.has(t));
}
