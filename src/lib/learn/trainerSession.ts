// ─────────────────────────────────────────────────────────────────────────────
// The opening trainer's state machine. Pure: no React, no network, no clock.
//
// Three acts on one line, and the order is the whole idea.
//
//   CONFRONT  Put them in the position and let them play what they always play.
//             Being told "you play c3 too much" is an accusation. Watching
//             yourself play c3 and then reading your own scoreline is an
//             observation, and it does not require us to be believed.
//   LEARN     Their record, the verdict, the theory, what masters do.
//   DRILL     Replay the line until the corrected move is theirs. Three clean
//             runs, because one is luck and two is a coincidence.
//
// Every move this machine expects comes from the engine, the master corpus, or
// the player's own frequencies. Nothing here invents a move.
//
// Spec: docs/OPENING_TRAINER_SPEC.md
// ─────────────────────────────────────────────────────────────────────────────

import { Chess } from 'chess.js';
import { positionKey } from '@/lib/scout/positionStats';

export type Act = 'confront' | 'learn' | 'drill' | 'done';

/**
 * Why the session is running.
 *
 *   repair  First contact with a line we have measured as costing them. All
 *           three acts, because the point is to change a habit.
 *   review  A line they already repaired, come back round on the spaced
 *           schedule. One clean run and out. Re-running the confrontation
 *           would be re-accusing them of a habit they have already fixed, and
 *           re-running the full three would make every review feel like a
 *           punishment for having done the work.
 */
export type SessionMode = 'repair' | 'review';

/** Clean runs needed before a line counts as repaired. */
export const DRILL_TARGET = 3;

/** Clean runs asked for on a scheduled review. */
export const REVIEW_TARGET = 1;

export function goalFor(mode: SessionMode): number {
  return mode === 'review' ? REVIEW_TARGET : DRILL_TARGET;
}

export interface TrainerTarget {
  san: string;
  /**
   * Where the replacement came from. Shown to the reader, because "Stockfish
   * prefers this" and "this is what masters play" are different claims and a
   * player is entitled to know which one they are being given.
   */
  source: 'engine' | 'masters';
}

export interface TrainerLine {
  /** SAN moves from the start to the flagged move, inclusive. */
  moves: string[];
  /** The colour the user plays. */
  color: 'white' | 'black';
  /**
   * The improvement to drill, or undefined when there is none.
   *
   * Undefined is a real outcome, not a gap: when the engine has no complaint
   * and the masters' main line is the move they already play, the honest
   * answer is that the position is the problem and there is nothing to drill.
   * The session then ends after LEARN rather than inventing an exercise.
   */
  target?: TrainerTarget;
}

export type Feedback = 'none' | 'correct' | 'wrong';

export interface TrainerState {
  act: Act;
  /** Why this session is running. Decides the acts and the run target. */
  mode: SessionMode;
  /** Plies completed in the current drill run. */
  ply: number;
  fen: string;
  /** Consecutive clean runs. */
  streak: number;
  /** Runs attempted, for the reader. */
  runs: number;
  /**
   * Whether their CONFRONT move was the habitual one.
   *
   * Null until they move. False is not a failure — it means the habit did not
   * reproduce today, and the screen must say so rather than pretend they made
   * the mistake.
   */
  playedHabit: boolean | null;
  /** What they actually played in CONFRONT, for the panel to name. */
  confrontMove: string | null;
  feedback: Feedback;
  /** Set on a wrong drill attempt so the correction can be shown once. */
  lastWrong: string | null;
  /** True once the current run has had a miss; a run is clean or it is not. */
  runSpoiled: boolean;
  /**
   * Misses across the whole session, not just this run.
   *
   * The grade a review feeds back to the scheduler. `runSpoiled` cannot carry
   * it: it is reset every run by design, so a session that missed six times
   * and a session that missed once would schedule identically.
   */
  misses: number;
}

/** The move the user is expected to find at `ply`, or null if it is not theirs. */
export function expectedAt(line: TrainerLine, ply: number): string | null {
  if (ply < 0 || ply >= line.moves.length) return null;
  if (!isUsersPly(line, ply)) return null;
  const decision = line.moves.length - 1;
  if (ply === decision && line.target) return line.target.san;
  return line.moves[ply];
}

/** Whose turn ply `i` is. White moves on even plies. */
export function isUsersPly(line: TrainerLine, ply: number): boolean {
  const whiteToMove = ply % 2 === 0;
  return line.color === 'white' ? whiteToMove : !whiteToMove;
}

/** Board after the first `n` plies of the line. */
export function fenAfter(line: TrainerLine, n: number): string {
  const board = new Chess();
  for (let i = 0; i < n && i < line.moves.length; i++) {
    try {
      if (!board.move(line.moves[i])) break;
    } catch {
      break;
    }
  }
  return board.fen();
}

/** The ply the flagged move sits at. */
export const decisionPly = (line: TrainerLine): number => line.moves.length - 1;

export function createSession(line: TrainerLine, mode: SessionMode = 'repair'): TrainerState {
  // A review has nothing to confront and nothing new to teach. It is the drill.
  if (mode === 'review') return startRun(line, 'review');
  return {
    act: 'confront',
    mode,
    // CONFRONT opens one ply BEFORE the flagged move: the decision itself, with
    // the move not yet made.
    ply: decisionPly(line),
    fen: fenAfter(line, decisionPly(line)),
    streak: 0,
    runs: 0,
    playedHabit: null,
    confrontMove: null,
    feedback: 'none',
    lastWrong: null,
    runSpoiled: false,
    misses: 0,
  };
}

