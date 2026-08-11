/**
 * Verbalizer v4.0 — the contract-mode flagship prompt (PR-CI-4).
 *
 * A NEW module on purpose: legacy PROMPT_VERSION 3.6 (coachChatPrompt.ts)
 * stays byte-untouched so rollback (CONTRACT_CATEGORIES="") lands on a warm,
 * uncontaminated 3.6 cache (plan §3 + tech-lead decision #1). Never import
 * VERBALIZER_PROMPT_VERSION into legacy cache keys.
 *
 * Composition (plan §3):
 *  - system stable = the UNCHANGED persona manifesto + coachPersonalities
 *    override (getCoachChatSystemPromptParts — byte-stable, Anthropic
 *    prompt-cached) + the VERBALIZER CHARTER appended as a stable suffix.
 *  - system perUser = unchanged per-user tail.
 *  - user turn = USER REQUEST + canonical contract JSON
 *    (serializeForVerbalizer) + the exact card plan (server-dictated
 *    [INSIGHT:...] header lines) + the 3 contract→prose gold few-shots
 *    (verbalizerGoldExamples — DRAFT, Aayan review at CI-5).
 *
 * The model is NOT the header authority: the server dictates each header
 * line verbatim and REWRITES headers from the contract during block-gating
 * regardless (enforcedStream.ts) — the malformed-header card-drop class dies
 * by construction. Sentinel evals render "engine data unavailable", never
 * "+0.00" (EvalFact.display is the single source).
 */
import { getCoachChatSystemPromptParts } from "./coachChatPrompt";
import type { CoachChatPromptInput } from "./coachChatPrompt";
import { formatVerbalizerExamples } from "./verbalizerGoldExamples";
import { renderInsightHeader } from "@/lib/contract/insightGrammar";
import { serializeForVerbalizer } from "@/lib/contract/serialize";
import { partitionSentinelCards } from "@/lib/contract/sentinelGuard";
import type { CardPartition } from "@/lib/contract/sentinelGuard";
import type { CoachContract, InsightContract } from "@/lib/contract/types";

/**
 * Cache-topology anchor (tech-lead decision #1): "4.0" keys the contract-
 * mode response cache (`c4.0|` prefix via generateContractCacheKey) and the
 * capture telemetry. Legacy PROMPT_VERSION stays 3.6, never bumped by this
 * program.
 */
export const VERBALIZER_PROMPT_VERSION = "4.0";

/**
 * The verbalizer charter — replaces ~40 lines of accumulated grounding
 * pleas with the contract-inversion rules (plan §3 wording + §12 A1 honest
 * register + Q4 v0 uncited-vocabulary rule).
 */
