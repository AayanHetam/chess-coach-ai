/**
 * Pure mood reducers. Every surface decides Masti's expression here, in plain
 * functions with no React in them, so the decision is unit-tested once and
 * the components just render the answer. Nothing in here reads chess state
 * itself: callers pass in what their page already knows (a classification,
 * a result, a status) and the reducer only maps it to a face.
 */

import type { MastiMood } from "./manifest";

export type PuzzleStatus = "loading" | "playing" | "wrong" | "solved";
export type HintStage = "why_wrong" | "hint" | "answer" | "deeper_dive";

export interface PuzzleMoodInput {
  status: PuzzleStatus;
  wrongAttempts: number;
  /** The user asked for the answer; grades as a miss. */
  solutionRevealed?: boolean;
  /** The coach is replaying a line on the board. */
  demoRunning?: boolean;
  /** The coach is streaming or a hint stage is loading. */
  thinking?: boolean;
  /** The most recent hint stage that landed, if any. */
  hintStage?: HintStage | null;
}

/**
 * Puzzles. "wrong" is a 1.4 s flash while wrongAttempts is sticky, so a
 * retry keeps a worried face until it is solved; the third miss is Masti
 * losing his mind. A hint points at the answer. A solve after a miss is an
 * idea (you got there), a clean solve is the celebration, and a revealed
 * solution ends as an idea rather than a celebration so the mascot never
 * cheers for an answer the user was shown.
 */
export function puzzleMood(i: PuzzleMoodInput): MastiMood {
  if (i.thinking) return "thinking";
  if (i.demoRunning) return "thinking";
  if (i.status === "loading") return "thinking";
  if (i.status === "solved") {
    if (i.solutionRevealed) return "idea";
    return i.wrongAttempts === 0 ? "excited" : "idea";
  }
  if (i.solutionRevealed) return "idea";
  // A miss beats a hint that is still open: the face answers the move just
  // played, not the button pressed a minute ago.
  if (i.status === "wrong") return i.wrongAttempts >= 3 ? "panic" : "nervous";
  if (i.wrongAttempts > 0) return "nervous";
  if (i.hintStage === "hint" || i.hintStage === "deeper_dive")
    return "pointing";
  return "wave";
}

export type PlayerColor = "white" | "black";
export type TerminalLabel = "1-0" | "0-1" | "½-½";

/**
 * Move classifications as the analysis surface spells them (the
 * MoveClassification enum values, lower-cased). Unknown strings are neutral.
 */
export type MoveLabel =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "okay"
  | "book"
  | "opening"
  | "forced"
  | "inaccuracy"
  | "mistake"
  | "miss"
  | "blunder"
  | (string & {});

/**
 * Which side played the move being looked at: the reader's own side, the
 * opponent's, or unknown (the reader has not said which colour they were).
 */
export type Mover = "player" | "opponent" | "unknown";

/**
 * The face for a single move, seen from the reader's side of the board. The
 * reader's own blunder is a facepalm and their brilliancy a celebration; an
 * opponent's blunder is Masti pointing at the chance and an opponent's
 * brilliancy a jaw drop. With no side known a blunder is only a jaw drop,
 * never a cheer or a facepalm for the wrong colour.
 */
export function classificationMood(
  cls: MoveLabel | null | undefined,
  mover: Mover = "unknown"
): MastiMood {
  const c = (cls ?? "").toLowerCase();
  switch (c) {
    case "brilliant":
    case "great":
      return mover === "opponent" ? "shocked" : "excited";
    case "blunder":
    case "miss":
      if (mover === "player") return "defeated";
      if (mover === "opponent") return "pointing";
      return "shocked";
    case "mistake":
    case "inaccuracy":
      return mover === "opponent" ? "idea" : "nervous";
    default:
      return "wave";
  }
}

export type CoachErrorKind = "auth" | "api" | "network";

