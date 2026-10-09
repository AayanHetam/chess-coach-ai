/**
 * The page's standing side (PR 2.6): the side the coach's answers are about
 * for the rest of the session, until the reader changes it. Never the
 * player's colour: the player stays "you", the context the coach was given
 * stays the player's, and nothing here reaches `playerSide`, which would
 * throw the context away and re-review the game.
 *
 * Set by "coach me as Black" (a page order, pageActionPlan.ts), by a
 * question that looks at the game from a side ("from Black's side, what
 * went wrong?"), read back from the coach's own reading of it (the
 * `perspective` echo of /api/chat, so the page never reads the words
 * differently from the coach), and ended by "back to my side" or the
 * strip's Back. Sent as `perspective` on every follow-up while set,
 * including the player's own side after a way back, which is the only way
 * the coach learns of it (page turns never reach its history).
 *
 * Pure and client-safe.
 */
import {
  aboutThePlayersPlay,
  perspectiveFromWords,
  type Side,
} from "@/lib/coach/questionPerspective";

export type { Side };

/** The coach's reading of a turn's side, as /api/chat echoes it. */
export interface PerspectiveEcho {
  side: Side;
  source: "words" | "field" | "history";
  rule: string;
  version: string;
  yielded?: "anchor" | "words";
}

/** The echo as sent, or null for anything that is not one. */
export function readPerspectiveEcho(raw: unknown): PerspectiveEcho | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.side !== "w" && r.side !== "b") return null;
  if (r.source !== "words" && r.source !== "field" && r.source !== "history")
    return null;
  if (typeof r.rule !== "string" || typeof r.version !== "string") return null;
  if (
    r.yielded !== undefined &&
    r.yielded !== "anchor" &&
    r.yielded !== "words"
  )
    return null;
  return {
    side: r.side,
    source: r.source,
    rule: r.rule,
    version: r.version,
    ...(r.yielded ? { yielded: r.yielded as "anchor" | "words" } : {}),
  };
}

/**
 * The readings a standing side is taken from: a view of the game from a
 * side, or the player's own side named. "What was my opponent thinking?"
 * and "Black's worst move" are about that turn only, and the strip's own
 * "What did my opponent miss with...?" must not turn the session.
 */
const STANDING_RULES = new Set(["colour_view", "opponent_view", "player"]);

/** The wording version the page understands; an echo of another is never taken. */
const KNOWN_VERSION = "1";

/**
 * The standing side after the coach's reading of a turn, or undefined when
 * it does not change. `player` is the side the coach's context was built
 * for.
 */
export function standingAfterEcho(
  echo: PerspectiveEcho | null,
  standing: Side | null,
  player: Side
): Side | undefined {
  if (!echo || echo.version !== KNOWN_VERSION || echo.yielded) return undefined;
  if (echo.source === "field") return undefined;
  if (!STANDING_RULES.has(echo.rule)) return undefined;
  if (echo.side === standing) return undefined;
  // "From my side" with nothing standing changes nothing.
  if (standing === null && echo.side === player) return undefined;
  return echo.side;
}

/**
 * The side the strip acknowledges, or null: a standing side that is not
 * the player's.
 */
export function strippedSide(standing: Side | null, player: Side): Side | null {
  return standing && standing !== player ? standing : null;
}

/**
 * The side a bare "move N" is read as, the way the coach reads it: the
 * standing side when it is not the player's (the coach's field), else the
 * player's. A page order ("go to move 8") lands where the coach's anchor
 * would.
 */
export function moveNumberSide(standing: Side | null, player: Side): Side {
  return standing && standing !== player ? standing : player;
}

/**
 * The tie-break for a what-if's bare "move 8" legal for both sides, the
 * way the coach will anchor it: a side this message's words name, else the
 * standing side unless the words are about the player's own play, else
 * nothing (the caller falls back to its own rule).
 */
export function whatIfDefaultSide(
  question: string,
  player: Side,
  sideKnown: boolean,
  standing: Side | null
): Side | undefined {
  const words = perspectiveFromWords(question, player, sideKnown);
  if (words) return words.side;
  if (standing && standing !== player && !aboutThePlayersPlay(question, player))
    return standing;
  return undefined;
}

const NAME: Record<Side, string> = { w: "White", b: "Black" };

/**
 * The strip's words for a standing side. With the player's side not yet
 * known the way back is plain "Back": the page cannot say whose side that
 * is.
 */
export function standingStripWords(
  side: Side,
  sideKnown = true
): {
  label: string;
  /** The label beside the step buttons on a phone: the side's name. */
  short: string;
  text: string;
  back: string;
} {
  return {
    label: `${NAME[side]}'s side`,
    short: NAME[side],
    text: `Answers are about ${NAME[side]}'s moves`,
    back: sideKnown ? "Back to my side" : "Back",
  };
}
