# Mastermind cleanup follow-ups

Non-blocking cleanups that are surfaced during Mastermind PR work but kept out of the PR's scope to maintain plan-first discipline. Each entry is independent — can be picked up as its own small PR whenever Aayan signals.

**Format:** one entry per cleanup, dated to when it was first flagged. Drop entries from the file once they ship.

---

## 2026-05-18 — `extractPgnHeaders` utility consolidation

**Status:** flagged during PR 1.C Stage A.7 (`a067d3b`).

**Background.** Stage A.7 needed PGN header extraction (ECO / Opening / Variation) for the `aggregateScoreByOpening` helper. A grep surfaced an existing private implementation at [`src/lib/repertoireParser.ts:61`](../src/lib/repertoireParser.ts#L61) — `function extractHeaders(pgn: string)` with the same `/\[(\w+)\s+"([^"]*)"\]/g` regex. Not exported.

Per Stage A.7 plan T2 refinement, the shared utility lives at [`src/lib/utils/pgnHeaders.ts`](../src/lib/utils/pgnHeaders.ts) (created `src/lib/utils/` directory). Stage A.7's `userHistoryAggregates.ts` imports from there.

**Cleanup task.** Migrate `repertoireParser.ts:61`'s private `extractHeaders` to import from the shared utility:

```typescript
// Before (current state — repertoireParser.ts:61-69):
function extractHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const headerRegex = /\[(\w+)\s+"([^"]*)"\]/g;
  let match;
  while ((match = headerRegex.exec(pgn)) !== null) {
    headers[match[1]] = match[2];
  }
  return headers;
}

// After:
import { extractPgnHeaders } from "@/lib/utils/pgnHeaders";

// Then replace all extractHeaders(...) callsites with extractPgnHeaders(...)
// — there are two in repertoireParser.ts (lines 104 + 128).
```

Three-line change effectively: remove the private function, add the import, rename the two callsites. Drop this entry from `cleanup_followups.md` when shipped.

**Why deferred.** Touching `repertoireParser.ts` is outside PR 1.C's validator surface; consolidating during Stage A.7 would expand scope to a non-Mastermind file. The duplicated regex isn't broken; just non-DRY.

**Risk if left:** the two copies could drift over time (e.g., one gains tag-name normalization, the other doesn't). Low probability — the regex is short and stable, and the PGN header format hasn't changed in 25 years.

**Recommended trigger:** if any future PR touches `repertoireParser.ts` for an unrelated reason, fold this consolidation in. Otherwise wait until cleanup PR cadence resumes.
