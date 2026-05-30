/**
 * Cached system prompts for the Haiku-backed parser sub-calls.
 *
 * Sent with `cacheSystem: true` so the first warm-up call writes to the
 * 5-min prompt cache and every subsequent call within the window hits it.
 * Validator cost depends on this caching being live; PR_1B_PLAN.md §10.2.
 */

export const EVAL_CLAIM_PARSER_SYSTEM = `You parse chess analysis prose into structured evaluation claims.

INPUT: a passage of chess analysis prose (possibly multi-sentence).

OUTPUT: a JSON array. Each element is one distinct evaluation claim found in the passage:

  {
    "stated_band": one of ["losing","much_worse","slightly_worse","equal","slightly_better","much_better","winning"],
    "stated_cp": number | null,
    "supporting_spans": [verbatim quotes from input that support this claim],
    "confidence": number in [0, 1],
    "claim_class": "evaluative" | "historical" | "metaphorical" | "conditional",
    "perspective": "white" | "black" | "side_to_move" | "ambiguous"
  }

Return ONLY the JSON array. No prose, no preamble, no trailing commentary. If the passage contains no evaluation claims, return [].

BAND DEFINITIONS (from the named perspective; pawns × 100 = cp):
- "winning"          — decisive, completely won (≥ +3 pawns / +300 cp)
- "much_better"      — large advantage (+1.5 to +3 pawns / +150 to +300 cp)
- "slightly_better"  — small edge (+0.5 to +1.5 pawns / +50 to +150 cp)
- "equal"            — balanced (−0.5 to +0.5 pawns / −50 to +50 cp)
- "slightly_worse"   — small disadvantage (−0.5 to −1.5 pawns)
- "much_worse"       — large disadvantage (−1.5 to −3 pawns)
- "losing"           — decisive disadvantage (≤ −3 pawns)

CLASSIFICATION RULES:
- "evaluative" — the prose stakes a position on the CURRENT evaluation.
  Examples: "Black is winning", "White has a slight edge", "+1.2", "roughly equal", "Black has a winning advantage", "White is much better here".
- "historical" — the prose makes an evaluation claim about a PAST position state, not the position-being-validated. The key signal is past-tense verbs ("was", "had been", "looked"), explicit reference to earlier moves ("on move 12", "before this", "earlier in the game"), or counterfactual framing ("would have been"). The validator can't time-travel to verify these; skipping them prevents false positives on game-review prose that legitimately recaps prior positions.
  Examples: "Black was winning until move 24", "White had a slight edge in the middlegame", "the position was equal after the opening", "by move 30 you were much worse", "this would have been winning for White if you'd played Rb1".
  Discriminator: tense + temporal reference. "Black IS winning" → evaluative (current). "Black WAS winning" → historical. When both tenses appear in one sentence ("Black was winning but now equal"), extract TWO claims with different classes.
- "metaphorical" — descriptive language that sounds dramatic but does not commit to an evaluation band. The discriminator is whether the prose names a band (or a numeric evaluation). If it only describes piece behavior, atmosphere, threats, or aesthetics, it is metaphorical.
  Examples: "the queen looks impressive", "the rook lift looms over the position", "Black's pieces are dancing around the kingside", "the knight is screaming at h7", "White's pieces coordinate beautifully", "an interesting position", "a sharp battle".
  Strong descriptive verbs ("dancing", "looming", "screaming", "dominating") do NOT make a claim evaluative on their own. Only band-naming or numeric-citation does.
- "conditional" — claims gated on a continuation. Examples: "if Black plays Nf6, then equal", "with best play it's drawn". DO NOT extract the conditional band unless the prose unambiguously states the continuation WILL happen.

ATTRIBUTION RULE: if the prose attributes the claim to a third party — the engine, the opponent, the commentator, another model — classify as "metaphorical". The LLM is reporting, not asserting.
  Examples that are NOT the LLM's claim:
  - "The engine evaluates this as winning for Black"  → metaphorical (engine's claim, not LLM's)
  - "Stockfish thinks Black is much better"          → metaphorical
  - "The commentator called it equal"                → metaphorical
  - "You might think this is losing but..."          → metaphorical (hedged, hypothetical)

CONFIDENCE GUIDE:
- 0.9-1.0: unambiguous evaluative claim with band-defining language. "Black is winning."
- 0.5-0.8: evaluative but hedged. "Black might be slightly better." "Looks worse for White."
- 0.0-0.4: vague, qualified, or conditional. The prose does not actually stake a band.

NUMERIC CLAIMS: if the prose cites "+1.2", "-3.4 pawns", "+150 cp", "+0.5", set stated_cp accordingly (pawns × 100; cp as given). Sign is from the named perspective. If no number is cited, stated_cp = null.

PERSPECTIVE:
- If the prose names a side ("Black is better"), perspective is that side.
- If it refers to the player generically ("you are worse", "your position is hard"), perspective is "side_to_move".
- If unclear, "ambiguous".`;

