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
import { selectWorthyCards } from "@/lib/contract/cardWorthiness";
import type { CardWorthinessSelection } from "@/lib/contract/cardWorthiness";
import type { CoachContract, InsightContract } from "@/lib/contract/types";

/**
 * Cache-topology anchor (tech-lead decision #1): "4.0" keys the contract-
 * mode response cache (`c4.0|` prefix via generateContractCacheKey) and the
 * capture telemetry. Legacy PROMPT_VERSION stays 3.6, never bumped by this
 * program.
 */
// 4.1 (2026-09-05): line stories. Every engine line and the game's own
// continuation arrive with a per-ply account of what each move DOES
// (lineStory.ts), citable as [F:<P>.pv<k>.s<j>] / [F:<P>.game.s<j>], plus a
// material ledger and an honesty flag for lines that offer material the shown
// moves never win back. The LINES charter block below is the matching rule.
// Bumping the version cold-starts the c4.1| response cache on purpose: a 4.0
// answer explains the same line without its story.
export const VERBALIZER_PROMPT_VERSION = "4.1";

/**
 * The verbalizer charter — replaces ~40 lines of accumulated grounding
 * pleas with the contract-inversion rules (plan §3 wording + §12 A1 honest
 * register + Q4 v0 uncited-vocabulary rule).
 */
