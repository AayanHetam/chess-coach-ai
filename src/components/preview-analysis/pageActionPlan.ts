/**
 * What an order does on this page, in the position the page is in, and the
 * one line that says so.
 *
 * lib/coach/pageActions.ts reads the words; this decides. It is pure so
 * every case is pinned by a unit test without the page: the page hands in
 * what it holds (the cursor, the game, a drill, a line being explored, the
 * coach's jump, the side) and gets back the effects to apply in order and
 * the acknowledgement for the transcript, or null when the words are not an
 * order here after all (a colour on its own when no side was asked).
 *
 * The rules that keep an acknowledgement true:
 * - A drill owns the board. Only a flip (which the drill's own keys allow)
 *   and leaving it act; anything else is refused in words. Leaving an
 *   unfinished drill says nothing here: the drill posts its own outcome
 *   line, and two lines for one tap would say it twice.
 * - "Back" is the strip's Back where the strip shows one (a line being
 *   explored, the coach's jump), else the move before, or, right after a
 *   typed "go to", the place it was typed from.
 * - "Move N" without a side is the side the coach's context reads it as,
 *   so "go to move 20" and "why was move 20 bad?" land on the same ply; a
 *   side whose move N the game never reached gives way to the other side,
 *   as the anchor does. The acknowledgement names the side either way.
 * - A game set up from a position numbers its moves its own way, and every
 *   label on the page still counts from 1: there a numbered "go to" is
 *   declined and no acknowledgement carries a number (a number in the
 *   transcript is a link, and the linker counts from 1 too).
 * - Nothing here is a chess claim beyond the game's own moves.
 */
import { DEFAULT_POSITION } from "chess.js";
import type {
  PageAction,
  PagePreference,
  PageTurn,
} from "@/lib/coach/pageActions";

export interface PageTurnState {
  /** The cursor: half-moves from the game's root. */
  ply: number;
  sans: readonly string[];
  rootFen: string | null | undefined;
  /**
   * The side "move N" means when the words name none: the side the coach's
   * context was built for, else the side the page coaches now.
   */
  moveSide: "w" | "b";
  /** The side the player confirmed (or the page matched), never the board's orientation. */
  playerSide: "w" | "b" | null;
  /** The side before the last switch this session, for "back to my side". */
  previousSide: "w" | "b" | null;
  /** A game with moves, not a puzzle: where the side ask and its chip show. */
  sideEligible: boolean;
  orientation: "white" | "black";
  /**
   * A drill on the board. `answering`: it is the diagnosing question's
   * answer (diagnoseAsk.ts), which says nothing when it is left, so leaving
   * it is acknowledged like a finished drill (`complete`).
   */
  drill: { complete: boolean; savedPly: number; answering?: boolean } | null;
  exploring: { anchorPly: number; path: readonly string[] } | null;
  jump: { fromPly: number; toPly: number } | null;
  /** Where the last typed "go to" came from and went, while the board is still there. */
  typedJump: { fromPly: number; toPly: number } | null;
  /** What "play the line" would play: the line's starting ply and first move. */
  replay: { anchorPly: number; firstSan: string } | null;
  /**
   * The coach's last answer asked the player something ("Your turn: …?"):
   * a colour on its own is then the answer to it, not the side ask's.
   */
  coachAsked: boolean;
  /**
   * Under NEXT_PUBLIC_COACH_PERSPECTIVE (standingSide.ts): the side the
   * answers are about (null for none set) and the side the coach's context
   * was built for. A "coach me as" wish then sets the standing side
   * instead of the player's, with no re-review, and "back to my side" ends
   * it. Absent, the plan is as before.
   */
  standing?: {
    side: "w" | "b" | null;
    player: "w" | "b";
    /**
     * The coach has a context the next follow-up goes to (/api/chat). A
     * standing side rides only on that path: before the first answer the
     * next question is the review itself, built for the player.
     */
    contextReady?: boolean;
  };
}

