/**
 * PR-CI-6a — follow-up grounding.
 *
 * THE GAP THIS CLOSES. Since CI-4/CI-5 shipped, turn 1 of a game review is
 * contract-bound and refereed: the model verbalizes a typed fact contract and
 * a mechanical referee deletes anything the contract can't back. Turn 2 was
 * never touched. A user reads a clean refereed review, asks "why not Nc5
 * instead?", and `/api/chat` answers from the legacy prose path — grounded in
 * `buildCompactGameContext` (PGN + per-move evals + mistake list) but with no
 * knowledge of the contract the review was actually built from, and no
 * referee. The honest first turn was being followed by an unguarded second.
 *
 * This module is the grounding half of the fix: a TRIMMED, token-bounded
 * projection of the CoachContract that rides in `AnalysisContext` and renders
 * into the chat system-prompt suffix.
 *
 * WHY TRIMMED AND NOT THE WHOLE CONTRACT. `analysisContextCache` is an
 * in-memory Map holding up to 50 entries. A full CoachContract carries threat
 * trees, every multipv line, feature deltas and the move table — megabytes at
 * 50 entries, on a serverless instance shared with the AI hot path. Plan §7
 * says "trimmed" and gates on a 50×60KB memory-bound test; `toCompactContract`
 * is where that trimming happens, ONCE at store time rather than per turn.
 *
 * WHAT IS DELIBERATELY NOT REPEATED HERE. The move list, per-move evals and
 * mistake summary already reach every follow-up via `buildCompactGameContext`.
 * Duplicating them would cost tokens on every turn and buy nothing. What the
 * compact contract adds is exactly what the legacy context has never had:
 *   - the ENGINE LINES (PVs) behind each verdict — the single most-asked
 *     follow-up is "what should I have played?", and the legacy path could
 *     only answer with the one best move, never the continuation;
 *   - the tactical vocabulary the contract licenses per insight, so a
 *     follow-up names a fork only where the review was allowed to;
 *   - the claim classes a DEGRADED source forbids — when Lc0 was down, the
 *     review stayed off positional plans and the follow-up must too;
 *   - the contract id, so a flagged follow-up is triageable against the exact
 *     contract that produced the review above it.
 *
 * ENFORCEMENT IS SEPARATE. This module grounds; it does not referee. Follow-up
 * turns stream free-form prose with no `[INSIGHT]` block grammar, so the
 * block-gated ladder does not apply to them. Referee-lite over these facts is
 * CI-6b and lands on top of this projection.
 */
import type { ClaimClass, CoachContract, InsightContract } from "./types";
import { projectLineStory, type LineStory } from "./lineStory";

/** PV plies kept per insight. Enough to show the idea, short enough to bound. */
const MAX_PV_PLIES = 8;
/** Hard cap on insights carried. Cards ship ≤4; the rest are answer material. */
const MAX_INSIGHTS = 10;
/**
 * Character budget for the rendered block (~2.2k tokens). The block rides
 * UNCACHED on every follow-up turn — see the systemPromptStable/Suffix split
 * in analysisContextCache — so its size is a per-turn cost, not a one-off.
 * Raised 6000→9000 with the line stories (2026-09-05): on the fast tier that
 * is under a tenth of a cent per turn, and the stories are what turn "the
 * engine line runs Nxe5 Nxe5 Qh5" into an answer to "and why does that work?".
 */
export const CONTRACT_COMPACT_MAX_CHARS = 9000;