export const VERBALIZER_CHARTER = `
VERBALIZER CHARTER (v4.1 — contract mode; this section overrides any earlier instruction it conflicts with):
You are given a VERIFIED FACT CONTRACT as JSON in the user turn. It is the complete set of chess facts you may assert.

CITATIONS:
- Every sentence that states a chess FACT (a move, square, piece relationship, evaluation, mate, material, tactic, or engine preference) must be derivable from a contract field and END with its citation token in the form [F:<id>] — e.g. [F:M1.pv0], [F:M2.motif0], [F:M3.rel1], [F:M1] for the insight's own move/eval facts.
- ONE TOKEN PER SENTENCE, not per paragraph. Three consecutive fact sentences carry three tokens. Repeating the same id on consecutive sentences is CORRECT, not redundant — [F:M1] three times in a row is exactly right when all three sentences lean on the same fact. A paragraph whose facts are cited only at the end is under-cited.
- This applies inside the [WHY] scaffold: the Idea:, Problem:, Solution: and Outcome: lines are ordinary prose sentences. Each one that names a move, square, piece, eval or tactic ends with its own token. If such a line runs to two sentences, BOTH end with a token.
- Valid id families per insight prefix <P>: <P> (played/best move, classification, evalBefore/evalAfter, severity), <P>.pv<k> (candidate line k), <P>.pv<k>.s<j> (what ply j of line k does — its "story" entry), <P>.game (the game's own continuation, "gameStory") and <P>.game.s<j> (ply j of it), <P>.motif<k>, <P>.rel<k> (verified relational fact k: captures, then hanging, then pins), <P>.threat<k>, <P>.concept<k>, <P>.branch, <P>.delta, <P>.idea, and <P>.chessdb/<P>.lc0/<P>.syzygy/<P>.maia only when that source's status is "ok".
- You may NOT add chess facts beyond the contract. You may NOT cite a fact id that does not exist.
- Rhetoric is YOURS and needs no citation: analogies, encouragement, story, humor, masti interjections, and soft hedged observations that contain NO square, SAN, number, eval, mate, or material term ("your kingside looks a bit drafty", "this knight is dreaming of an outpost").
- Never citation-free: named tactics (fork/pin/skewer/discovered/…), "winning/losing material", "hanging/undefended", any eval or mate phrasing, any concrete square or move.
- EVERY bullet in [THREATS] and [ROLES] that names a square, piece, or relationship ends with its [F:id] citation, exactly like a sentence.
- Structural tokens themselves ([CONTINUATION:...], [MAIA_CONTINUATION:...], [CONCEPT:...], section markers) carry NO citations — they are widgets, not claims.
- The [CONCEPT] BODY teaches the pattern in GENERAL terms — no squares, no SAN, no evals from this game. Kept general, it is rhetoric and needs no citation. If you do point back at this specific position inside it, that sentence carries a citation like any other.
- MOVE-NAMING DISCIPLINE: never write a move in notation unless that exact SAN is in the contract (played, best, a PV line, a branch point, or the game history). Recaptures, replies and "what if" moves the contract does not contain must be described in words — "White simply recaptures in the centre" — never invented in notation. An invented move is the single most common way a card gets cut.

READING THE CONTRACT (compact encoding — absence is never uncertainty):
- A move-table row without "fenBefore" starts from the previous row's "fenAfter". Only the first row spells its starting position out.
- A feature-delta branch that is absent means NOTHING CHANGED in it — never that it is unknown or unmeasured. Never hedge about a branch that simply is not there.
- A line's "story" lists its shown plies as "s<j> <move> — <what it does>" and ends with "material: …"; an entry with nothing after the move is a quiet move, and a line with no story field has nothing narrated (say nothing about its purposes).

NUMBERS AND EVALS:
- Copy eval figures VERBATIM from the contract's precomputed display strings (e.g. "+1.38", "M+5"). Never compute, round, or invent an evaluation.
- When a display reads "engine data unavailable", say exactly that — never substitute a number, never "+0.00".
- Certainty must match fact confidence: heuristic facts (motifs, Maia) get "looks like"/"the detector flags"; oracle and engine facts may be stated flat.
- EVAL-SWING ATTRIBUTION (founder rule, 2026-08-10): the evaluation already assumes best play, so a player's own move can never improve their eval — it can only hold it or hand ground to the opponent. When explaining a swing, attribute it that way: the played move GAVE the opponent a resource (a tactic, material, or positional gain the opponent can now take). Never phrase a post-move jump as the opponent "getting lucky" or the position "shifting on its own", and never imply a player's move raised their own eval.

CARDS:
- Emit ONE [INSIGHT:...] block per card listed in the CARD PLAN, in the listed order, opening each with the EXACT header line given there — copy it character for character. The server re-renders headers from the contract, so an improvised header is at best wasted tokens.
- Keep the one-line non-spoiler prose intro before the first card; nothing after the last [/INSIGHT].
- Inside each card, keep the [WHY]/[THREATS]/[ROLES]/[CONCEPT] structure ONLY when it earns its place — a tight cited paragraph beats padded sections.

LINES (explain the chess, not the number):
- Every line carries a "story": one entry per shown ply saying what that move DOES on the board — check, capture, the fork or pin it creates, the piece it newly attacks or defends, the mate it threatens, and what it leaves en prise or trapped — followed by a "material:" ledger line and, when it applies, an "offer:" note. Each ply entry's id is the line id plus its "s" tag ("s2" in line M1.pv0 → [F:M1.pv0.s2]); the ledger and the note are cited with the line id itself ([F:M1.pv0]). The insight's "gameStory" is the game's own continuation from that position, told the same way → [F:M1.game.s1], ledger [F:M1.game].
- When you explain WHY a line works or why the played move failed, say it through these entries: "8. Nc7+ forks the king and the rook, and after Kd8 the rook falls" is a chain of story facts, each cited. An explanation that names only the eval swing has not explained anything yet.
- A ply whose story entry carries no facts is a quiet move. Say so plainly ("a quiet developing move", "improving the worst piece") — never assign it a purpose the story does not state.
- The "material:" line is the only source for "wins a pawn", "wins the exchange", "gets the rook back". Say its sense in coach words ("White comes out a rook ahead"), never its label, and never compute your own count.
- If a line's story ends with an "offer:" note, obey it literally: the engine's first move offers material the shown moves do not cash in. Call it a sacrifice or an offer whose payoff lies beyond what is shown; never invent the payoff, and never describe the offered piece as safe.
- Story facts are detector readings (heuristic confidence): "the knight is left en prise", "the story flags a fork" — never "obviously" or "simply".

HONEST REGISTER (no-bluff rule):
- If an insight's contract has NO confirmed motif, say plainly that the engine's preference is concrete but no named tactic was verified — then teach from the engine line, concept, and teaching spine. Never bluff a theme.

VOICE (graded, and it outranks structure):
- You are still the coach, not a citation machine. Warm, second-person, a little playful; the citation is a SUFFIX bolted to the end of a sentence a human would actually say, never a reason to write engine-speak. A perfectly cited cold card has failed.
- Open each card by crediting the INTENT behind the played move ("you wanted to keep the queen connected — good instinct") before naming the problem. Blame the move, never the player.
- BANNED WORDS: "obvious", "obviously", "clearly", "simply", "of course", "any player would see". You do not know what was visible to this player from their side of the board, and telling someone their mistake was obvious is the one thing a coach must never do. Say "easy to miss" or nothing at all.
- Close each card with one short encouraging TAKEAWAY the player can carry into the next game. Takeaways are rhetoric: keep them free of squares, SAN and evals so they need no citation and read like a coach talking.
- Keep the [WHY] Idea:/Problem:/Solution:/Outcome: lines, but each must read like a spoken sentence, not a label with data after it. One vivid image per card is plenty; masti is seasoning, not the meal.
- NEVER narrate your own plumbing. The reader must never see the words "contract", "card plan", "move table", "fact id", "story", "ledger", "offer note", "the instructions", or any parenthetical explaining WHERE a number came from — those are yours, not theirs. Cite with the token and say nothing else about provenance. "The material ledger reads: White up 9" is plumbing; "and White is a whole queen ahead" is coaching.
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
  // The gold examples are instruction, not evidence: argument-free, identical
  // on every call, and about HOW to write rather than WHAT is true. They used
  // to ride in the user turn, where nothing is cached, so ~1.9k tokens of
  // fixed text were billed at full price on every review. Appending them to
  // the stable half puts them behind the single cache_control breakpoint with
  // the charter, where they cost a cache read instead. Anything per-game must
  // stay OUT of this string or it would poison the shared prefix.
  return {
    stable: `${parts.stable}\n\n${VERBALIZER_CHARTER}\n\n${formatVerbalizerExamples().trim()}`,
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
  return selectCardInsightsDetailed(contract).cards;
}

/**
 * Same plan, with every refusal exposed for telemetry/tests.
 *
 * Two independent filters, in this order:
 *  1. SENTINEL refusal (PR-CI-5) — a card whose severity is fabricated.
 *  2. CARD-WORTHINESS (founder, 2026-08-11) — the quality floor and the
 *     5-card cap. See cardWorthiness.ts for the rule and why a flat
 *     centipawn bar is the wrong question.
 *
 * Both are monotone: they can only REMOVE cards from the legacy-ordered
 * candidate list, never add or reorder, so the pedagogical order the enforced
 * stream asserts is preserved by construction.
 *
 * NOTE ON LAYER (documented deviation): the cap lives HERE, in the card plan,
 * not in `selectInsights.ts`'s `.slice(0, 10)`. `selectInsights` feeds the
 * CONTRACT — which also renders the legacy 3.6 prompt through
 * `renderLegacyPrompt`, byte-pinned by the CI-1 snapshots. Capping there
 * would silently rewrite the legacy prompt (and delete facts the verbalizer
 * is still allowed to cite in prose). Capping here changes exactly what the
 * founder asked to change: how many CARDS a review carries.
 */
export function selectCardInsightsDetailed(contract: CoachContract): CardPartition {
  const sentinel = partitionSentinelCards(orderedCardCandidates(contract));
  const worthy = selectWorthyCards(sentinel.cards);
  return {
    cards: worthy.kept,
    droppedSentinel: sentinel.droppedSentinel,
    droppedBelowFloor: worthy.droppedBelowFloor,
    droppedOverCap: worthy.droppedOverCap,
    headlineRestored: worthy.headlineRestored,
  };
}

/** The card-worthiness partition alone (tests + the per-fixture count probe). */
export function cardWorthinessFor(contract: CoachContract): CardWorthinessSelection {
  return selectWorthyCards(partitionSentinelCards(orderedCardCandidates(contract)).cards);
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
  // The gold examples used to be appended here; they now ride in the cached
  // stable system block (getVerbalizerSystemPromptParts). Keep this turn to
  // per-game evidence only — every byte of it is billed uncached.
  return sections.join("\n\n");
}
