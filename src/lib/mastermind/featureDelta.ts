import { Chess } from "chess.js";
import {
  annotatePosition,
  PositionAnnotation,
  ThreatInfo,
  HangingPiece,
  PawnStructureAssessment,
  PieceActivityScore,
} from "@/lib/positionAnnotator";

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const QUIESCENCE_EVAL_TOLERANCE_CP = 30;
const RESOLUTION_MAX_PLIES = 12;

export interface PawnStructureDelta {
  doubledPawnsChange: { white: number; black: number };
  isolatedPawnsChange: { white: number; black: number };
  passedPawnsGained: { white: string[]; black: string[] };
  passedPawnsLost: { white: string[]; black: string[] };
  openFilesGained: string[];
  openFilesLost: string[];
  semiOpenFilesGained: { white: string[]; black: string[] };
  semiOpenFilesLost: { white: string[]; black: string[] };
}

export interface PieceActivityDelta {
  gainedActive: PieceActivityScore[];
  lostActive: PieceActivityScore[];
  newlyTrapped: PieceActivityScore[];
}

export interface HangingPiecesDelta {
  newlyHanging: HangingPiece[];
  nowDefended: HangingPiece[];
}

export interface ThreatsDelta {
  newThreats: ThreatInfo[];
  resolvedThreats: ThreatInfo[];
  carriedOverThreats: ThreatInfo[];
}

export type ResolutionReason =
  | "quiescent"
  | "forced-end"
  | "depth-limit"
  | "no-pv"
  | "no-resolution-needed";

export interface ResolutionPoint {
  resolutionFen: string;
  plyOffset: number;
  reason: ResolutionReason;
}

export interface PositionFeatureDelta {
  fenBefore: string;
  fenAfter: string;
  resolutionFen: string;
  resolutionReason: ResolutionReason;
  materialDelta: { white: number; black: number };
  pawnStructureDelta: PawnStructureDelta;
  kingSafetyDelta: { white: number; black: number };
  pieceActivityDelta: PieceActivityDelta;
  hangingPiecesDelta: HangingPiecesDelta;
  threatsDelta: ThreatsDelta;
  isEmptyDelta: boolean;
}

export class InvalidFenError extends Error {
  constructor(public readonly fen: string, cause?: unknown) {
    super(`Invalid FEN: ${fen}${cause instanceof Error ? ` (${cause.message})` : ""}`);
    this.name = "InvalidFenError";
  }
}

function safeChess(fen: string): Chess {
  try {
    return new Chess(fen);
  } catch (err) {
    throw new InvalidFenError(fen, err);
  }
}

function countMaterial(fen: string): { white: number; black: number } {
  const game = safeChess(fen);
  let white = 0;
  let black = 0;
  for (const row of game.board()) {
    for (const sq of row) {
      if (!sq) continue;
      const val = PIECE_VALUES[sq.type] ?? 0;
      if (sq.color === "w") white += val;
      else black += val;
    }
  }
  return { white, black };
}

function diffPawnStructure(
  a: PawnStructureAssessment,
  b: PawnStructureAssessment
): PawnStructureDelta {
  const setDiff = (after: string[], before: string[]): string[] =>
    after.filter((x) => !before.includes(x));

  return {
    doubledPawnsChange: {
      white: b.doubledPawns.white - a.doubledPawns.white,
      black: b.doubledPawns.black - a.doubledPawns.black,
    },
    isolatedPawnsChange: {
      white: b.isolatedPawns.white - a.isolatedPawns.white,
      black: b.isolatedPawns.black - a.isolatedPawns.black,
    },
    passedPawnsGained: {
      white: setDiff(b.passedPawns.white, a.passedPawns.white),
      black: setDiff(b.passedPawns.black, a.passedPawns.black),
    },
    passedPawnsLost: {
      white: setDiff(a.passedPawns.white, b.passedPawns.white),
      black: setDiff(a.passedPawns.black, b.passedPawns.black),
    },
    openFilesGained: setDiff(b.openFiles, a.openFiles),
    openFilesLost: setDiff(a.openFiles, b.openFiles),
    semiOpenFilesGained: {
      white: setDiff(b.semiOpenFiles.white, a.semiOpenFiles.white),
      black: setDiff(b.semiOpenFiles.black, a.semiOpenFiles.black),
    },
    semiOpenFilesLost: {
      white: setDiff(a.semiOpenFiles.white, b.semiOpenFiles.white),
      black: setDiff(a.semiOpenFiles.black, b.semiOpenFiles.black),
    },
  };
}