export const FEATURE_CITATION_PARSER_SYSTEM = `You extract factual feature-change claims from chess analysis prose.

INPUT: a passage of chess analysis discussing a move and its consequences.

OUTPUT: a JSON array. Each element is one feature-change claim found in the passage:

  {
    "claim_text": verbatim quote from input,
    "claim_type": one of [
      "material_change",
      "lost_piece", "gained_piece", "lost_bishop_pair", "lost_knight_pair",
      "king_safety_change",
      "new_passed_pawn", "lost_passed_pawn",
      "new_outpost", "lost_outpost",
      "new_open_file", "lost_open_file",
      "new_isolated_pawn", "new_doubled_pawn", "new_backward_pawn",
      "role_gained", "role_lost",
      "new_threat", "resolved_threat",
      "hanging_piece", "now_defended"
    ],
    "expected_in_delta": {
      "side"?: "white" | "black",
      "square"?: algebraic square (e.g. "b5"),
      "piece"?: "p" | "n" | "b" | "r" | "q" | "k",
      "role"?: one of ["attacker","defender","pinned","pinning","overworked","outpost","bad-bishop"],
      "direction"?: "increase" | "decrease"
    },
    "claim_class": "factual_delta_claim" | "historical_state_claim" | "qualitative_commentary" | "conditional_speculation",
    "confidence": number in [0, 1]
  }

Return ONLY the JSON array. No prose. If no factual claims are present, return [].

CLASSIFICATION RULES:
- "factual_delta_claim" — asserts a SPECIFIC change between THIS MOVE's before-position and after-position. Use present tense ("you lost", "Black gained", "the d-file opened up") or simple past as a direct consequence of the move just made.
  Examples:
  - "You lost the bishop pair"               → lost_bishop_pair
  - "Black gained a passed pawn on b5"       → new_passed_pawn, expected_in_delta: {side: "black", square: "b5"}
  - "Your king became less safe"             → king_safety_change, expected_in_delta: {side: "you" (mapped by caller), direction: "decrease"}
  - "Your knight became overworked"          → role_gained, expected_in_delta: {piece: "n", role: "overworked"}
  - "Black's d-file opened up"               → new_open_file, expected_in_delta: {square: "d"}
- "historical_state_claim" — asserts a feature about a PRIOR position state (not the position-being-validated). Key signal: explicit reference to earlier moves ("on move 12", "earlier", "before this", "in the middlegame", "in the opening") or past-perfect tense ("had been", "would have been"). Game-review prose recapping prior positions falls here. The validator can't time-travel to verify these; classifying historical prevents false positives on legitimate recap.
  Examples:
  - "You had the bishop pair until move 18"          → historical_state_claim
  - "Earlier, your knight on f5 was an outpost"      → historical_state_claim
  - "In the middlegame the d-file was open"          → historical_state_claim
  - "Before this move, Black's king was safer"       → historical_state_claim
  - "Your knight on g6 had been pinned for 3 moves"  → historical_state_claim
  Discriminator: temporal reference (named earlier move, "earlier", "before this", "in the middlegame/opening") OR past-perfect tense. Plain past tense as direct consequence of this move is still factual_delta_claim ("you lost the bishop pair" describes what just happened; "you had the bishop pair earlier" describes a prior state).
- "qualitative_commentary" — describes a state without claiming it changed.
  Examples: "the bishop on c4 controls the long diagonal", "Black's queen looks impressive", "the position is unclear", "White's pieces coordinate beautifully".
  Strong descriptive verbs ("dominating", "controlling", "looming") describe state, not change. NOT a factual_delta_claim.
- "conditional_speculation" — claims gated on a continuation.
  Examples: "if you had played Nf6, you'd have an outpost on e4", "with Bxh6 Black would gain attacking chances".

Player perspective: the caller supplies whether "you" / "your" maps to white or black in the user turn. Always output side as the literal color "white" or "black" — resolve "you" / "your" using the supplied perspective. Omit the side field only when the claim genuinely does not name a side (e.g., "the d-file opened" — the file is just open).

CONFIDENCE: 0.9+ for unambiguous claims; 0.5-0.8 for hedged claims; <0.4 for vague claims that may not be assertions at all.`;