export type PageEffect =
  /**
   * `afterDrill`: a drill owns the board, so the side is the board's when
   * the drill is left, not now.
   */
  | { type: "orientation"; to: "white" | "black"; afterDrill?: true }
  | { type: "exit_drill" }
  | { type: "clear_preview" }
  | { type: "clear_jump" }
  | { type: "cursor"; ply: number }
  /** One explored move back; the last one leaves the board on the anchor. */
  | { type: "step_back_line" }
  | { type: "replay" }
  /**
   * The player's side, as the side ask and its chip set it. `remember`
   * keeps the side it replaces, so "back to my side" can undo a "coach me
   * as" wish; `restore` is that undoing.
   */
  | { type: "side"; color: "w" | "b"; remember?: true; restore?: true }
  /**
   * The side the answers are about (standingSide.ts); the player's own
   * side ends a switch. Never the player's side: no context is thrown
   * away and nothing is re-reviewed.
   */
  | { type: "standing"; side: "w" | "b" };

export interface PagePlan {
  effects: PageEffect[];
  /** The one line for the transcript; null when the effect posts its own. */
  ack: string | null;
  mood: "wave" | "nervous";
  /** A typed "go to" to remember, so "back" can undo it. */
  typedJump?: { fromPly: number; toPly: number };
}

const colorName = (c: "w" | "b") => (c === "w" ? "White" : "Black");
const orientationName = (o: "white" | "black") =>
  o === "white" ? "White" : "Black";

/** The game counts its moves from 1 with White to move: the page's own labels agree. */
function numbersMatchPage(rootFen: string | null | undefined): boolean {
  return !rootFen || rootFen === DEFAULT_POSITION;
}

/** "8. Nc7+" / "8... Kd8" for the move that made position `ply` (ply >= 1). */
function numberedLabel(ply: number, san: string): string {
  const n = Math.ceil(ply / 2);
  return `${n}${ply % 2 === 1 ? "." : "..."} ${san}`;
}

export function planPageTurn(
  turn: PageTurn,
  state: PageTurnState
): PagePlan | null {
  return turn.type === "action"
    ? planAction(turn.action, state)
    : planPreference(turn.preference, state);
}