function diffPieceActivity(a: PieceActivityScore[], b: PieceActivityScore[]): PieceActivityDelta {
  const beforeBySquare = new Map(a.map((p) => [p.square, p]));
  const afterBySquare = new Map(b.map((p) => [p.square, p]));

  const gainedActive: PieceActivityScore[] = [];
  const lostActive: PieceActivityScore[] = [];
  const newlyTrapped: PieceActivityScore[] = [];

  for (const after of b) {
    const before = beforeBySquare.get(after.square);
    if (!before) {
      if (after.activity === "active") gainedActive.push(after);
      if (after.activity === "trapped") newlyTrapped.push(after);
      continue;
    }
    if (before.activity !== "active" && after.activity === "active") gainedActive.push(after);
    if (before.activity !== "trapped" && after.activity === "trapped") newlyTrapped.push(after);
  }
  for (const before of a) {
    const after = afterBySquare.get(before.square);
    if (before.activity === "active" && (!after || after.activity !== "active")) lostActive.push(before);
  }

  return { gainedActive, lostActive, newlyTrapped };
}

function diffHangingPieces(a: HangingPiece[], b: HangingPiece[]): HangingPiecesDelta {
  const beforeKey = (p: HangingPiece) => `${p.square}:${p.piece}:${p.color}`;
  const beforeSet = new Set(a.map(beforeKey));
  const afterSet = new Set(b.map(beforeKey));

  const newlyHanging = b.filter((p) => !beforeSet.has(beforeKey(p)));
  const nowDefended = a.filter((p) => !afterSet.has(beforeKey(p)));
  return { newlyHanging, nowDefended };
}

function diffThreats(a: ThreatInfo[], b: ThreatInfo[]): ThreatsDelta {
  const key = (t: ThreatInfo) => `${t.side}:${t.type}:${t.squares.join(",")}`;
  const beforeKeys = new Set(a.map(key));
  const afterKeys = new Set(b.map(key));

  return {
    newThreats: b.filter((t) => !beforeKeys.has(key(t))),
    resolvedThreats: a.filter((t) => !afterKeys.has(key(t))),
    carriedOverThreats: b.filter((t) => beforeKeys.has(key(t))),
  };
}

function isEmpty(d: Omit<PositionFeatureDelta, "isEmptyDelta">): boolean {
  const m = d.materialDelta;
  const k = d.kingSafetyDelta;
  const ps = d.pawnStructureDelta;
  const pa = d.pieceActivityDelta;
  const hp = d.hangingPiecesDelta;
  const th = d.threatsDelta;

  return (
    m.white === 0 &&
    m.black === 0 &&
    k.white === 0 &&
    k.black === 0 &&
    ps.openFilesGained.length === 0 &&
    ps.openFilesLost.length === 0 &&
    ps.passedPawnsGained.white.length === 0 &&
    ps.passedPawnsGained.black.length === 0 &&
    ps.passedPawnsLost.white.length === 0 &&
    ps.passedPawnsLost.black.length === 0 &&
    pa.gainedActive.length === 0 &&
    pa.lostActive.length === 0 &&
    pa.newlyTrapped.length === 0 &&
    hp.newlyHanging.length === 0 &&
    hp.nowDefended.length === 0 &&
    th.newThreats.length === 0 &&
    th.resolvedThreats.length === 0
  );
}

function diffAnnotations(
  before: PositionAnnotation,
  after: PositionAnnotation,
  materialBefore: { white: number; black: number },
  materialAfter: { white: number; black: number }
): Omit<PositionFeatureDelta, "fenBefore" | "fenAfter" | "resolutionFen" | "resolutionReason"> {
  const draft = {
    materialDelta: {
      white: materialAfter.white - materialBefore.white,
      black: materialAfter.black - materialBefore.black,
    },
    pawnStructureDelta: diffPawnStructure(before.pawnStructure, after.pawnStructure),
    kingSafetyDelta: {
      white: after.kingSafety.white - before.kingSafety.white,
      black: after.kingSafety.black - before.kingSafety.black,
    },
    pieceActivityDelta: diffPieceActivity(before.pieceActivity, after.pieceActivity),
    hangingPiecesDelta: diffHangingPieces(before.hangingPieces, after.hangingPieces),
    threatsDelta: diffThreats(before.threats, after.threats),
  };
  return { ...draft, isEmptyDelta: isEmpty({ ...draft, resolutionFen: "", resolutionReason: "quiescent", fenBefore: "", fenAfter: "" }) };
}