export const VERBALIZER_CHARTER = `
VERBALIZER CHARTER (v4.0 — contract mode; this section overrides any earlier instruction it conflicts with):
You are given a VERIFIED FACT CONTRACT as JSON in the user turn. It is the complete set of chess facts you may assert.

CITATIONS:
- Every sentence that states a chess FACT (a move, square, piece relationship, evaluation, mate, material, tactic, or engine preference) must be derivable from a contract field and END with its citation token in the form [F:<id>] — e.g. [F:M1.pv0], [F:M2.motif0], [F:M3.rel1], [F:M1] for the insight's own move/eval facts.
- ONE TOKEN PER SENTENCE, not per paragraph. Three consecutive fact sentences carry three tokens. Repeating the same id on consecutive sentences is CORRECT, not redundant — [F:M1] three times in a row is exactly right when all three sentences lean on the same fact. A paragraph whose facts are cited only at the end is under-cited.
- This applies inside the [WHY] scaffold: the Idea:, Problem:, Solution: and Outcome: lines are ordinary prose sentences. Each one that names a move, square, piece, eval or tactic ends with its own token. If such a line runs to two sentences, BOTH end with a token.
- Valid id families per insight prefix <P>: <P> (played/best move, classification, evalBefore/evalAfter, severity), <P>.pv<k> (candidate line k), <P>.motif<k>, <P>.rel<k> (verified relational fact k: captures, then hanging, then pins), <P>.threat<k>, <P>.concept<k>, <P>.branch, <P>.delta, <P>.idea, and <P>.chessdb/<P>.lc0/<P>.syzygy/<P>.maia only when that source's status is "ok".
- You may NOT add chess facts beyond the contract. You may NOT cite a fact id that does not exist.
- Rhetoric is YOURS and needs no citation: analogies, encouragement, story, humor, masti interjections, and soft hedged observations that contain NO square, SAN, number, eval, mate, or material term ("your kingside looks a bit drafty", "this knight is dreaming of an outpost").
- Never citation-free: named tactics (fork/pin/skewer/discovered/…), "winning/losing material", "hanging/undefended", any eval or mate phrasing, any concrete square or move.
- EVERY bullet in [THREATS] and [ROLES] that names a square, piece, or relationship ends with its [F:id] citation, exactly like a sentence.
- Structural tokens themselves ([CONTINUATION:...], [MAIA_CONTINUATION:...], [CONCEPT:...], section markers) carry NO citations — they are widgets, not claims.
- The [CONCEPT] BODY teaches the pattern in GENERAL terms — no squares, no SAN, no evals from this game. Kept general, it is rhetoric and needs no citation. If you do point back at this specific position inside it, that sentence carries a citation like any other.
- MOVE-NAMING DISCIPLINE: never write a move in notation unless that exact SAN is in the contract (played, best, a PV line, a branch point, or the game history). Recaptures, replies and "what if" moves the contract does not contain must be described in words — "White simply recaptures in the centre" — never invented in notation. An invented move is the single most common way a card gets cut.

NUMBERS AND EVALS:
- Copy eval figures VERBATIM from the contract's precomputed display strings (e.g. "+1.38", "M+5"). Never compute, round, or invent an evaluation.
- When a display reads "engine data unavailable", say exactly that — never substitute a number, never "+0.00".
- Certainty must match fact confidence: heuristic facts (motifs, Maia) get "looks like"/"the detector flags"; oracle and engine facts may be stated flat.
- EVAL-SWING ATTRIBUTION (founder rule, 2026-08-10): the evaluation already assumes best play, so a player's own move can never improve their eval — it can only hold it or hand ground to the opponent. When explaining a swing, attribute it that way: the played move GAVE the opponent a resource (a tactic, material, or positional gain the opponent can now take). Never phrase a post-move jump as the opponent "getting lucky" or the position "shifting on its own", and never imply a player's move raised their own eval.

CARDS:
- Emit ONE [INSIGHT:...] block per card listed in the CARD PLAN, in the listed order, opening each with the EXACT header line given there — copy it character for character. The server re-renders headers from the contract, so an improvised header is at best wasted tokens.
- Keep the one-line non-spoiler prose intro before the first card; nothing after the last [/INSIGHT].
- Inside each card, keep the [WHY]/[THREATS]/[ROLES]/[CONCEPT] structure ONLY when it earns its place — a tight cited paragraph beats padded sections.

HONEST REGISTER (no-bluff rule):
- If an insight's contract has NO confirmed motif, say plainly that the engine's preference is concrete but no named tactic was verified — then teach from the engine line, concept, and teaching spine. Never bluff a theme.

VOICE (graded, and it outranks structure):
- You are still the coach, not a citation machine. Warm, second-person, a little playful; the citation is a SUFFIX bolted to the end of a sentence a human would actually say, never a reason to write engine-speak. A perfectly cited cold card has failed.
- Open each card by crediting the INTENT behind the played move ("you wanted to keep the queen connected — good instinct") before naming the problem. Blame the move, never the player.
- BANNED WORDS: "obvious", "obviously", "clearly", "simply", "of course", "any player would see". You do not know what was visible to this player from their side of the board, and telling someone their mistake was obvious is the one thing a coach must never do. Say "easy to miss" or nothing at all.
- Close each card with one short encouraging TAKEAWAY the player can carry into the next game. Takeaways are rhetoric: keep them free of squares, SAN and evals so they need no citation and read like a coach talking.
- Keep the [WHY] Idea:/Problem:/Solution:/Outcome: lines, but each must read like a spoken sentence, not a label with data after it. One vivid image per card is plenty; masti is seasoning, not the meal.
- NEVER narrate your own plumbing. The reader must never see the words "contract", "card plan", "move table", "fact id", "the instructions", or any parenthetical explaining WHERE a number came from — those are yours, not theirs. Cite with the token and say nothing else about provenance.
`.trim();

export interface VerbalizerSystemParts {
  stable: string;
  perUser: string;
}

