/**
 * The arrival (pathway 2.7): a game loaded fresh opens at the move it was
 * decided on, once the engine's sweep has landed, unless the reader has
 * already moved. The move comes from the game's story (gameStory.ts, the
 * point of no return by winning chances), never from a model.
 *
 * Pure and client-safe; the analysis page applies it.
 */

/**
 * Off until its flip: its own one-line PR changes this default, and the
 * env overrides it either way, which is how the Playwright legs run it on.
 */
export const ARRIVAL_JUMP_DEFAULT = false;

/**
 * Read once at module level by the analysis page. `NEXT_PUBLIC_` values are
 * inlined at build time, and only for this literal spelling of the name.
 */
export function isArrivalJumpEnabledPublic(): boolean {
  const v = (process.env.NEXT_PUBLIC_COACH_ARRIVAL_JUMP ?? "")
    .trim()
    .toLowerCase();
  if (v === "1" || v === "on" || v === "true") return true;
  if (v === "0" || v === "off" || v === "false") return false;
  return ARRIVAL_JUMP_DEFAULT;
}

export interface ArrivalInput {
  /** The page's arrival flag. */
  enabled: boolean;
  /** The sweep has landed for the game on the board (not a previous game's). */
  sweepLanded: boolean;
  /** The greeting is a fresh load's (`arrival` on the first message). */
  freshLoad: boolean;
  /** The game counts from the standard start, so its story's sides are right. */
  standardRoot: boolean;
  puzzleMode: boolean;
  /** The ply the game was decided on (the cursor value after the move), or null. */
  decisivePly: number | null;
  /** The cursor. */
  ply: number;
  /** The reader moved the cursor since the game loaded. */
  touched: boolean;
  /** Anything else holds the board or the strip: an exploration, a drill, the coach's jump. */
  boardBusy: boolean;
  /** The conversation view is the one showing. */
  coachView: boolean;
}

/** The ply to open at, or null to stay where the page is. */
export function arrivalTarget(i: ArrivalInput): number | null {
  if (!i.enabled || !i.sweepLanded || !i.freshLoad) return null;
  if (!i.standardRoot || i.puzzleMode) return null;
  if (i.decisivePly === null || i.decisivePly <= 0) return null;
  if (i.touched || i.ply !== 0 || i.boardBusy || !i.coachView) return null;
  return i.decisivePly;
}
