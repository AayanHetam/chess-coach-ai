/**
 * helpfulnessGrounding — builds the JudgePacket from engine evidence + the pure
 * grounding functions (motif detector, feature-delta engine). NO LLM, fully
 * deterministic given the engine. This packet is the only chess truth the judge
 * is allowed to use, so it bounds judge hallucination.
 *
 * All inputs are pure chess.js / Stockfish; importable under vitest and tsx.
 */
import { Chess } from "chess.js";
import { MoveClassification } from "../../src/types/enums";
import { normalizeEval, type EngineScore } from "./stockfish";
import { detectMotifs } from "@/lib/tactics";
import { compute_feature_delta, type PositionFeatureDelta } from "@/lib/mastermind/featureDelta";
import type { JudgePacket, StockfishPacket, EngineLike } from "./helpfulnessTypes";

/** Convert a UCI long-algebraic move to SAN in the given position (best-effort). */
function uciToSan(fen: string, uci: string): string {
  try {
    const c = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
    const mv = c.move({ from, to, promotion });
    return mv ? mv.san : uci;
  } catch {
    return uci;
  }
}

/** Split a White-POV EngineScore into {cp,mate} for the packet's multiPv rows. */
function scoreParts(score: EngineScore): { scoreCp: number | null; mate: number | null } {
  return score.kind === "cp"
    ? { scoreCp: score.cp, mate: null }
    : { scoreCp: null, mate: score.mate };
}

/**
 * Pick the top 1-2 NON-EMPTY sub-deltas as short labels. Returns [] when the
 * delta is empty (the move changed nothing measurable — judge should not invent
 * a concept). Ordered by salience: material > king safety > hanging > threats >
 * piece activity > pawn structure.
 */