export function coachErrorMood(kind: CoachErrorKind): MastiMood {
  return kind === "auth" ? "nervous" : "defeated";
}

export interface AnalysisMoodInput {
  hasGame: boolean;
  /** Waiting for the first token of a coach reply. */
  thinking?: boolean;
  /** Tokens are arriving. */
  streaming?: boolean;
  /** Stockfish is still sweeping the game. */
  engineRunning?: boolean;
  coachError?: CoachErrorKind | null;
  aiDisabled?: boolean;
  /** Game-over label on the displayed position, if any. */
  terminal?: TerminalLabel | null;
  playerColor?: PlayerColor | null;
  /** Classification of the move that led to the displayed position. */
  classification?: MoveLabel | null;
  /** Who played that move. */
  mover?: Mover;
}

/**
 * The analysis coach's header face. Priority: the coach working beats
 * everything (that is the "give me a minute" the user is waiting on), then a
 * coach failure, then the empty board, then a game result, then the current
 * move. A win is only celebrated when the reader has said which side they
 * were: with no side known a decisive result is an idea, never a cheer for
 * the wrong colour.
 */
export function analysisMood(i: AnalysisMoodInput): MastiMood {
  if (i.thinking) return "thinking";
  if (i.streaming) return "idea";
  if (i.coachError) return coachErrorMood(i.coachError);
  if (i.aiDisabled) return "nervous";
  if (!i.hasGame) return "wave";
  if (i.engineRunning) return "thinking";
  if (i.terminal) {
    if (i.terminal === "½-½") return "idea";
    if (!i.playerColor) return "idea";
    const playerWon =
      (i.terminal === "1-0" && i.playerColor === "white") ||
      (i.terminal === "0-1" && i.playerColor === "black");
    return playerWon ? "excited" : "defeated";
  }
  return classificationMood(i.classification, i.mover ?? "unknown");
}

export type Trend = "gain" | "loss" | "neutral";

/** Session recaps: rating went up (the banana rating), down, or sideways. */
export function trendMood(trend: Trend): MastiMood {
  if (trend === "gain") return "banana";
  if (trend === "loss") return "defeated";
  return "wave";
}

/**
 * Lesson / drill rounds scored as correct out of total. Empty rounds are a
 * wave (nothing happened), a perfect or near-perfect round is the
 * celebration, a middling one is "here's the idea", a poor one is nervous and
 * a blank is dizzy.
 */
export function scoreMood(correct: number, total: number): MastiMood {
  if (total <= 0) return "wave";
  const ratio = correct / total;
  if (ratio >= 0.8) return "excited";
  if (ratio >= 0.5) return "idea";
  if (correct > 0) return "nervous";
  return "defeated";
}

/** A win / loss / draw from the reader's side, for /play and game shares. */
export function resultMood(
  result: "win" | "loss" | "draw" | null | undefined
): MastiMood {
  if (result === "win") return "excited";
  if (result === "loss") return "defeated";
  if (result === "draw") return "idea";
  return "wave";
}

export interface RepertoireMoodInput {
  /** Picks made on the side of the bracket being shown. */
  picks: number;
  /** Coverage on that side has reached the band's enough line. */
  enough: boolean;
  lockedHere: boolean;
  bothLocked: boolean;
}

/**
 * The guide at the top of /learn. Both colours locked is the banana (the
 * repertoire is done and the work moves to the courses); a locked side is the
 * next idea (the other colour); a side that is enough but still open is the
 * celebration; an empty side is hello; anything in between is Masti pointing
 * at the biggest gap. The line he says beside it is `guideLine` in
 * lib/repertoire/guide.ts, which reads the same inputs.
 */
export function repertoireMood(i: RepertoireMoodInput): MastiMood {
  if (i.bothLocked) return "banana";
  if (i.lockedHere) return "idea";
  if (i.enough) return "excited";
  if (i.picks === 0) return "wave";
  return "pointing";
}
