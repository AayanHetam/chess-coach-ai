# MASTERMIND_TIER_A_GAPS.md

## SUMMARY

Content that should exist in [data/](../data/) for the Mastermind agent to be effective at "Tier A" (instant, pre-loaded, common asks per [FUTURE_IDEAS.md:21](../FUTURE_IDEAS.md#L21)) but does not yet. Seven gaps, each requiring a human decision before any code can fill it: (1) **GM games archive** — which 50–100 games to curate, what file format; (2) **Drill set** — piece-movement / mate-in-1 / motif drills, format and source; (3) **Endgame studies** — Lucena, Philidor, Réti, Vancura — format and presentation; (4) **Opening traps library** — same; (5) **Opening-ideas JSON** — strategic plans / pawn breaks / typical middlegame transitions, schema and authoring strategy (curated vs LLM-then-frozen); (6) **Endgame-principles JSON** — taxonomy of endgame classes (~40-50) and the principles they trigger; (7) **Position-type-classifier** — Tier-0 prerequisite for "find master games at this structure" and several Group-5 demonstration tools, choice between heuristic vs LLM call. Each entry below names what's missing, the human decision required, the cost of deferral (which tools collapse without it), and what the agent does meanwhile. The schema sketches are concrete enough that a content author or contractor can pick up any single gap and ship it without further architectural work.

---

## How to read this doc

Each gap entry has four fields:

- **What's missing**: the data that should be in [data/](../data/) but isn't.
- **Human decision required**: the choice that has to be made before authoring or generating the content can begin. These are not engineering decisions — they are content / scope / pedagogy decisions.
- **Blocks shipping until**: the concrete outcome that has to land before this gap is considered closed.
- **Why it matters for the agent**: which Mastermind tools (per MASTERMIND_TOOLS.md) become design-only or partial without this gap filled, and what the agent should fall back to meanwhile.

The order roughly tracks how foundational each gap is — the position-type-classifier (Gap 7) gates several others, but is listed last because it is genuinely a Tier-0 *prerequisite* rather than a Tier-A *content* gap.

---

## Gap 1 — GM games archive

- **What's missing**: A curated, structured corpus of grandmaster games for the agent to surface on request ("show me Fischer-Spassky 1972 game 6", "how did Carlsen handle this rook ending against Nepo?"). Today, the only PGN at the repo root is [DEMO_GAME.pgn](../DEMO_GAME.pgn) — a single demo file. No `data/gm-games/` directory exists.
- **Human decision required**:
  - **Which games?** [FUTURE_IDEAS.md:36](../FUTURE_IDEAS.md#L36) flags this as the open question: "Which 50 GM games?" Picking arbitrarily means rework later. Possible cuts: world championship games (~250 games covers all WCs since 1948, narrow-able); Carlsen-Nepo + Carlsen-Caruana (recent matches users will ask about); positional masterpieces by phase (Capablanca endgames, Karpov middlegames, Tal attacks); games featured in major creator content (GothamChess, Naroditsky speedruns).
  - **What file format?** Plain PGN (smallest, parseable by [chess.js](../node_modules/chess.js/) and [repertoireParser.ts:84-119](../src/lib/repertoireParser.ts#L84-L119)) versus annotated JSON with critical-moment tags (richer, but requires authoring effort and a schema). [FUTURE_IDEAS.md:36](../FUTURE_IDEAS.md#L36) flags this too: "What file format? Picking arbitrarily means rework later."
- **Blocks shipping until**: a `data/gm-games/` directory with at least 30–50 PGNs (or annotated-JSON files) and a small index file mapping `{title → file}` and `{ECO → files[]}`.
- **Why it matters for the agent**: the design-only `gm_game_lookup` tool (proposed under Group 2 / Tier A in the prior tool-inventory work) cannot ship; the agent has to live-fetch from Lichess masters DB or (for famous WC games) hard-code references in prose. Recovery meanwhile: the design-only `fetch_lichess_master_db` tool (MASTERMIND_TOOLS.md `fetch_external`) is a thin proxy to `https://explorer.lichess.ovh/masters?fen=…` and partially covers "show me master games that reached this position" — but not the "show me Fischer-Spassky 1972 game 6 by name" lookup.

## Gap 2 — Drill set (piece movement, mate-in-1, motif fundamentals)

- **What's missing**: A `data/drills/` directory with structured beginner-fundamentals content: how knights move, mate-in-1 patterns, fork/pin/skewer recognition, basic en-passant. Today, beginner-level reinforcement happens entirely through the Lichess puzzle pool, which is not graded for first-principle teaching — a 1200-rated knight-fork puzzle assumes the user already knows knight movement.
- **Human decision required**:
  - **Drill granularity.** Per-square coordinate quizzes (à la Lichess Coordinate Trainer)? Per-piece "show all legal moves from square X" drills? Or motif-isolated "find the fork" mini-puzzles?
  - **File format.** PGN (constraining — drills aren't always full positions), or a JSON shape `{drillId, fen, prompt, expectedAnswer, hint?, conceptTag}`?
  - **Source.** Author from scratch (slow but pedagogically tunable), or filter the Lichess CSV at [data/lichess_puzzles_100k.csv](../data/lichess_puzzles_100k.csv) for `mateIn1` + `oneMove` themes (fast but pedagogically uncurated)?
- **Blocks shipping until**: a `data/drills/` directory with at least 200 drills covering the eight `MISTAKE_CATEGORIES` keys at [weaknessProfile.ts:62-71](../src/lib/weaknessProfile.ts#L62-L71): Hanging Pieces, Missed Tactics, King Safety, Pawn Structure, Piece Activity, Endgame Technique, Time Management, Positional Errors.
- **Why it matters for the agent**: design-only `piece_movement_drill` (Group 2 in prior tool-inventory work) cannot ship; the agent recommends Lichess puzzles for fundamentals when those puzzles are not graded for first-time teaching. Recovery meanwhile: filter the existing puzzle pool by lowest rating + theme tag and accept that the experience is "real puzzles at the floor of difficulty," not "drills built for explanation."

## Gap 3 — Endgame studies (Lucena, Philidor, Réti, Vancura)

- **What's missing**: A `data/endgames/` directory with the canonical theoretical endgame positions every improver must know — perhaps 30 positions covering K+P, R+P vs R, B+P vs B, opposite-color bishops, K+B+N vs K, classic studies (Réti, Saavedra, Troitsky).
- **Human decision required**:
  - **Coverage.** Just the four canonical names ([Lucena](https://en.wikipedia.org/wiki/Lucena_position), [Philidor](https://en.wikipedia.org/wiki/Philidor_position), [Réti](https://en.wikipedia.org/wiki/Réti_endgame_study), [Vancura](https://en.wikipedia.org/wiki/Vancura_position)) at minimum, or expand to ~30 positions from Dvoretsky's *Endgame Manual* table of contents?
  - **Format.** PGN of the position + study moves, or JSON with `{name, fen, technique, principles[], howToWin, criticalMoves[]}`?
  - **Pairing with principles.** Should each study link to the relevant entry in Gap 6 (endgame-principles JSON), or stand alone as a position to memorize?
- **Blocks shipping until**: at least 12 canonical endgames present (Lucena, Philidor, Vancura, K+B+N mate, KBP-vs-K with wrong-color bishop, the rook-endgame fortresses, opposite-color bishop draws, Réti's mutual zugzwang, plus a handful more).
- **Why it matters for the agent**: design-only `endgame_study` tool cannot ship; agent has to describe Lucena from prose (and risk misstating it without the validator catching the mistake — see MASTERMIND_FAILURE_MODES.md §3 for why the validator is a board-state checker, not a chess-knowledge checker). Recovery meanwhile: the agent quotes the principle by name and refers the user to a written source.

## Gap 4 — Opening traps library

- **What's missing**: A `data/traps/` directory with classic opening traps (Fishing Pole, Légal's, Englund Trap, Lasker Trap, etc.) for the agent to surface when a user is in a known trap-rich position.
- **Human decision required**:
  - **Scope.** Just the famous-name traps, or a wider set keyed by ECO code?
  - **Format.** PGN with header `[Trap "Légal Mate"]`, or a JSON with `{name, ecoEntry, mainLine, trapMove, escapeMove, tags[]}`?
  - **Severity tagging.** Should traps be flagged "fun gimmick" vs "you should actually learn this"? A novice's coach surfacing the Englund Trap as a primary opening recommendation would be a coaching mistake.
- **Blocks shipping until**: a `data/traps/` directory with 20–40 entries covering the most common scholastic traps and the most relevant per ECO band.
- **Why it matters for the agent**: design-only `opening_trap` tool cannot ship; agent has to guess at trap moves from prose, with the validator catching only the move-legality issues, not the pedagogical claim that a move "is a famous trap." Recovery meanwhile: the agent suggests "be aware that this opening has known traps" without naming them.

## Gap 5 — Opening-ideas JSON

- **What's missing**: A `data/opening-ideas.json` keyed by ECO code (or by opening name) with **what to do** rather than just **what it is**. Today, [openingDetector.ts](../src/lib/openingDetector.ts) and [unifiedOpeningDetector.ts](../src/lib/unifiedOpeningDetector.ts) tell the agent "this is the Najdorf B90"; nothing tells the agent "in the Najdorf, Black plays for queenside expansion with …e5/…b5 against White's f3/g4/h4 attack."
- **Human decision required**:
  - **Schema.** Sketch from the prior planning work: `{ ecoCode: { whitePlans: string[], blackPlans: string[], pawnBreaks: string[], criticalMoments: string[], typicalMiddlegame: "IQP" | "hedgehog" | "Carlsbad" | ... } }`. Final field set requires editorial decision.
  - **Coverage.** Just the top ~50 ECO codes (covers >80% of amateur games), or all 500 ECO codes for completeness?
  - **Authoring strategy.** Hand-curated by the founder / a contracted titled coach (slow, accurate, expensive)? Or generated by Claude flagship in one pass, reviewed, and frozen as a static JSON (fast, scales, requires human verification step)? [FUTURE_IDEAS.md](../FUTURE_IDEAS.md) does not commit to either.
- **Blocks shipping until**: `data/opening-ideas.json` exists with at least the top-50 ECO codes covered.
- **Why it matters for the agent**: design-only `opening_ideas`, `opening_typical_plans`, `opening_critical_moves`, `opening_to_middlegame_bridge` tools cannot ship; the agent has to either invent these on the fly (high hallucination risk because the validator does not catch chess-knowledge claims) or refuse to coach the strategic phase of the opening. Recovery meanwhile: when asked "what's the plan in the Najdorf?", the agent leans on its training-data knowledge with explicit uncertainty hedging.

## Gap 6 — Endgame-principles JSON

- **What's missing**: A `data/endgame-principles.json` keyed by endgame class (e.g., `"R+P-vs-R"`, `"opposite-color-bishops"`, `"K+P-vs-K"`) with the principles that apply (Tarrasch's rule, opposition / key squares, Vancura defense, fortress conditions, etc.).
- **Human decision required**:
  - **Schema.** `{ endgameClassId: { name, principles: [{ name, statement, exampleFen }], fortressPositions?: string[], standardLosses?: string[] } }`. Final shape needs an editorial pass.
  - **Taxonomy.** How granular should the endgame classes be? K+P-vs-K is one class, but R+P-vs-R splits into many sub-classes (rook-pawn vs central pawn, attacker-rook-active vs passive, defender-king-cut-off vs not). Per the prior planning work, "the taxonomy is finite and well-known — maybe 40-50 distinct classes covering everything below master level"; an editor has to commit to a specific count.
- **Blocks shipping until**: `data/endgame-principles.json` exists with at least 30 classes covered.
- **Why it matters for the agent**: design-only `endgame_classify` and `endgame_principles_for_position` tools cannot ship as a pair. Without the principles JSON, even if `endgame_classify` returns `"R+P-vs-R Philidor-defensive-position"`, the agent has nothing structured to load against the class. Recovery meanwhile: agent leans on training-data principles with hedging, plus the Lichess tablebase ([fetch_lichess_tablebase] design-only) for ≤7-piece positions to ground the perfect-play call.

## Gap 7 — Position-type classifier (Tier-0 prerequisite)

- **What's missing**: A function `classifyPositionType(fen: string) → string[]` that returns structural tags like `["middlegame", "IQP-for-white", "opposite-side-castling", "open-c-file"]`. Several Group-5 demonstration tools depend on it: `master_games_at_structure`, `find_thematic_examples`, `opening_to_middlegame_bridge`, `branch_point_analysis`. Today no such classifier exists; [openingDetector.ts](../src/lib/openingDetector.ts) handles ECO classification (a related but distinct problem) and [accuracy/index.ts:106-125](../src/lib/accuracy/index.ts#L106-L125) handles phase classification (also distinct, simpler — just opening/middlegame/endgame).
- **Human decision required**:
  - **Approach.** Two viable shapes:
    - **Heuristic** — pawn-structure rules in pure code (cheap, deterministic, ~80% coverage, predictable). Pawn-structure features are partly extracted already at [fenSimilarity.ts:33-49](../src/lib/fenSimilarity.ts#L33-L49) (per-file pawn counts, pawn weaknesses) — a heuristic classifier could reuse those features.
    - **LLM call** — Claude tags it (more flexible, costs a token round-trip per call, less predictable, recoverable via caching since position types don't change after FEN is fixed).
  - **Tag taxonomy.** What is the closed set of structural tags? IQP, Carlsbad, hedgehog, hanging pawns, opposite-side-castling, blocked-center, isolated-queen-pawn, French-locked-chain, etc. Editorial decision required. Without a fixed taxonomy, downstream tools that filter by tag have no contract.
- **Blocks shipping until**: either a heuristic at [src/lib/positionTypeClassifier.ts](../src/lib/) or an LLM-tagger wrapper, plus a fixed taxonomy of ~20 structural tags.
- **Why it matters for the agent**: this is a **Tier-0 dependency**. Without it, design-only tools `master_games_at_structure`, `find_thematic_examples`, `opening_to_middlegame_bridge`, `branch_point_analysis` (MASTERMIND_TOOLS.md `engine_analyze`, `repertoire`) all collapse to either "use ECO code as a proxy" (very rough — many ECO codes span multiple structural types) or "fetch by exact FEN" (too narrow — finds zero or one match in the masters DB for most positions). Recovery meanwhile: agent uses ECO code as a poor man's structural tag, hedges accordingly.

---

## Cost of deferral, in one place

The matrix below maps each gap to the design-only tools (per MASTERMIND_TOOLS.md) that collapse without it, and the partial-shipping fallback the agent has meanwhile.

| Gap | Tools blocked | Agent fallback meanwhile |
|---|---|---|
| 1. GM games archive | `gm_game_lookup` | `fetch_lichess_master_db` (design-only itself) or prose |
| 2. Drill set | `piece_movement_drill`, `tactical_motif_set` | filter Lichess CSV by lowest rating + theme; UX is "real puzzles at floor difficulty," not graded drills |
| 3. Endgame studies | `endgame_study`, `endgame_canonical_position` | quote the principle by name; refer user to written source |
| 4. Opening traps | `opening_trap` | "be aware this opening has known traps" without naming them |
| 5. Opening-ideas JSON | `opening_ideas`, `opening_typical_plans`, `opening_critical_moves`, `opening_to_middlegame_bridge` | training-data knowledge with explicit uncertainty hedging |
| 6. Endgame-principles JSON | `endgame_classify` + `endgame_principles_for_position` (collapses as a pair) | training-data principles + Lichess tablebase for ≤7-piece positions |
| 7. Position-type classifier | `master_games_at_structure`, `find_thematic_examples`, `opening_to_middlegame_bridge`, `branch_point_analysis` | ECO code as a coarse proxy with hedging |

---

## Suggested ordering for filling these gaps

This is a recommendation, not a blocker. The dependencies suggest:

1. **Gap 7 first (position-type classifier)** — Tier-0 prerequisite. Without it, three other content gaps can be authored but not surfaced.
2. **Gap 1 + Gap 2 (parallelizable)** — content authoring is independent. GM games archive is the highest-impact single content gap (per the FUTURE_IDEAS.md framing of the Mastermind as a GM-tier coach).
3. **Gap 5 + Gap 6 (parallelizable)** — both require structured authoring with the same pattern (JSON keyed by an identifier). Both unblock multiple tools as a pair.
4. **Gap 3 + Gap 4 (parallelizable)** — narrowest scope, smallest catalog requirement; can ship in a single content sprint.

Independently of order, all seven require human authoring or human-supervised generation. None can be filled by code alone; this is the line between "we have the infrastructure" and "we have the content."