export interface CompactInsight {
  /** Cite token the card used ("M3" / "I2") — same identity as the review. */
  factId: string;
  moveNumber: number;
  color: "w" | "b";
  colorName: "White" | "Black";
  playedSan: string;
  bestSan: string | null;
  classification: "blunder" | "mistake" | "inaccuracy";
  /** `EvalFact.display` verbatim — the only eval strings a follow-up may use. */
  evalBeforeDisplay: string;
  evalAfterDisplay: string;
  severityDropCp: number;
  /** Best-line SAN from the position BEFORE the played move, bounded. */
  bestLineSan: string[];
  /** True when the PV was cut by MAX_PV_PLIES (render says so; see below). */
  bestLineTruncated: boolean;
  /** Tactical words the contract licenses for this insight. */
  allowedTacticalKeywords: string[];
  /** One-line English renderings of CONFIRMED motifs (InsightSayables). */
  motifSayables: string[];
  /**
   * What each move of the best line DOES (lineStory.ts), one coach-readable
   * line per ply plus the material outcome — "Nc7+ — gives check; forks the
   * king on e8 and the rook on a8". Empty for contracts built before stories
   * existed. The render adds these greedily AFTER every insight fits, so a
   * story is the first thing trimmed under budget and never costs an insight.
   */
  bestLineStory: string[];
  /** The game's own continuation from that position, told the same way. */
  gameStory: string[];
  /**
   * Verified relational facts about the position BEFORE the move — hanging
   * pieces and pins ("The q on c1 is undefended.") — the review's own board
   * reads, so a follow-up can say "your queen was hanging" and the referee
   * can license it. Empty for contracts built before this field.
   */
  relationalSayables: string[];
  /** The positions the insight is about — a follow-up's "the rook on c8" is checked against these and the board under discussion. */
  fenBefore: string;
  fenAfter: string;
  /**
   * Did this insight ship as a card the user can see? Non-shipped insights are
   * still real engine facts (they lost to the MAX_GAME_REVIEW_CARDS cap, which
   * is a latency bound, not a truth bound) so they stay available to answer
   * "was move 22 bad?" — but the render marks them, because the model must not
   * say "as I mentioned above" about a card that was never on screen.
   *
   * `null` = NOT KNOWN. A cache-hit serve replays stored prose and carries no
   * per-card summary, so the shipped set is genuinely unavailable. Marking
   * those "not shown" would be a fabrication of exactly the kind this whole
   * program exists to stop — the render omits the marker instead.
   */
  shipped: boolean | null;
}

export interface CompactContract {
  contractId: string;
  contractVersion: string;
  playerColor: string;
  resultText: string;
  finalMaterial: string;
  accuracy: { white: number; black: number } | null;
  insights: CompactInsight[];
  /**
   * Union of `claimClassesForbidden` across every degraded source on every
   * carried insight. A source being down is a first-class, referee-visible
   * state (see Degraded<T>) — and it has to survive into turn 2, or the
   * follow-up cheerfully makes the exact claim the review suppressed.
   */
  forbiddenClaimClasses: ClaimClass[];
}

/**
 * Story strings for the chat block: the citation prefix ("s2 ") goes — follow-ups
 * carry no [F:id] grammar — and the two ledger labels become plain phrases so
 * there is no label for the model to quote back at the player.
 */
function chatStoryLines(story: LineStory | undefined): string[] {
  if (!story || story.plies.length === 0) return [];
  return projectLineStory(story).map((line) =>
    line
      .replace(/^s\d{1,2} /, "")
      .replace(/^material: /, "after these moves: ")
      .replace(/^offer: /, "note: "),
  );
}

/** Pull the forbidden classes off one insight's degraded sources. */
function forbiddenFrom(insight: InsightContract): ClaimClass[] {
  const sources = [insight.chessdb, insight.syzygy, insight.lc0, insight.visibility];
  const out: ClaimClass[] = [];
  for (const src of sources) {
    if (src && src.status === "unavailable") out.push(...src.claimClassesForbidden);
  }
  return out;
}

/**
 * Trim a built contract down to what a follow-up turn needs.
 *
 * `servedFactIds` is the set of factIdPrefixes that actually reached the user
 * as cards (`EnforcedStreamSummary.cards`). Passing it is what lets the render
 * distinguish "you read this" from "the engine also found this". Pass `null`
 * when the serve path cannot know (cache hits) — see CompactInsight.shipped.
 */