/**
 * Walk the principal variation from a starting FEN until a quiescent position
 * is reached. Quiescent = no captures pending, no checks, and the resulting
 * eval is stable within QUIESCENCE_EVAL_TOLERANCE_CP of any preceding line eval.
 *
 * The eval-stability check is not enforced here (we don't have engine output);
 * it's an upstream concern at the caller (route.ts wires this with the
 * matching PV eval). See FAILURE_MODES §10a — heuristic only in v1.
 */
export function find_resolution_point(fen: string, pv: string[]): ResolutionPoint {
  if (!pv || pv.length === 0) {
    return { resolutionFen: fen, plyOffset: 0, reason: "no-pv" };
  }

  const game = safeChess(fen);
  const maxPlies = Math.min(pv.length, RESOLUTION_MAX_PLIES);

  for (let i = 0; i < maxPlies; i++) {
    const uci = pv[i];
    const move = uci.length >= 4 ? { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] } : null;
    if (!move) break;
    try {
      const result = game.move(move);
      if (!result) break;
    } catch {
      break;
    }

    const inCheck = game.inCheck();
    const hasCapturePending = game.moves({ verbose: true }).some((m) => m.captured);
    const isOver = game.isGameOver();

    if (isOver) {
      return { resolutionFen: game.fen(), plyOffset: i + 1, reason: "forced-end" };
    }
    if (!inCheck && !hasCapturePending) {
      return { resolutionFen: game.fen(), plyOffset: i + 1, reason: "quiescent" };
    }
  }

  return { resolutionFen: game.fen(), plyOffset: maxPlies, reason: "depth-limit" };
}

/**
 * Diff two arbitrary positions. Used by the agent loop's positional-comparison
 * few-shots (Phase 2). No resolution-point walk; caller supplies both FENs.
 */
export function compare_features(fenA: string, fenB: string): PositionFeatureDelta {
  safeChess(fenA);
  safeChess(fenB);
  const annotationA = annotatePosition(fenA);
  const annotationB = annotatePosition(fenB);
  const materialA = countMaterial(fenA);
  const materialB = countMaterial(fenB);

  const diff = diffAnnotations(annotationA, annotationB, materialA, materialB);
  return {
    ...diff,
    fenBefore: fenA,
    fenAfter: fenB,
    resolutionFen: fenB,
    resolutionReason: "no-resolution-needed",
  };
}

/**
 * Stage 3 core. Diffs the position before the move against the resolution
 * point of the resulting variation. If fenAtResolution is omitted, caller is
 * expected to supply pv and we walk it via find_resolution_point; if neither
 * is supplied we fall back to fenAfter as the resolution point.
 */
export function compute_feature_delta(
  fenBefore: string,
  fenAfter: string,
  options?: { fenAtResolution?: string; pv?: string[] }
): PositionFeatureDelta {
  safeChess(fenBefore);
  safeChess(fenAfter);
  if (options?.fenAtResolution) safeChess(options.fenAtResolution);

  let resolutionFen: string;
  let resolutionReason: ResolutionReason;

  if (options?.fenAtResolution) {
    resolutionFen = options.fenAtResolution;
    resolutionReason = "quiescent";
  } else if (options?.pv && options.pv.length > 0) {
    const rp = find_resolution_point(fenAfter, options.pv);
    resolutionFen = rp.resolutionFen;
    resolutionReason = rp.reason;
  } else {
    resolutionFen = fenAfter;
    resolutionReason = "no-pv";
  }

  const annotationBefore = annotatePosition(fenBefore);
  const annotationAtResolution = annotatePosition(resolutionFen);
  const materialBefore = countMaterial(fenBefore);
  const materialAtResolution = countMaterial(resolutionFen);

  const diff = diffAnnotations(
    annotationBefore,
    annotationAtResolution,
    materialBefore,
    materialAtResolution
  );

  return {
    ...diff,
    fenBefore,
    fenAfter,
    resolutionFen,
    resolutionReason,
  };
}