/**
 * Does `san`, played in `fen`, reach the same position as `expected`?
 *
 * Compared by POSITION, never by move string. Two spellings of one move, and
 * genuine transpositions, must both count as right — grading a transposition
 * wrong is the single most common way a trainer loses a player's trust, and it
 * is the one Chessable behaviour worth copying exactly.
 *
 * Returns null when the attempt is not a legal move at all.
 */
export function reaches(fen: string, san: string, expected: string): boolean | null {
  const played = applyMove(fen, san);
  if (!played) return null;
  const want = applyMove(fen, expected);
  if (!want) return null;
  return positionKey(played) === positionKey(want);
}

function applyMove(fen: string, san: string): string | null {
  try {
    const board = new Chess(fen);
    if (!board.move(san)) return null;
    return board.fen();
  } catch {
    return null;
  }
}

/**
 * The user attempted `san`.
 *
 * Illegal attempts return the state unchanged: the board rejects them before
 * they reach here, and a state machine that records them would count a
 * mis-drag as a miss.
 */
export function submitMove(state: TrainerState, line: TrainerLine, san: string): TrainerState {
  if (state.act === 'confront') return submitConfront(state, line, san);
  if (state.act === 'drill') return submitDrill(state, line, san);
  return state;
}

function submitConfront(state: TrainerState, line: TrainerLine, san: string): TrainerState {
  const after = applyMove(state.fen, san);
  if (!after) return state;
  const habit = line.moves[decisionPly(line)];
  const playedHabit = reaches(state.fen, san, habit) === true;
  return {
    ...state,
    act: 'learn',
    fen: after,
    confrontMove: san,
    playedHabit,
    // No flash in CONFRONT. There is no right answer being asked for, and a red
    // ring on the move they always play would be the accusation this act exists
    // to avoid.
    feedback: 'none',
  };
}

function submitDrill(state: TrainerState, line: TrainerLine, san: string): TrainerState {
  const want = expectedAt(line, state.ply);
  if (!want) return state;

  const ok = reaches(state.fen, san, want);
  if (ok === null) return state;

  if (!ok) {
    return {
      ...state,
      feedback: 'wrong',
      lastWrong: san,
      runSpoiled: true,
      misses: state.misses + 1,
    };
  }

  // Correct. Advance past this ply, then past any opponent replies that follow,
  // because those are theirs to play and not a question.
  let ply = state.ply + 1;
  const board = new Chess(state.fen);
  board.move(san);
  while (ply < line.moves.length && !isUsersPly(line, ply)) {
    try {
      if (!board.move(line.moves[ply])) break;
    } catch {
      break;
    }
    ply += 1;
  }

  const finished = ply >= line.moves.length;
  if (!finished) {
    return { ...state, ply, fen: board.fen(), feedback: 'correct', lastWrong: null };
  }

  // Run over.
  const clean = !state.runSpoiled;
  const streak = clean ? state.streak + 1 : 0;
  const runs = state.runs + 1;
  if (streak >= goalFor(state.mode)) {
    return {
      ...state,
      act: 'done',
      ply,
      fen: board.fen(),
      streak,
      runs,
      feedback: 'correct',
      lastWrong: null,
    };
  }
  return { ...startRun(line, state.mode), streak, runs, misses: state.misses, feedback: 'correct' };
}

/** A fresh drill run from the top of the line. */
export function startRun(line: TrainerLine, mode: SessionMode = 'repair'): TrainerState {
  // Auto-play any opponent moves before the user's first turn.
  let ply = 0;
  const board = new Chess();
  while (ply < line.moves.length && !isUsersPly(line, ply)) {
    try {
      if (!board.move(line.moves[ply])) break;
    } catch {
      break;
    }
    ply += 1;
  }
  return {
    act: 'drill',
    mode,
    ply,
    fen: board.fen(),
    streak: 0,
    runs: 0,
    playedHabit: null,
    confrontMove: null,
    feedback: 'none',
    lastWrong: null,
    runSpoiled: false,
    misses: 0,
  };
}

/**
 * The user pressed continue.
 *
 * LEARN goes to DRILL, unless there is nothing to drill — with no replacement
 * move the honest end of the session is right here, and manufacturing an
 * exercise out of the move they already play would be busywork dressed as
 * training.
 */
export function advance(state: TrainerState, line: TrainerLine): TrainerState {
  if (state.act !== 'learn') return state;
  if (!line.target) return { ...state, act: 'done' };
  return { ...startRun(line, state.mode), streak: state.streak, runs: state.runs, misses: state.misses };
}

/** Clear a wrong-move flash without touching progress. */
export function clearFeedback(state: TrainerState): TrainerState {
  return state.feedback === 'none' ? state : { ...state, feedback: 'none' };
}

export interface ActStep {
  act: Exclude<Act, 'done'>;
  label: string;
  status: 'todo' | 'current' | 'done';
}

/** The rail's three rows. */
export function steps(state: TrainerState, line: TrainerLine): ActStep[] {
  // A review is one act. Showing it as step 3 of 3 with the first two ticked
  // would claim they just did work they did not do.
  const order: Array<Exclude<Act, 'done'>> =
    state.mode === 'review' ? ['drill'] : line.target ? ['confront', 'learn', 'drill'] : ['confront', 'learn'];
  const reachedIndex = state.act === 'done' ? order.length : order.indexOf(state.act as Exclude<Act, 'done'>);
  const labels: Record<Exclude<Act, 'done'>, string> = {
    confront: 'Play your move',
    learn: 'See what it costs',
    drill: state.mode === 'review' ? 'Play it once, clean' : `Drill it ${DRILL_TARGET} times`,
  };
  return order.map((act, i) => ({
    act,
    label: labels[act],
    status: i < reachedIndex ? 'done' : i === reachedIndex ? 'current' : 'todo',
  }));
}
