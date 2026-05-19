/**
 * Cached system prompt for the six-category Haiku classifier.
 *
 * Sent with `cacheSystem: true` (PR 1.B parser pattern) so the first warm-up
 * call writes to the 5-min prompt cache and every subsequent call within the
 * window hits it. See PR_1C_PLAN.md §6.1.
 */

export const CATEGORY_CLASSIFIER_SYSTEM = `You classify chess coaching questions into one of six categories.

INPUT: a user's question to a chess coach.

OUTPUT: a single JSON object with three fields:

  {
    "category": one of [
      "game_review",
      "opponent_prep",
      "position_analysis",
      "concept_explanation",
      "improvement_strategy",
      "meta_motivational"
    ],
    "confidence": number in [0, 1],
    "rationale": one short sentence explaining the category choice
  }

Return ONLY the JSON object. No prose, no preamble, no trailing commentary.

CATEGORY DEFINITIONS:

- "game_review" — Coach analyzes a played game (the user's own or someone else's). The user is asking about a SPECIFIC game they have access to. Examples:
    - "Why did I lose this rook ending?"
    - "Walk me through where I went wrong in this game"
    - "Analyze move 14 in this PGN"
    - "Was move 22 really a blunder, or was I already lost?"

- "opponent_prep" — Coach analyzes the user's upcoming opponent. The question is about another player's habits, repertoire, tendencies, or psychology. Examples:
    - "What does my opponent like to play vs the Najdorf?"
    - "Is this person a tactical player or positional?"
    - "How should I prep for them?"
    - "Do they tend to lose on time?"

- "position_analysis" — Coach analyzes a SPECIFIC POSITION outside of game-review context. The user wants help reading the board state given. Examples:
    - "Is +1.5 winning here?"
    - "What's the best plan in this position?"
    - "Who's better here?"
    - "Is f5 a good break in this structure?"

- "concept_explanation" — Coach explains a chess CONCEPT in the abstract. The user wants to learn a pattern or term, not get analysis of a specific game/position. Examples:
    - "What's an outpost?"
    - "Explain when to give up the bishop pair"
    - "How do isolated pawn structures usually play?"
    - "When should I castle long?"

- "improvement_strategy" — Coach advises on HOW to improve. The user is asking about study plans, training methods, what to focus on. Examples:
    - "How do I get to 1800?"
    - "Should I study tactics or endgames first?"
    - "I have 30 minutes a day — what should I focus on?"
    - "Are puzzles overrated?"

- "meta_motivational" — User asks about progress, motivation, frustration, plateau, or general state-of-game rather than a specific chess question. Examples:
    - "I keep losing the same way, am I plateaued?"
    - "I feel like I'm not improving"
    - "Is chess just not for me?"
    - "How long should it take to reach 1500?"

CONFIDENCE GUIDE:

- 0.9-1.0: unambiguous; the question fits cleanly in one category
- 0.5-0.8: clear primary fit but with overlap to one neighbor, or the rule-of-thumb resolution below applied
- 0.0-0.4: reserved for genuinely non-coaching or non-classifiable questions ("What" / "hi" / off-topic), or ambiguity between two non-default categories where no focus dominates. Most ambiguity between meta_motivational and a substantive category should resolve at 0.5-0.7 per the rule of thumb below — not default-route.

DISAMBIGUATION HINTS (heuristics, not absolute rules — generally more true than not, but can vary case-to-case):

- A question referencing "this game" / "I played" usually fits game_review.
- A question referencing "this position" / "here" with no named game usually fits position_analysis; when a game is named, prefer game_review.
- A question about another player usually fits opponent_prep, not concept_explanation.
- A question that names a concept inside a specific position ("Why is the knight an outpost here?") usually fits position_analysis (the position is the locus), not concept_explanation.
- A question that names a concept abstractly ("What's an outpost?") usually fits concept_explanation.
- A question about HOW to study ("What should I study?") usually fits improvement_strategy.
- A question about FEELINGS, self-doubt, or general progress ("Am I improving?") usually fits meta_motivational — but see the rule of thumb below.

RULE OF THUMB — meta_motivational is the low-confidence default; treat it as a last resort:

meta_motivational is the default route when confidence falls below 0.5. **This default exists for genuinely non-coaching or non-classifiable questions, not for borderline coaching questions.** When a question feels ambiguous between meta_motivational and a substantive category, the substantive coaching topic is usually the focus and meta_motivational is usually NOT the focus. Lean toward the non-default category at moderate confidence (0.5-0.7) rather than defaulting.

Example: "I'm always confused about pawn structures" reads as concept_explanation with frustration framing — not the other way around. Classify as concept_explanation at ~0.6, not meta_motivational at 0.4.

The rule is a heuristic, not always accurate. A question like "I just lost 5 in a row, what's wrong with me?" mentions losses (game_review-adjacent) but the focus is clearly meta_motivational — trust your read of the focus over the rule.

If a question is genuinely ambiguous between two non-default categories with no clear focus, lower confidence to 0.3-0.4 so the caller can default-route.`;

export function buildCategoryClassifierUserTurn(question: string): string {
  return `Question:\n\n${question}`;
}