function planAction(a: PageAction, s: PageTurnState): PagePlan {
  const total = s.sans.length;
  const ply = Math.max(0, Math.min(s.ply, total));
  const numbered = numbersMatchPage(s.rootFen);
  const label = (p: number) =>
    numbered
      ? numberedLabel(p, s.sans[p - 1])
      : `the position after ${s.sans[p - 1]}`;
  const here = (p: number) =>
    p === 0 ? "Back to the start." : `Here's ${label(p)}.`;
  const backTo = (p: number) =>
    p === 0 ? "Back to the start." : `Back to ${label(p)}.`;
  const done = (effects: PageEffect[], ack: string | null): PagePlan => ({
    effects,
    ack,
    mood: "wave",
  });
  const refuse = (ack: string): PagePlan => ({
    effects: [],
    ack,
    mood: "nervous",
  });
  const go = (target: number, ack: string, typed: boolean): PagePlan => ({
    effects: [
      { type: "clear_preview" },
      { type: "clear_jump" },
      { type: "cursor", ply: target },
    ],
    ack,
    mood: "wave",
    ...(typed ? { typedJump: { fromPly: ply, toPly: target } } : {}),
  });

  // A flip changes nothing but the board's side, in any state.
  if (a.kind === "flip_board") {
    const to =
      a.to ?? (s.orientation === "white" ? "black" : ("white" as const));
    if (to === s.orientation)
      return done([], `${orientationName(to)} is already at the bottom.`);
    return done(
      [{ type: "orientation", to }],
      `Flipped. ${orientationName(to)} is at the bottom.`
    );
  }

  // The strip's own Back label typed back to it ("back to move 7", "back
  // to start") is that Back: the label counts from 1 by the ply alone.
  const stripBack = s.drill
    ? s.drill.savedPly
    : s.exploring
      ? s.exploring.anchorPly
      : s.jump
        ? s.jump.fromPly
        : null;
  if (
    stripBack !== null &&
    ((a.kind === "go_to_move" &&
      a.via === "back" &&
      !a.color &&
      stripBack > 0 &&
      a.moveNumber === Math.ceil(stripBack / 2)) ||
      (a.kind === "go_to_start" && a.via === "back" && stripBack === 0))
  )
    return planAction({ kind: "back" }, s);

  if (s.drill) {
    const leftAck = s.drill.complete ? backTo(s.drill.savedPly) : null;
    if (a.kind === "back") return done([{ type: "exit_drill" }], leftAck);
    if (a.kind === "back_to_game")
      return done(
        [
          { type: "exit_drill" },
          { type: "clear_preview" },
          { type: "clear_jump" },
        ],
        leftAck
      );
    return refuse(
      s.drill.answering
        ? "You're answering on the board. Say “back” to leave it first."
        : "You're in a drill. Say “back” to leave it first."
    );
  }

  if (s.exploring) {
    const at = Math.max(0, Math.min(s.exploring.anchorPly, total));
    const leave = () =>
      done(
        [{ type: "clear_preview" }, { type: "cursor", ply: at }],
        backTo(at)
      );
    if (a.kind === "back" || a.kind === "back_to_game") return leave();
    // With no moves, the start and the end are the anchor: leave the line.
    if (total === 0 && (a.kind === "go_to_start" || a.kind === "go_to_end"))
      return leave();
    if (a.kind === "step") {
      if (a.delta === 1)
        return done(
          [],
          "You're on a side line. Say “back” to return to the game."
        );
      return s.exploring.path.length > 1
        ? done([{ type: "step_back_line" }], "One move back on the line.")
        : leave();
    }
    // A "go to" leaves the line; a replay plays it again.
  }

  if (a.kind === "replay_line") {
    if (!s.replay)
      return refuse(
        "There's no line to play yet. Press Play under a line and I can play it again."
      );
    const first = numbered
      ? numberedLabel(s.replay.anchorPly + 1, s.replay.firstSan)
      : s.replay.firstSan;
    return done([{ type: "replay" }], `Playing the line from ${first}.`);
  }

  if (a.kind === "back_to_game") return done([], "You're on the game already.");

  if (a.kind === "back") {
    if (s.jump)
      return done(
        [{ type: "clear_jump" }, { type: "cursor", ply: s.jump.fromPly }],
        backTo(s.jump.fromPly)
      );
    const typed = s.typedJump;
    if (typed && typed.toPly === ply && typed.fromPly !== ply)
      return done(
        [{ type: "cursor", ply: typed.fromPly }],
        backTo(typed.fromPly)
      );
  }

  if (a.kind === "go_to_start") return go(0, "Back to the start.", true);
  if (total === 0)
    return refuse("There are no moves in this game to step through.");

  if (a.kind === "back" || a.kind === "step") {
    const delta = a.kind === "back" ? -1 : a.delta;
    const target = ply + delta;
    if (target < 0) return done([], "This is the start.");
    if (target > total) return done([], "That's the last move.");
    return go(target, delta < 0 ? backTo(target) : here(target), false);
  }

  if (a.kind === "go_to_end")
    return go(total, `Here's the last move, ${label(total)}.`, true);

  // go_to_move
  if (!numbered)
    return refuse(
      "This game starts from a set-up position, so its move numbers are its own. Pick the move in Moves instead."
    );
  const n = a.moveNumber;
  if (n < 1) return refuse("Moves are numbered from 1.");
  const indexOf = (color: "w" | "b") => (n - 1) * 2 + (color === "b" ? 1 : 0);
  const sides: ("w" | "b")[] = a.color
    ? [a.color]
    : [s.moveSide, s.moveSide === "w" ? "b" : "w"];
  const color = sides.find((c) => indexOf(c) < total);
  if (!color) return refuse(`The game ends at ${label(total)}.`);
  const target = indexOf(color) + 1;
  return go(
    target,
    `Here's ${label(target)}, ${colorName(color)}'s move ${n}.`,
    true
  );
}

/**
 * A wish or "back to my side" under a standing side (standingSide.ts), or
 * null for the plan without one: a wish needs the player's side known
 * (with it unknown, "coach me as Black" answers the side ask, as before)
 * and a context its answers go to (before the first answer, the wish sets
 * the side the review is built for, as before: there is no review to keep).
 */