export function topConceptLabels(d: PositionFeatureDelta, max = 2): string[] {
  if (d.isEmptyDelta) return [];
  const labels: string[] = [];

  // Material (mover-agnostic; report each side that changed).
  if (d.materialDelta.white !== 0) labels.push(`material w ${signed(d.materialDelta.white)}`);
  if (d.materialDelta.black !== 0) labels.push(`material b ${signed(d.materialDelta.black)}`);

  // King safety (higher = safer in the annotator's convention).
  if (d.kingSafetyDelta.white !== 0)
    labels.push(`king safety w ${signed(d.kingSafetyDelta.white)}`);
  if (d.kingSafetyDelta.black !== 0)
    labels.push(`king safety b ${signed(d.kingSafetyDelta.black)}`);

  // Hanging pieces.
  if (d.hangingPiecesDelta.newlyHanging.length > 0)
    labels.push(`newly hanging: ${d.hangingPiecesDelta.newlyHanging.map((h) => `${h.piece}${h.square}`).join(",")}`);
  if (d.hangingPiecesDelta.nowDefended.length > 0)
    labels.push(`now defended: ${d.hangingPiecesDelta.nowDefended.map((h) => `${h.piece}${h.square}`).join(",")}`);

  // Threats.
  if (d.threatsDelta.newThreats.length > 0)
    labels.push(`new threats: ${d.threatsDelta.newThreats.map((t) => t.type).join(",")}`);
  if (d.threatsDelta.resolvedThreats.length > 0)
    labels.push(`resolved threats: ${d.threatsDelta.resolvedThreats.map((t) => t.type).join(",")}`);

  // Piece activity.
  if (d.pieceActivityDelta.newlyTrapped.length > 0)
    labels.push(`newly trapped: ${d.pieceActivityDelta.newlyTrapped.map((p) => `${p.piece}${p.square}`).join(",")}`);
  if (d.pieceActivityDelta.gainedActive.length > 0)
    labels.push(`gained activity: ${d.pieceActivityDelta.gainedActive.map((p) => `${p.piece}${p.square}`).join(",")}`);
  if (d.pieceActivityDelta.lostActive.length > 0)
    labels.push(`lost activity: ${d.pieceActivityDelta.lostActive.map((p) => `${p.piece}${p.square}`).join(",")}`);

  // Pawn structure (open files, passed pawns).
  if (d.pawnStructureDelta.openFilesGained.length > 0)
    labels.push(`open files gained: ${d.pawnStructureDelta.openFilesGained.join(",")}`);
  if (d.pawnStructureDelta.passedPawnsGained.white.length > 0)
    labels.push(`white passed pawn: ${d.pawnStructureDelta.passedPawnsGained.white.join(",")}`);
  if (d.pawnStructureDelta.passedPawnsGained.black.length > 0)
    labels.push(`black passed pawn: ${d.pawnStructureDelta.passedPawnsGained.black.join(",")}`);

  return labels.slice(0, max);
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * Classify the played move by the cp it LOST relative to best (mover POV), NOT
 * the absolute eval swing. The old classifyBySwing(|Δ|) labelled a move that
 * IMPROVED the eval by 91cp as an "inaccuracy" (|91| ≥ 50) and ignored that the
 * best move was played. Playing the best move is "best"; a move that gains or
 * holds ground is "good"; only a move that gives ground is inaccuracy/mistake/blunder.
 */
export function classifyPlayedMove(
  movePlayedUci: string,
  bestMoveUci: string,
  evalDeltaCpMoverPov: number,
): MoveClassification {
  if (movePlayedUci === bestMoveUci) return MoveClassification.Best;
  const loss = Math.max(0, -evalDeltaCpMoverPov); // cp the mover gave up (≥0)
  if (loss >= 300) return MoveClassification.Blunder;
  if (loss >= 150) return MoveClassification.Mistake;
  if (loss >= 50) return MoveClassification.Inaccuracy;
  return MoveClassification.Good;
}

export interface BuildJudgePacketArgs {
  fenBefore: string;
  movePlayedSan: string;
  playerColor: "w" | "b";
  userRating: number;
  engine: EngineLike;
  depth?: number;
}

/**
 * Build the grounding packet for one coach response. Deterministic given the
 * engine. Throws if the move is illegal in fenBefore (caller must pass a legal
 * move) — chess correctness of the fixture itself is non-negotiable.
 */
export async function buildJudgePacket(args: BuildJudgePacketArgs): Promise<JudgePacket> {
  const depth = args.depth ?? 16;

  // 1. Replay the move to get fenAfter + UCI.
  const chess = new Chess(args.fenBefore);
  const mv = chess.move(args.movePlayedSan); // throws on illegal SAN in chess.js v1+
  if (!mv) throw new Error(`illegal move "${args.movePlayedSan}" in ${args.fenBefore}`);
  const fenAfter = chess.fen();
  const movePlayedUci = mv.from + mv.to + (mv.promotion ?? "");

  // 2. Engine: multi-PV from the position the move was played in + eval after.
  const before = await args.engine.evaluateMultiPv(args.fenBefore, depth, 3);
  const after = await args.engine.evaluate(fenAfter, depth);

  const evalBeforeCp = normalizeEval(before[0].score);
  const evalAfterCp = normalizeEval(after.score);
  // Engine evals are White-POV; dim-2 needs the MOVER's POV.
  const moverSign = args.playerColor === "w" ? 1 : -1;
  const evalDeltaCpMoverPov = moverSign * (evalAfterCp - evalBeforeCp);

  // 3. Best move (rank 1) as SAN + UCI.
  const bestMoveUci = before[0].bestMoveUci;
  const bestMoveSan = uciToSan(args.fenBefore, bestMoveUci);

  // 4. Classification from the absolute swing (descriptive metadata).
  const classification = classifyPlayedMove(movePlayedUci, bestMoveUci, evalDeltaCpMoverPov);

  // 5. Top-3 multi-PV rows as SAN.
  const multiPv: StockfishPacket["multiPv"] = before.slice(0, 3).map((line) => {
    const parts = scoreParts(line.score);
    return {
      rank: line.rank,
      san: uciToSan(args.fenBefore, line.bestMoveUci),
      scoreCp: parts.scoreCp,
      mate: parts.mate,
    };
  });

  const stockfish: StockfishPacket = {
    evalBeforeCp,
    evalAfterCp,
    evalDeltaCpMoverPov,
    bestMoveUci,
    bestMoveSan,
    multiPv,
    classification,
  };

  // 6. Motifs (only `confirmed` are narratable per detector contract).
  const motifs = detectMotifs(args.fenBefore, args.movePlayedSan);
  const motifTags = motifs.filter((m) => m.confirmed).map((m) => m.motif);

  // 7. Concept delta along the engine's best PV (what the move changed).
  const conceptDelta = compute_feature_delta(args.fenBefore, fenAfter, { pv: before[0].pvUci });
  const topConcepts = topConceptLabels(conceptDelta);

  return {
    fen: args.fenBefore,
    fenAfter,
    movePlayedSan: args.movePlayedSan,
    movePlayedUci,
    playerColor: args.playerColor,
    userRating: args.userRating,
    stockfish,
    motifs,
    motifTags,
    conceptDelta,
    topConcepts,
  };
}