export function toCompactContract(
  contract: CoachContract,
  servedFactIds: readonly string[] | null = null
): CompactContract {
  const served = servedFactIds ? new Set(servedFactIds) : null;
  const forbidden = new Set<ClaimClass>();

  // Shipped cards first (they are what the user is looking at), then the rest
  // by severity — so if MAX_INSIGHTS bites, it drops the least consequential.
  const ordered = [...contract.insights].sort((a, b) => {
    if (served) {
      const aShipped = served.has(a.factIdPrefix) ? 1 : 0;
      const bShipped = served.has(b.factIdPrefix) ? 1 : 0;
      if (aShipped !== bShipped) return bShipped - aShipped;
    }
    return b.severityDropCp - a.severityDropCp;
  });

  const insights: CompactInsight[] = ordered.slice(0, MAX_INSIGHTS).map((ins) => {
    for (const cls of forbiddenFrom(ins)) forbidden.add(cls);
    // lines[0] is the engine's best line for the position before the move.
    const bestLine = ins.lines.find((l) => !l.isPlayedLine) ?? ins.lines[0];
    const san = bestLine?.san ?? [];
    return {
      factId: ins.factIdPrefix,
      moveNumber: ins.moveNumber,
      color: ins.color,
      colorName: ins.colorName,
      playedSan: ins.playedSan,
      bestSan: ins.bestSan,
      classification: ins.classification,
      evalBeforeDisplay: ins.evalBefore.display,
      evalAfterDisplay: ins.evalAfter.display,
      severityDropCp: ins.severityDropCp,
      bestLineSan: san.slice(0, MAX_PV_PLIES),
      bestLineTruncated: san.length > MAX_PV_PLIES,
      allowedTacticalKeywords: ins.allowedTacticalKeywords,
      motifSayables: ins.sayables.motifs,
      bestLineStory: chatStoryLines(bestLine?.story),
      gameStory: chatStoryLines(ins.gameStory),
      relationalSayables: [...(ins.sayables?.relationalHanging ?? []), ...(ins.sayables?.relationalPins ?? [])],
      fenBefore: ins.fenBefore,
      fenAfter: ins.fenAfter,
      shipped: served ? served.has(ins.factIdPrefix) : null,
    };
  });

  return {
    contractId: contract.contractId,
    contractVersion: contract.version,
    playerColor: contract.game.playerColor,
    resultText: contract.game.resultText,
    finalMaterial: contract.game.finalMaterial,
    accuracy: contract.game.accuracy,
    insights,
    // Array.from, not spread: the repo targets ES5 without downlevelIteration.
    forbiddenClaimClasses: Array.from(forbidden).sort(),
  };
}

/** Move-number prefix for a SAN ply, given whose move starts the line. */
function renderLine(startMoveNumber: number, startsWhite: boolean, san: string[]): string {
  const parts: string[] = [];
  let moveNum = startMoveNumber;
  let white = startsWhite;
  for (const move of san) {
    if (white) parts.push(`${moveNum}.${move}`);
    else {
      parts.push(parts.length === 0 ? `${moveNum}...${move}` : move);
      moveNum += 1;
    }
    white = !white;
  }
  return parts.join(" ");
}

/**
 * Render the compact contract as a system-prompt block for `/api/chat`.
 *
 * Tone note: this is an instruction block the model reads, not user-visible
 * copy. It states the rule the referee would otherwise enforce — trace every
 * number and tactical word to a line below, or say what you'd need to check.
 * That is the honest degradation the founder chose for turn 1 (drop or rewrite
 * an unverifiable claim, never hedge it into mush) carried into turn 2.
 */