function planStanding(p: PagePreference, s: PageTurnState): PagePlan | null {
  const st = s.standing;
  if (!st) return null;
  const switched = st.side !== null && st.side !== st.player;
  // The board takes the side now, or, in a drill, when the drill is left.
  const turnBoard = (to: "w" | "b"): PageEffect[] => {
    const side = to === "w" ? "white" : "black";
    if (s.drill) return [{ type: "orientation", to: side, afterDrill: true }];
    return s.orientation !== side ? [{ type: "orientation", to: side }] : [];
  };
  const backToPlayer = (): PagePlan =>
    s.playerSide
      ? {
          effects: [
            { type: "standing", side: st.player },
            ...turnBoard(st.player),
          ],
          ack: "Answers are about your moves again.",
          mood: "wave",
        }
      : {
          // The side the context was built for is a guess: it is not "yours".
          effects: [{ type: "standing", side: st.player }],
          ack: "Answers are about the whole game again. Which side did you play, White or Black?",
          mood: "wave",
        };
  if (p.kind === "my_side") return switched ? backToPlayer() : null;
  if (p.bare || p.declared || s.playerSide === null) return null;
  if (p.color === s.playerSide) return switched ? backToPlayer() : null;
  const name = colorName(p.color);
  if (st.side === p.color)
    return {
      effects: [],
      ack: `Answers are already about ${name}'s moves.`,
      mood: "wave",
    };
  if (!st.contextReady) return null;
  return {
    effects: [{ type: "standing", side: p.color }, ...turnBoard(p.color)],
    ack: `Answers are about ${name}'s moves now. You're still ${colorName(s.playerSide)}.`,
    mood: "wave",
  };
}

function planPreference(p: PagePreference, s: PageTurnState): PagePlan | null {
  // A standing side ends wherever it was taken, a set-up position or a
  // puzzle included, where no side can be picked.
  if (p.kind === "my_side" && !s.sideEligible) return planStanding(p, s);
  if (!s.sideEligible) return null;
  const standing = planStanding(p, s);
  if (standing) return standing;
  if (p.kind === "side") {
    // A colour on its own answers the side ask, and only that: once the
    // side is known, or when the coach has just asked something, it is a
    // reply for the coach.
    if (p.bare && (s.playerSide !== null || s.coachAsked)) return null;
    const name = colorName(p.color);
    if (s.playerSide === p.color)
      return {
        effects: [],
        ack: `I'm coaching you as ${name} already.`,
        mood: "wave",
      };
    return {
      // A wish ("coach me as Black") can be undone by "back to my side"; a
      // statement ("I was Black") corrects the side and cannot.
      effects: [
        p.declared
          ? { type: "side", color: p.color }
          : { type: "side", color: p.color, remember: true },
      ],
      ack:
        s.playerSide === null
          ? `Coaching you as ${name}.`
          : `Coaching you as ${name} now.`,
      mood: "wave",
    };
  }
  if (s.playerSide && s.previousSide && s.previousSide !== s.playerSide)
    return {
      effects: [{ type: "side", color: s.previousSide, restore: true }],
      ack: `Coaching you as ${colorName(s.previousSide)} again.`,
      mood: "wave",
    };
  if (s.playerSide) {
    // Nothing to undo: "my side" is then the board's side.
    const mine = s.playerSide === "w" ? "white" : "black";
    if (s.orientation !== mine)
      return {
        effects: [{ type: "orientation", to: mine }],
        ack: `Back to your side. ${colorName(s.playerSide)} is at the bottom.`,
        mood: "wave",
      };
    return {
      effects: [],
      ack: `I'm coaching you as ${colorName(s.playerSide)} already.`,
      mood: "wave",
    };
  }
  return {
    effects: [],
    ack: "Which side did you play, White or Black?",
    mood: "wave",
  };
}

/**
 * The transcript once the server has answered an order itself: the empty
 * placeholder the reply would have filled goes, and the question becomes
 * the page's (synthetic, so the model never sees it). The page then adds
 * its own acknowledgement, exactly as for an order read before the fetch.
 */
export function markServedPageTurn<
  T extends {
    role: string;
    content: string;
    synthetic?: boolean;
    pageTurn?: boolean;
  },
>(prev: T[]): T[] {
  let out = prev;
  const last = out[out.length - 1];
  if (last && last.role === "coach" && last.content === "")
    out = out.slice(0, -1);
  const q = out.length - 1;
  if (q >= 0 && out[q].role === "user")
    out = [...out.slice(0, q), { ...out[q], synthetic: true, pageTurn: true }];
  return out;
}

/**
 * Did the coach's last answer ask the player something? The last coach
 * message with words in it, when the coach wrote it (not the page) and it
 * ends in a question or holds a "Your turn:" paragraph. A colour typed
 * after it is the answer to it, not to the page's side ask.
 */
export function coachAskedLast(
  messages: readonly { role: string; content: string; synthetic?: boolean }[]
): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "coach" || m.content.trim().length === 0) continue;
    if (m.synthetic) return false;
    const text = m.content.trim();
    return /\?$/.test(text) || /(?:^|\n)\s*Your turn:/i.test(text);
  }
  return false;
}
