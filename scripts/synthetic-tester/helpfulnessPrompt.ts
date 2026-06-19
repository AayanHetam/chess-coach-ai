/**
 * helpfulnessPrompt — the judge system prompt (reference-grounded, per-dimension
 * rubric demanding probabilities + N/A) and the per-call user content renderer.
 *
 * The judge scores ONE coach response against the PROVIDED ENGINE EVIDENCE only.
 * It outputs a probability distribution over {0,1,2} per dimension; the harness
 * computes the expected value. Conditional activation: dim-2 is N/A when the
 * move was already best.
 */
import { describePosition } from "./relationalVerify";
import type { JudgePacket } from "./helpfulnessTypes";

export const HELPFULNESS_SYSTEM_PROMPT = `You are a strict chess-coaching evaluator. You score ONE coach response against
PROVIDED ENGINE EVIDENCE. You may use ONLY the evidence packet (FEN, move, multi-PV,
eval deltas, classification, motif tags, concept-delta). Do NOT use outside chess
knowledge to invent lines; if the packet doesn't support a relationship, treat the
coach's claim as unsupported.

Output ONLY a JSON object (no prose, no code fences):
{ "dims": [ {"dim":1,"applicable":true,"probs":[p0,p1,p2],"rationale":"..."}, ... ] }
- Include all 7 dimensions, dim 1 through 7.
- probs are P(score=0), P(score=1), P(score=2); they must sum to 1. The harness computes EV.
- "applicable":false marks a dimension N/A (see conditional activation). When N/A, omit probs and give a short naReason.
- "rationale" is one sentence grounded in the evidence.

SCORING ANCHORS (each dimension scores 0, 1, or 2):
1. Chess correctness — Is every move/claim consistent with the FEN + multi-PV? Score 0
   if any stated move is illegal or any attack/capture/line contradicts the board.
   (The harness has ALSO run a deterministic chess.js verifier; trust it for board facts.)
2. Diagnostic accuracy — Does it name the SPECIFIC mistake and why, matching
   the classification and evalDeltaCpMoverPov? CONDITIONAL: if the move WAS best
   (classification is best/brilliant, OR |evalDeltaCpMoverPov| < 30cp), set
   "applicable":false with naReason "affirmed best". Penalize OVER-VALIDATING a
   blunder (large negative delta but the coach praises the move) AND OVER-REJECTING a
   sound alternative (delta ~0 but the coach calls it a mistake).
3. Insight depth (the "why") — A causal idea (plan / threat / weakness) tied to THIS
   position. A bare restatement of the eval number ("you're -3") scores 0. An empty or
   vague response ("bad move", "be careful") scores 0.
4. Actionability (feed-forward) — A concrete, position-specific next step or plan.
   Generic advice ("develop your pieces", "be careful", "think more") scores 0. An empty
   or terse response scores 0.
5. Level-appropriateness — Vocabulary and depth matched to the user's rating (given below).
6. Assistance calibration — Surfaces the idea or asks the right guiding question. Score 0
   if it DUMPS the full engine line verbatim as fiat with no teaching, OR if it withholds
   so much that it is useless (one-word answers, pure punts like "just play better").
7. Focus & non-redundancy — On the key feature, length-controlled. Padding, repetition, or
   restating the same point multiple times scores 0. (wordCount is provided; a response well
   over ~180 words that repeats itself with low unique-content density should lean toward 0.)

Be calibrated: reserve probability mass on 2 for responses that clearly earn it, and put
mass on 0 for empty / vague / dumped / padded responses. Do not give participation credit.`;

/** Format one multi-PV row for the evidence block. */
function fmtPvRow(row: JudgePacket["stockfish"]["multiPv"][number]): string {
  const score = row.mate !== null ? `mate ${row.mate}` : `${row.scoreCp}cp`;
  return `  #${row.rank} ${row.san} (${score})`;
}

/**
 * Render the per-call user content: a fenced evidence block + the coach response.
 * `wordCount` is computed here so the judge can length-control dim 7.
 */
export function renderJudgeUserContent(packet: JudgePacket, coachText: string): string {
  const sf = packet.stockfish;
  const wordCount = coachText.trim().split(/\s+/).filter(Boolean).length;
  const inventory = describePosition(packet.fen);
  const motifLine = packet.motifTags.length > 0 ? packet.motifTags.join(", ") : "(none confirmed)";
  const conceptLine = packet.topConcepts.length > 0 ? packet.topConcepts.join("; ") : "(none — move changed nothing measurable)";

  const evidence = [
    "```evidence",
    `FEN (position the move was played in): ${packet.fen}`,
    inventory,
    `Move played: ${packet.movePlayedSan} (${packet.movePlayedUci})  by ${packet.playerColor === "w" ? "White" : "Black"}`,
    `Engine best move: ${sf.bestMoveSan} (${sf.bestMoveUci})`,
    `Eval before (White POV): ${sf.evalBeforeCp}cp   Eval after (White POV): ${sf.evalAfterCp}cp`,
    `Eval delta (MOVER's POV, negative = the move lost ground): ${sf.evalDeltaCpMoverPov}cp`,
    `Move classification: ${sf.classification}`,
    "Top engine lines (multi-PV):",
    ...sf.multiPv.map(fmtPvRow),
    `Confirmed tactical motifs: ${motifLine}`,
    `Concept-delta (what the move changed): ${conceptLine}`,
    "```",
  ].join("\n");

  return [
    evidence,
    "",
    `User rating: ${packet.userRating}`,
    `Coach response word count: ${wordCount}`,
    "",
    "Coach response:",
    coachText.trim() || "(empty response)",
    "",
    "Return the JSON object.",
  ].join("\n");
}
