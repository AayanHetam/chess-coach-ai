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
    "claim_class": "evaluative" | "metaphorical" | "conditional",
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
- "evaluative" — the prose stakes a position on the actual evaluation.
  Examples: "Black is winning", "White has a slight edge", "+1.2", "roughly equal", "Black has a winning advantage", "White is much better here".
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
    "claim_class": "factual_delta_claim" | "qualitative_commentary" | "conditional_speculation",
    "confidence": number in [0, 1]
  }

Return ONLY the JSON array. No prose. If no factual claims are present, return [].

CLASSIFICATION RULES:
- "factual_delta_claim" — asserts a SPECIFIC change between two positions (before vs after a move, or before vs after a variation).
  Examples:
  - "You lost the bishop pair"               → lost_bishop_pair
  - "Black gained a passed pawn on b5"       → new_passed_pawn, expected_in_delta: {side: "black", square: "b5"}
  - "Your king became less safe"             → king_safety_change, expected_in_delta: {side: "you" (mapped by caller), direction: "decrease"}
  - "Your knight became overworked"          → role_gained, expected_in_delta: {piece: "n", role: "overworked"}
  - "Black's d-file opened up"               → new_open_file, expected_in_delta: {square: "d"}
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