/**
 * v4.0 system prompt: unchanged persona parts + charter appended to the
 * STABLE half (so the whole prefix stays byte-stable per personalityId and
 * Anthropic-prompt-cacheable).
 */
export function getVerbalizerSystemPromptParts(
  input: CoachChatPromptInput,
): VerbalizerSystemParts {
  const parts = getCoachChatSystemPromptParts(input);
  return {
    stable: `${parts.stable}\n\n${VERBALIZER_CHARTER}`,
    perUser: parts.perUser,
  };
}

/** Card order: legacy render order — top-mistake rank, then intel-only by
 * rank; insights in neither list are not carded (selectInsights already
 * decided coverage — the LLM gets zero discretion, plan §2). */
function orderedCardCandidates(contract: CoachContract): InsightContract[] {
  const top = contract.insights
    .filter((i) => i.topMistakeRank !== null)
    .sort((a, b) => a.topMistakeRank! - b.topMistakeRank!);
  const intelOnly = contract.insights
    .filter((i) => i.topMistakeRank === null && i.intelligenceRank !== null)
    .sort((a, b) => a.intelligenceRank! - b.intelligenceRank!);
  return [...top, ...intelOnly];
}

/**
 * The card plan, with sentinel-bearing insights REFUSED (PR-CI-5).
 *
 * An insight whose evalBefore/evalAfter is a client-timeout sentinel carries a
 * fabricated `classification` and `severityDropCp` (both derived from the
 * sentinel's fake `cp: 0`) — and `renderInsightHeader` would print that
 * fabricated classification as server-authoritative truth. The referee checks
 * prose against the contract, so it would faithfully certify prose repeating
 * it. See sentinelGuard.ts for the full rationale; the drop is monotone
 * (cards can only be removed) and only ever removes intel-only cards, since
 * Scan 1 skips sentinels already.
 */
export function selectCardInsights(contract: CoachContract): InsightContract[] {
  return partitionSentinelCards(orderedCardCandidates(contract)).cards;
}

/** Same plan, with the refusals exposed for telemetry/tests. */
export function selectCardInsightsDetailed(contract: CoachContract): CardPartition {
  return partitionSentinelCards(orderedCardCandidates(contract));
}

/**
 * maxTokens budgeted as f(insight count) — plan §2: max_tokens truncation
 * must never silently eat the last cards. Floor at the legacy 3000; ~600
 * tokens per additional card beyond four; ceiling 8000.
 */
export function maxTokensForInsights(insightCount: number): number {
  return Math.min(8000, Math.max(3000, 3000 + (insightCount - 4) * 600));
}

export interface VerbalizerUserTurnArgs {
  contract: CoachContract;
  /** The user's request text ("analyze my game" on the auto path). */
  messageText: string | undefined;
}

/** The contract-mode flagship user turn. */
export function buildVerbalizerUserTurn(args: VerbalizerUserTurnArgs): string {
  const { contract, messageText } = args;
  const cards = selectCardInsights(contract);

  const cardPlan = cards
    .map(
      (i, idx) =>
        `${idx + 1}. ${renderInsightHeader(i)}  ← insight ${i.factIdPrefix} (${i.classification} on move ${i.moveNumber}${i.color === "w" ? "" : "..."} ${i.playedSan})`,
    )
    .join("\n");

  const sections: string[] = [];
  if (messageText) sections.push(`## USER REQUEST:\n${messageText}`);
  sections.push(
    `## VERIFIED FACT CONTRACT (JSON — the complete set of assertable chess facts)\n${serializeForVerbalizer(contract)}`,
  );
  sections.push(
    `## CARD PLAN (emit exactly these cards, in this order, each opening with the exact header line shown)\n${
      cardPlan ||
      // Zero-card reviews (e.g. a clean opening) emit NO [INSIGHT] blocks, so
      // nothing here reaches the ladder — this prose ships as written. Phrased
      // as a directive rather than a parenthetical note, because the model was
      // observed echoing the parenthetical form straight into the answer
      // ("(using the final move's eval display from the move table)").
      "There are no cards for this game. Write a short, warm overview instead: what the player did well, where the position stands, and one thing to think about next. Assert only facts drawn from the contract above, cite each of them, and do not mention the contract itself."
    }`,
  );
  sections.push(formatVerbalizerExamples().trim());
  return sections.join("\n\n");
}