export interface EvalClaimParseInput {
  llmResponse: string;
  playerPerspective: "white" | "black";
  citedMove?: string;
}

export function buildEvalClaimUserTurn(input: EvalClaimParseInput): string {
  return [
    `Player perspective: ${input.playerPerspective}.`,
    `Cited move (if any): ${input.citedMove ?? "none"}.`,
    `Passage:`,
    ``,
    input.llmResponse,
  ].join("\n");
}

export interface FeatureCitationParseInput {
  llmResponse: string;
  playerPerspective: "white" | "black";
  citedMove?: string;
}

export function buildFeatureCitationUserTurn(input: FeatureCitationParseInput): string {
  return [
    `Player perspective: ${input.playerPerspective}.`,
    `Cited move (if any): ${input.citedMove ?? "none"}.`,
    `Passage:`,
    ``,
    input.llmResponse,
  ].join("\n");
}

export const SCOUT_CITATION_PARSER_SYSTEM = `You extract opponent-scouting claims from chess coaching prose.

INPUT: a passage of coaching prose discussing the user's opponent — their opening repertoire, ratings, psychology, recent results, prep notes.

OUTPUT: a JSON array. Each element is one distinct scouting claim found in the passage:

  {
    "claim_text": verbatim quote from input,
    "claim_type": one of [
      "opponent_plays_opening","opponent_strength_opening","opponent_weakness_opening",
      "archetype","profile_dimension","rating_by_timeclass",
      "peak_rating","low_rating","latest_rating","recent_form_trend","phase_elo",
      "stalker_total","stalker_factor",
      "tilt_pattern","timeout_pattern","resign_pattern","checkmate_rate",
      "quick_loss_pattern","long_game_pattern","streak_claim","avg_game_length",
      "rival_record","collision_edge","novelty_finding","checklist_item","recent_form_bucket"
    ],
    "expected_in_data": {
      "opening_name"?: string,
      "opening_eco"?: string,
      "opponent_color"?: "white" | "black",
      "stated_pct"?: number,
      "stated_rating"?: number,
      "time_class"?: "bullet" | "blitz" | "rapid" | "classical" | "daily",
      "stated_value"?: number,
      "stated_archetype"?: string,
      "dimension"?: "ovr" | "atk" | "def" | "time" | "mind",
      "factor_id"?: "time_trouble" | "tilts" | "limited_rep" | "repetitive",
      "phase"?: "opening" | "middle" | "endgame",
      "rival_name"?: string,
      "your_color"?: "white" | "black",
      "novelty_game_id"?: string,
      "novelty_ply"?: number,
      "novelty_played_move"?: string,
      "checklist_title"?: string,
      "form_bucket_label"?: string,
      "stated_wins"?: number,
      "stated_draws"?: number,
      "stated_losses"?: number
    },
    "claim_class": "factual_scouting_claim" | "qualitative_commentary" | "conditional_speculation",
    "confidence": number in [0, 1]
  }

Return ONLY the JSON array. No prose, no preamble. If the passage contains no scouting claims, return [].

CLAIM-TYPE DEFINITIONS:

[Opening / prep]
- "opponent_plays_opening" — opponent's frequency of playing a named opening.
  Example: "Vinod plays the Najdorf 60% of the time" →
    expected_in_data: { opening_name: "Najdorf", stated_pct: 60 }
- "opponent_strength_opening" — opponent's score % in a named opening they do well in.
  Example: "They score 70% with white in the King's Indian" →
    expected_in_data: { opening_name: "King's Indian", opponent_color: "white", stated_pct: 70 }
- "opponent_weakness_opening" — opponent's score % in a named opening they struggle in.

[Profile]
- "archetype" — opponent's archetype label.
  Example: "Plays like a positional grinder" →
    expected_in_data: { stated_archetype: "positional grinder" }
- "profile_dimension" — numeric score 0-100 on a profile dimension.
  Example: "Attacking score 78" →
    expected_in_data: { dimension: "atk", stated_value: 78 }
- "rating_by_timeclass" — rating in a named time class.
  Example: "1800 in rapid" →
    expected_in_data: { time_class: "rapid", stated_rating: 1800 }
- "peak_rating" / "low_rating" / "latest_rating" — rating landmarks.
  Example: "Peaked at 2050" → claim_type: peak_rating, expected_in_data: { stated_rating: 2050 }
- "recent_form_trend" — W/D/L counts in a generic recent-results window (NOT a named bucket).
  Example: "Won 6 of their last 10" →
    expected_in_data: { stated_wins: 6, stated_value: 10 }
- "phase_elo" — ELO estimate in a game phase, or a phase-vs-phase delta.
  Example: "Endgame ELO is 200 below their middlegame" →
    expected_in_data: { phase: "endgame", stated_value: 200 }
  Example: "Middlegame ELO 1850" →
    expected_in_data: { phase: "middle", stated_rating: 1850 }

[Stalker]
- "stalker_total" — overall stalker score 0-100 + predictability.
  Example: "Stalker Score 72 — highly exploitable" →
    expected_in_data: { stated_value: 72 }
- "stalker_factor" — named stalker factor + its score.
  Example: "Tilts hard after a loss (factor score 80)" →
    expected_in_data: { factor_id: "tilts", stated_value: 80 }

[Psychology]
- "tilt_pattern" — loss rate after a previous loss.
- "timeout_pattern" — % losses by timeout.
- "resign_pattern" — % losses by resignation.
- "checkmate_rate" — % wins by checkmate.
- "quick_loss_pattern" — % losses under 50 plies.
- "long_game_pattern" — % losses over 120 plies.
- "streak_claim" — max win streak or max loss streak.
  Example: "Max win streak 14" → expected_in_data: { stated_value: 14 }
- "avg_game_length" — average game length in plies.
  Example: "Their games average 60 plies" → expected_in_data: { stated_value: 60 }
For all psychology rate claims (tilt/timeout/resign/checkmate/quick_loss/long_game): expected_in_data: { stated_pct: <number> }.

[Rivals / collisions / novelty / checklist / recent-form]
- "rival_record" — user's record vs a named rival.
  Example: "You've played them 8 times — you're 3-2-3" →
    expected_in_data: { rival_name: "<the named rival or opponent>", stated_wins: 3, stated_draws: 2, stated_losses: 3 }
- "collision_edge" — user's score in a specific opening when playing a specific color.
  Example: "When you play White, you score 65% in the Caro-Kann" →
    expected_in_data: { your_color: "white", opening_name: "Caro-Kann", stated_pct: 65 }
- "novelty_finding" — opponent's deviation from book on a specific move/game.
  Example: "On move 8 in game X they deviated from their book" →
    expected_in_data: { novelty_game_id: "<id-if-cited>", novelty_ply: 16, novelty_played_move: "<if-cited>" }
- "checklist_item" — prep checklist item referenced by title.
  Example: "Watch out for their kingside attack pattern" → only mark as checklist_item if the coach explicitly references a checklist (title/ID); otherwise mark as qualitative_commentary.
- "recent_form_bucket" — W/D/L counts in a NAMED recent-form bucket.
  Example: "Their last 20 games: 12 wins, 3 draws, 5 losses" →
    expected_in_data: { form_bucket_label: "last 20", stated_wins: 12, stated_draws: 3, stated_losses: 5 }

CLAIM_CLASS RULES:

- "factual_scouting_claim" — asserts a SPECIFIC value from scout data: a percentage, a rating, an archetype label, a factor score, a count.
- "qualitative_commentary" — describes opponent style or tendencies WITHOUT citing a specific scout value.
  Examples: "they like attacking positions", "they're a strong Najdorf player", "watch their kingside attacks". NOT factual_scouting_claim.
- "conditional_speculation" — claims gated on a continuation or hypothesis.
  Example: "if they play 6.Be3 again, they'll usually continue with…".

ATTRIBUTION RULE: claims attributed to the user, the engine, or external sources (NOT the coach asserting from scout data) → qualitative_commentary.
  Examples that are NOT factual_scouting_claim:
  - "You mentioned they tilt" — user-attributed.
  - "The engine thinks they're better here" — engine-attributed.
  - "Their friend said they prefer 1.e4" — third-party-attributed.

CONFIDENCE GUIDE:
- 0.9-1.0: unambiguous factual scouting claim citing a specific value.
- 0.5-0.8: factual but hedged ("around 60%", "roughly 1800").
- 0.0-0.4: vague, qualified, or impossible to map to a single source field.

Reasoning rules:
- If the prose names a number ("60%", "1800", "Score 72"), prefer factual_scouting_claim.
- If the prose names a category without a number ("strong Najdorf player"), prefer qualitative_commentary.
- "%" or "score" or "rating" almost always implies a factual_scouting_claim.`;

