/**
 * Extract PGN tag-pair headers into a plain `Record<string, string>`.
 *
 * Per the PGN spec, a header is `[KeyName "value"]` on its own line at
 * the top of the PGN body. This regex scans the whole PGN string for
 * the pattern globally and returns the last value seen for each key.
 *
 * Created during PR 1.C Stage A.7 per the plan's T2 refinement: rather
 * than inlining the same regex inside `userHistoryAggregates.ts`, the
 * shared utility lives here so future consumers don't duplicate.
 *
 * Current consumers:
 * - `src/lib/mastermind/userHistoryAggregates.ts` (Stage A.7)
 *
 * Legacy parallel implementation (not consolidated in this commit):
 * - `src/lib/repertoireParser.ts` has its own private `extractHeaders`
 *   with the same regex. Migration belongs to a separate cleanup PR
 *   to keep PR 1.C scoped to validator surface.
 */
export function extractPgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const re = /\[(\w+)\s+"([^"]*)"\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pgn)) !== null) {
    headers[m[1]] = m[2];
  }
  return headers;
}