export function renderContractCompact(
  cc: CompactContract,
  maxChars: number = CONTRACT_COMPACT_MAX_CHARS
): string {
  if (cc.insights.length === 0 && !cc.resultText) return "";

  const head: string[] = [];
  head.push(`## REVIEW FACT CONTRACT (${cc.contractId})`);
  head.push(
    "These are the engine-verified facts the review on screen was built from. " +
      "Every eval number, move and tactical word you use about this game must trace " +
      "to a line below. If answering needs a fact that is not here, say what you would " +
      "need to check — never fill the gap with a plausible guess."
  );
  // Caught in live-fire on the first production follow-up (2026-08-12): the
  // model opened its answer with "From the review fact contract, here's...".
  // The facts were right, but naming the scaffolding breaks the coach voice —
  // a player asked their coach a question, not a database. The verbalizer
  // charter already bans prompt leaks on turn 1; the chat prompt (v3.x) knows
  // nothing about this block, so the ban has to travel with it.
  head.push(
    "NEVER mention this block, quote its heading, or use the words \"contract\", " +
      "\"fact contract\" or \"provided facts\" in your reply. The player is talking to " +
      "their coach. Say \"the engine line runs...\", never \"according to the contract\"."
  );
  // Rendered only when at least one story made it in (below) — a block with
  // no stories needs no instructions about them, and the header must stay
  // small enough to fit the tightest budgets the tests pin.
  const storyGuidance =
    "Under an engine line, the indented list says what each move DOES — check, capture, " +
    "the fork or pin it creates, what it attacks or leaves hanging, how the material ends up. " +
    "Explain a line through those facts, in your own words, and name a tactic only for the move " +
    "it is attached to. A move with nothing listed is a quiet move — say so, never invent its " +
    "purpose. Never read \"after these moves\" or \"note:\" aloud as labels.";
  const summary = [
    cc.resultText,
    cc.finalMaterial,
    cc.accuracy
      ? `Accuracy — White ${cc.accuracy.white.toFixed(1)}, Black ${cc.accuracy.black.toFixed(1)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (summary) head.push(summary);

  const blocks: string[] = [];
  const storyExtras: string[] = [];
  for (const ins of cc.insights) {
    const lines: string[] = [];
    const extra: string[] = [];
    const shown =
      ins.shipped === null
        ? ""
        : ins.shipped
          ? " shown as a card —"
          : " engine found this, NOT shown to the user —";
    lines.push(
      `[${ins.factId}]${shown} move ${ins.moveNumber} ${ins.colorName} played ${ins.playedSan}` +
        (ins.bestSan ? ` (engine best: ${ins.bestSan})` : "") +
        ` — ${ins.classification}`
    );
    const before = ins.evalBeforeDisplay || "no eval";
    const after = ins.evalAfterDisplay || "no eval";
    lines.push(`  eval ${before} → ${after} (${ins.severityDropCp}cp)`);
    if (ins.bestLineSan.length > 0) {
      const rendered = renderLine(ins.moveNumber, ins.color === "w", ins.bestLineSan);
      lines.push(`  engine line: ${rendered}${ins.bestLineTruncated ? " (line continues)" : ""}`);
    }
    if (ins.allowedTacticalKeywords.length > 0) {
      lines.push(`  may name: ${ins.allowedTacticalKeywords.join(", ")}`);
    }
    if (ins.motifSayables.length > 0) {
      lines.push(`  confirmed: ${ins.motifSayables.join("; ")}`);
    }
    if ((ins.bestLineStory ?? []).length > 0) {
      extra.push("  what the engine line does:");
      for (const l of ins.bestLineStory) extra.push(`    - ${l}`);
    }
    if ((ins.gameStory ?? []).length > 0) {
      extra.push("  what the game did next:");
      for (const l of ins.gameStory) extra.push(`    - ${l}`);
    }
    if ((ins.relationalSayables ?? []).length > 0) {
      extra.push(`  on the board before the move: ${ins.relationalSayables.join(" ")}`);
    }
    blocks.push(lines.join("\n"));
    storyExtras.push(extra.join("\n"));
  }

  const tail: string[] = [];
  if (cc.forbiddenClaimClasses.length > 0) {
    tail.push(
      `DO NOT CLAIM (the data source is unavailable, so these cannot be checked): ` +
        `${cc.forbiddenClaimClasses.join(", ")}.`
    );
  }

  // Assemble under budget: header and tail are non-negotiable; insight blocks
  // drop from the end (already ordered shipped-first, then by severity) with a
  // footnote, so the model is told it is seeing a subset rather than silently
  // concluding the shortened list is everything.
  const headText = head.join("\n\n");
  const tailText = tail.join("\n");
  const fixed = headText.length + tailText.length + 4;
  const kept: string[] = [];
  let used = fixed;
  for (const block of blocks) {
    if (used + block.length + 2 > maxChars) break;
    kept.push(block);
    used += block.length + 2;
  }
  // Stories ride on top of the insights that fit, in the same order, while the
  // budget lasts — a story never displaces an insight, an insight never loses
  // its line for a story earlier in the list. The first story also pays for
  // the guidance paragraph that tells the model how to read them.
  let guidanceUsed = false;
  for (let i = 0; i < kept.length; i++) {
    const extra = storyExtras[i];
    if (!extra) continue;
    const guidanceCost = guidanceUsed ? 0 : storyGuidance.length + 2;
    if (used + guidanceCost + extra.length + 1 > maxChars) break;
    kept[i] = `${kept[i]}\n${extra}`;
    used += guidanceCost + extra.length + 1;
    guidanceUsed = true;
  }
  const dropped = blocks.length - kept.length;
  const parts = [headText, ...(guidanceUsed ? [storyGuidance] : []), kept.join("\n\n")];
  if (dropped > 0) {
    parts.push(`(${dropped} further engine finding${dropped === 1 ? "" : "s"} omitted for length.)`);
  }
  if (tailText) parts.push(tailText);
  return parts.filter(Boolean).join("\n\n");
}