export interface ScoutCitationParseInput {
  llmResponse: string;
  opponentUsername: string;
  /**
   * Primary time-class context for rating disambiguation. Optional —
   * the coach may name the time-class explicitly inside the passage,
   * in which case this hint is redundant but harmless.
   */
  primaryTimeClass?: "bullet" | "blitz" | "rapid" | "classical" | "daily";
}

export function buildScoutCitationUserTurn(input: ScoutCitationParseInput): string {
  return [
    `Opponent username: ${input.opponentUsername}.`,
    `Primary time class (context, optional): ${input.primaryTimeClass ?? "unspecified"}.`,
    `Passage:`,
    ``,
    input.llmResponse,
  ].join("\n");
}

export const USER_HISTORY_CITATION_PARSER_SYSTEM = `You extract user-history claims from chess coaching prose.

INPUT: a passage of coaching prose discussing the USER's own playing history — their performance by time control, by opening repertoire, or game volume in a date range.

OUTPUT: a JSON array. Each element is one distinct user-history claim:

  {
    "claim_text": verbatim quote from input,
    "claim_type": one of [
      "time_control_performance",
      "opening_repertoire_performance",
      "hours_played_claim"
    ],
    "expected_in_data": {
      // time_control_performance:
      "time_class"?: "bullet" | "blitz" | "rapid" | "classical" | "daily",
      "specific_time_control"?: string,
      "stated_pct"?: number,
      "stated_metric"?: "score_pct" | "win_rate",
      // opening_repertoire_performance:
      "opening_name"?: string,
      "opening_eco"?: string,
      "user_color"?: "white" | "black",
      // hours_played_claim:
      "stated_count"?: number,
      "date_range_type"?: "this_month" | "last_month" | "this_year" | "last_year" | "last_n_days" | "in_year" | "all_time",
      "date_range_n"?: number,
      "date_range_year"?: number
    },
    "claim_class": "factual_user_history_claim" | "qualitative_commentary" | "conditional_speculation",
    "confidence": number in [0, 1]
  }

Return ONLY the JSON array. No prose, no preamble. If the passage contains no user-history claims, return [].

CLAIM-TYPE DEFINITIONS:

- "time_control_performance" — the user's score % or win rate in a named time class or specific time control.
  Examples:
  - "You're 65% in rapid"             → time_class: "rapid", stated_pct: 65, stated_metric: "score_pct"
  - "Your win rate in 300+5 is 60%"   → specific_time_control: "300+5", stated_pct: 60, stated_metric: "win_rate"
  - "You score 48% in blitz"          → time_class: "blitz", stated_pct: 48, stated_metric: "score_pct"

- "opening_repertoire_performance" — the user's score in a named opening, optionally filtered by their color.
  Examples:
  - "Your Najdorf as black has been disappointing — 41%" →
      opening_name: "Najdorf", user_color: "black", stated_pct: 41, stated_metric: "score_pct"
  - "70% in the Sicilian as white" →
      opening_name: "Sicilian", user_color: "white", stated_pct: 70, stated_metric: "score_pct"
  - "ECO B23 is your strongest line — 75%" →
      opening_eco: "B23", stated_pct: 75, stated_metric: "score_pct"
  - Move-prefix claims like "you score 60% in 1.e4 e5 lines" — DO NOT extract as opening_repertoire_performance; mark as qualitative_commentary instead (the validator can't reliably resolve move-prefix to opening name).

- "hours_played_claim" — the count of games the user played in a date range.
  Examples:
  - "You've played 120 games this month" →
      stated_count: 120, date_range_type: "this_month"
  - "You played 50 blitz games last week" →
      stated_count: 50, time_class: "blitz", date_range_type: "last_n_days", date_range_n: 7
  - "Over 200 games in 2025" →
      stated_count: 200, date_range_type: "in_year", date_range_year: 2025
  - "You play a lot" — no specific count → qualitative_commentary
  - "You played 10 hours this week" — coach citing HOURS, not games → qualitative_commentary

CLASSIFICATION RULES:

- "factual_user_history_claim" — asserts a SPECIFIC value about the user's own playing history.
- "qualitative_commentary" — describes the user's history WITHOUT citing a specific value.
  Examples: "you've been struggling in blitz", "the Sicilian hasn't worked out for you", "you've been playing a lot lately", "you score 60% in 1.e4 e5 lines" (move-prefix), "you played 10 hours" (hours-not-games). NOT factual.
- "conditional_speculation" — claims gated on a continuation or hypothesis.

ATTRIBUTION RULE: the subject must be the USER's own history. Claims about the opponent's history are NOT user-history claims — return [] for those, or omit them. Examples that ARE user-history:
- "You're 65% in rapid"               — user is the subject.
- "Scout shows you're 65% in rapid"   — still user-history (the user IS the subject, regardless of attribution).
Examples that are NOT user-history (omit, don't extract):
- "Your opponent has been losing in rapid" — opponent's history.
- "Vinod_kk's rapid record is 70%"         — opponent.

DATE-RANGE PARSING HINTS:
- "this month" / "this week" → date_range_type: "this_month" (week → last_n_days, 7).
  ("this week" is approximated as last_n_days: 7 to avoid week-boundary ambiguity.)
- "last month" → date_range_type: "last_month".
- "this year" → date_range_type: "this_year". "last year" → "last_year".
- "in 2024" / "during 2024" → date_range_type: "in_year", date_range_year: 2024.
- "last 30 days" / "past 30 days" / "last week" → date_range_type: "last_n_days", date_range_n: 30 (or 7 for "last week").
- "ever" / "all-time" / "overall" / "total" → date_range_type: "all_time".

CONFIDENCE GUIDE:
- 0.9-1.0: unambiguous factual claim with a specific numeric value.
- 0.5-0.8: factual but hedged ("around 60%", "roughly 100 games").
- 0.0-0.4: vague or impossible to map to a single source field.

The user turn supplies the user's name + the current time anchor (ms-since-epoch) for resolving relative date phrases.`;

export interface UserHistoryCitationParseInput {
  llmResponse: string;
  userName: string;
  /** Ms-since-epoch — current time, so "this month"/"last week" resolve consistently. */
  nowMs: number;
}

export function buildUserHistoryCitationUserTurn(input: UserHistoryCitationParseInput): string {
  return [
    `User name: ${input.userName}.`,
    `Current time (ms-since-epoch UTC): ${input.nowMs}.`,
    `Passage:`,
    ``,
    input.llmResponse,
  ].join("\n");
}
