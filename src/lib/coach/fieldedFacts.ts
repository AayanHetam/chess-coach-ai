/**
 * What a fielded follow-up (pathway 3.1) is checked against: the move the
 * question names (questionAnchor.ts), the review's own finding for it when
 * it was one, the engine's line and the game's own continuation from the
 * board before it, and a verified what-if when the player asked one.
 *
 * Only a turn about one move is fielded: an anchor, a contract to referee
 * against, a turn about the player's side (a turn about the other side
 * keeps the v1 prompt and its subject clause) and not a walkthrough, which
 * does not fit two lines. Every other turn is served by the v1 prompt,
 * byte for byte.
 *
 * Pure.
 */
import { Chess } from "chess.js";
import type { CompactContract } from "@/lib/contract/followUp";
import type { QuestionAnchor } from "./questionAnchor";
import type { VerifiedWhatIf } from "./clientEvals";
import type { MomentFacts, ProofCandidate } from "./momentChecks";
import {
  anchorAlternativeFen,
  anchorBestSan,
  anchorEngineLine,
  anchorStoryLines,
} from "./followUpContext";
import { isWalkthroughQuestion } from "./questionShape";
import type { FieldedMomentLabel } from "@/lib/prompts/fieldedFollowUpPrompt";

/** Plies of the game's own continuation the proof may show; the client's longest. */
const PLAYED_LINE_PLIES = 6;

export interface FieldedMomentFacts extends FieldedMomentLabel {
  facts: MomentFacts;
  /** The move was one of the review's findings. */
  reviewed: boolean;
  fenBefore: string;
  fenAfter: string;
}

export type FieldedIneligible =
  | "no_contract"
  | "no_anchor"
  | "other_side"
  | "walkthrough"
  | "no_facts";

export type FieldedPlan =
  | { eligible: true; facts: FieldedMomentFacts }
  | { eligible: false; reason: FieldedIneligible };

const bare = (san: string) => san.replace(/[+#!?]/g, "");
/** The board's placement and side to move: two FENs of one position agree on these. */
const positionOf = (fen: string) => fen.split(" ").slice(0, 2).join(" ");

export function planFieldedTurn(i: {
  anchor: QuestionAnchor | null;
  otherSide: "w" | "b" | null;
  compact: CompactContract | undefined;
  question: string;
  playedMoves: readonly string[];
  gameEval: Parameters<typeof anchorEngineLine>[1];
  playerColor: "w" | "b";
  whatIf: VerifiedWhatIf | null;
}): FieldedPlan {
  if (!i.compact) return { eligible: false, reason: "no_contract" };
  const anchor = i.anchor;
  if (!anchor) return { eligible: false, reason: "no_anchor" };
  if (i.otherSide) return { eligible: false, reason: "other_side" };
  if (isWalkthroughQuestion(i.question))
    return { eligible: false, reason: "walkthrough" };
  try {
    return { eligible: true, facts: buildFacts(i, anchor, i.compact) };
  } catch {
    return { eligible: false, reason: "no_facts" };
  }
}

function buildFacts(
  i: Parameters<typeof planFieldedTurn>[0],
  anchor: QuestionAnchor,
  compact: CompactContract
): FieldedMomentFacts {
  const { moveNumber, color } = anchor;
  const label = (san: string) =>
    `${moveNumber}${color === "w" ? "." : "..."} ${san}`;

  const engine = anchorEngineLine(anchor, i.gameEval);
  const played = i.playedMoves.slice(
    anchor.index,
    anchor.index + PLAYED_LINE_PLIES
  );
  const insight = compact.insights.find(
    (x) =>
      x.moveNumber === moveNumber &&
      x.color === color &&
      positionOf(x.fenBefore) === positionOf(anchor.fenBefore)
  );
  const askedSan =
    anchor.askedSan ?? i.whatIf?.moves.find((m) => m.role === "asked")?.san;

  // The moves the prose may name: all played from the board before the move.
  const own: string[] = [];
  for (const san of [
    anchor.san,
    askedSan,
    anchorBestSan(anchor, i.gameEval),
    engine[0],
    insight?.bestSan,
    ...(i.whatIf?.moves.map((m) => m.san) ?? []),
  ]) {
    if (san && !own.some((o) => bare(o) === bare(san))) own.push(san);
  }

  let bestFen: string | null = null;
  if (engine[0]) {
    const g = new Chess(anchor.fenBefore);
    if (g.move(engine[0])) bestFen = g.fen();
  }
  const altFen = anchorAlternativeFen(anchor);

  const lines: ProofCandidate[] = [];
  const candidate = (
    kind: ProofCandidate["kind"],
    sans: readonly string[]
  ): ProofCandidate => ({
    kind,
    moveNumber,
    color,
    startFen: anchor.fenBefore,
    startPly: anchor.index,
    sans,
    evalDisplay: null,
  });
  if (engine.length > 0) lines.push(candidate("engine", engine));
  if (played.length > 0) lines.push(candidate("played", played));

  const askedLine = i.whatIf?.moves.find((m) => m.role === "asked");
  const licence = [
    ...anchorStoryLines(anchor.fenBefore, engine),
    ...anchorStoryLines(anchor.fenBefore, played),
    ...(insight
      ? [
          ...insight.allowedTacticalKeywords,
          ...insight.motifSayables,
          ...insight.bestLineStory,
          ...insight.gameStory,
          ...insight.relationalSayables,
        ]
      : []),
    ...(i.whatIf && askedLine
      ? anchorStoryLines(i.whatIf.fenBefore, askedLine.lineSan)
      : []),
  ];

  const facts: MomentFacts = {
    fen: anchor.fenBefore,
    // Half-moves played before the move: the anchor's index, not its ply
    // (the ply is the cursor after it).
    ply: anchor.index,
    playerColor: i.playerColor,
    ownMoves: own,
    lines,
    licence,
    boards: [anchor.fenAfter, altFen, bestFen].filter((f): f is string => !!f),
  };

  return {
    label: label(anchor.san),
    moveNumber,
    color,
    ownLabels: own.map(label),
    askedLabel: askedSan ? label(askedSan) : null,
    hasEngineLine: engine.length > 0,
    hasPlayedLine: played.length > 0,
    facts,
    reviewed: !!insight,
    fenBefore: anchor.fenBefore,
    fenAfter: anchor.fenAfter,
  };
}
