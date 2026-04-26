# Known Issues

Tracking known bugs and product gaps not yet fixed. Each entry includes reproduction steps and suspected root cause to accelerate the eventual fix.

## 1. Concept retrieval falls open on unrecognized strategic concepts

**Severity:** Medium. Affects user trust in the coach.

**Symptom:** Clicking certain `[CONCEPT:...]` buttons in the AI coach chat returns puzzles that do not match the concept. Example confirmed on 2026-04-26: clicking "Central Pawn Breaks" returns three fork puzzles, deterministically, on repeated clicks.

**Diagnostic data captured 2026-04-26 from production `/api/similar-puzzles` response for "Central Pawn Breaks":**

- `anchorConcepts: []` — concept never classified.
- `fallbackUsed: "theme"` — system fell through to Lichess theme fallback.
- `notes: ["Anchor unclassified; falling back to Lichess theme retrieval."]`
- All three returned puzzles had `themes` containing `fork` (e.g. `["fork", "queen-fork", "king-rook-queen-fork"]`).
- All three had `conceptMatchScore: 0`, `structuralSimilarity: 0`, `finalScore: 1` driven entirely by `ratingProximity: 1`.

**Suspected root cause:** "Central Pawn Breaks" and similar strategic-but-not-tactical concepts are not in the recognized concept list used by the anchor classifier. When classification fails, the fallback theme query returns popular puzzles at the user's rating regardless of strategic match — failing open instead of failing closed.

**Concepts confirmed working:** "Forced Mating Patterns" returns mating puzzles correctly.

**Proposed fix (not in scope today):**
1. Audit the recognized concept list in `src/lib/concept/conceptRetrieval.ts` and add strategic concepts (pawn breaks, prophylaxis, piece coordination, etc.) with explicit theme mappings.
2. Change the fallback behavior: when no anchor and no good theme match, return an empty pool with a user-facing "no good puzzles found for this concept" message rather than serving mismatched puzzles.

**Diagnostic instrumentation:** Branch `coach-prompt-phase-b-diagnostics` (PR #9, closed but branch retained) contains logging that captures the anchor classification path. Re-open if recurrence investigation is needed.

## 2. PGN upload via analysis panel does not prompt for player perspective

**Severity:** Medium. Coach gives feedback from both sides' perspectives, which is useless or confusing for users analyzing their own games.

**Symptom:** When a user uploads a PGN via the "Load a game" button in the analysis panel (NOT the database section), the system does not ask which color the user was playing. The AI coach analyzes mistakes from both sides, including the opponent's, leading to feedback like "Black should have played Nf6 here" to a user who lost as White.

**Affected path:** Analysis panel "Load a game" button only. The theme-picker upload path on the database section is unaffected — it already prompts for perspective.

**Proposed fix (not in scope today):** Add a perspective picker (White / Black / Both) to the analysis-panel PGN load flow. Plumb the perspective through to the coach prompt so it filters mistakes to only the user's side. Estimated 1–2 hours of focused work, untested in current code path.
