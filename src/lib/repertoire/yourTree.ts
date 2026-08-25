// What you actually play, counted off your own games.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE CLAIM THIS EXISTS TO MAKE TRUE
//
// /learn has always said "% of your games" next to every slot. The number came
// from the master corpus — 3.4M games by players rated 2300+ — so a 900 was
// told the Najdorf is nearly twice as likely as the London, which at their
// level is close to inverted. The label said "yours" of somebody else's games.
//
// This counts THEIR games. Nothing is inferred, nothing is weighted, no engine
// runs and no model is involved: it is a prefix match of the slot's move list
// against the moves they actually played, and a division by the games they
// actually played as that colour.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT IS DELIBERATELY NOT DONE HERE
//
// No recency weighting. It would be defensible — somebody who switched openings
// in March is misrepresented by a plain count over twelve months — but the
// weight is a parameter nobody can check, and it turns a number the player can
// verify by counting into one they have to trust. The window is stated instead.
//
// No projection. This answers "how often did you MEET this position", which is
// not the same question as "how often will you meet it once you have chosen a
// repertoire". The two coincide exactly at the root slots, where what you face
// is decided by your opponent — and the roots are where the corpus is most
// wrong. Callers must not use a measured share to answer the projected
// question; `RepertoireSlot.origin` is null for precisely the slots where they
// are the same question.
// ─────────────────────────────────────────────────────────────────────────────

import type { RepertoireSlot } from '@/types/repertoire';
import type { ScoutGame } from '@/types/scout';

/**
 * Games as one colour before a share is worth stating.
 *
 * The page renders whole percentages. At 30 games a single game moves a slot by
 * three points, which is inside the rounding the reader already tolerates; at
 * 10 it moves it by ten, and "40% of your games" would be four games and a
 * coin flip. Below this the corpus estimate is the honest thing to show, and
 * saying so is better than showing a measured number that is mostly noise.
 */
export const MIN_GAMES_PER_COLOUR = 30;

/**
 * Reaches before a slot's own share is stated as a percentage.
 *
 * Matches `REPERTOIRE_DEFAULTS.minRepeats` in the hole finder, which asks the
 * same question of the same archive. Under this the honest rendering is the
 * count — "3 of your last 240 games" — because a percentage implies a rate and
 * three of anything does not establish one.
 */
export const MIN_REACHES_FOR_SHARE = 5;

export interface SlotFacts {
  /** Your games as that colour which reached this position. */
  reached: number;
  /**
   * Your share of that colour's games, 0-1. Null when the colour has too few
   * games to divide by at all — NOT when the slot itself is rare, which is a
   * real and interesting answer.
   */
  share: number | null;
  /**
   * What you played here, most-played first. Empty when you never reached the
   * position, and empty when it is not your move — a slot records YOUR
   * decisions, and the opponent's replies are what the corpus is for.
   */
  played: Array<{ san: string; games: number }>;
}

export interface YourTree {
  /** The denominator, per colour. Never the total: a repertoire has two. */
  games: { white: number; black: number };
  /**
   * Games that named neither colour as you.
   *
   * Kept rather than silently dropped. A username that does not match anything
   * produces a tree of all zeros, which renders as "you have never played 1.e4"
   * — indistinguishable from a real answer. Callers check this.
   */
  unattributed: number;
  /** Oldest and newest game counted, so the window can be stated. */
  from: number;
  to: number;
  slots: Record<string, SlotFacts>;
}

const EMPTY_FACTS: SlotFacts = { reached: 0, share: null, played: [] };

/** Which colour they were, or null when the game is not theirs. */
export function sideOf(game: ScoutGame, username: string): 'white' | 'black' | null {
  const me = username.trim().toLowerCase();
  if (!me) return null;
  if (game.whiteUsername?.toLowerCase() === me) return 'white';
  if (game.blackUsername?.toLowerCase() === me) return 'black';
  return null;
}

/**
 * Count their archive against the slots.
 *
 * O(games x depth), not O(games x slots): the slots are indexed by their move
 * list up front and each game is walked once. The map's deepest slot is six
 * plies, so this is a few thousand string lookups over a full archive.
 */
export function buildYourTree(
  games: ScoutGame[],
  username: string,
  slots: RepertoireSlot[]
): YourTree {
  // Key on the joined line, so a slot is found by the prefix that reaches it.
  const bySide = { white: new Map<string, string>(), black: new Map<string, string>() };
  let maxDepth = 0;
  for (const slot of slots) {
    bySide[slot.side].set(slot.line.join(' '), slot.id);
    maxDepth = Math.max(maxDepth, slot.line.length);
  }

  const reached = new Map<string, number>();
  const played = new Map<string, Map<string, number>>();
  const counted = { white: 0, black: 0 };
  let unattributed = 0;
  let from = Number.POSITIVE_INFINITY;
  let to = 0;

  for (const game of games) {
    const side = sideOf(game, username);
    if (side === null) {
      unattributed += 1;
      continue;
    }
    // A game with no moves is an abort, not a game. It would otherwise inflate
    // the denominator and push every share down by a fraction nobody played.
    if (!Array.isArray(game.moves) || game.moves.length === 0) continue;

    counted[side] += 1;
    if (Number.isFinite(game.date)) {
      if (game.date < from) from = game.date;
      if (game.date > to) to = game.date;
    }

    const index = bySide[side];
    // Only the parities that can be this colour's slots: White's are even-ply,
    // Black's odd.
    //
    // This is a CORRECTNESS step, not an optimisation, and the difference
    // matters. `game.moves[ply]` is taken as the player's own move purely
    // because the slot exists at their turn — so a slot whose line length
    // disagrees with its side would have the OPPONENT's reply recorded as the
    // player's repertoire. Stepping by two means such a slot is never looked
    // up at all, and a test asserts both that the shipped map holds the
    // invariant and that a malformed slot is silently ignored rather than
    // silently misattributed.
    const start = side === 'white' ? 0 : 1;
    for (let ply = start; ply <= Math.min(maxDepth, game.moves.length); ply += 2) {
      const id = index.get(game.moves.slice(0, ply).join(' '));
      if (id === undefined) continue;
      reached.set(id, (reached.get(id) ?? 0) + 1);
      // The move at `ply` is theirs: the slot exists because it is their turn.
      const mine = game.moves[ply];
      if (mine === undefined) continue;
      let tally = played.get(id);
      if (!tally) {
        tally = new Map();
        played.set(id, tally);
      }
      tally.set(mine, (tally.get(mine) ?? 0) + 1);
    }
  }

  const out: Record<string, SlotFacts> = {};
  for (const slot of slots) {
    const hits = reached.get(slot.id) ?? 0;
    const denominator = counted[slot.side];
    const tally = played.get(slot.id);
    out[slot.id] = {
      reached: hits,
      share: denominator >= MIN_GAMES_PER_COLOUR ? hits / denominator : null,
      played: tally
        ? Array.from(tally.entries())
            .map(([san, g]) => ({ san, games: g }))
            .sort((a, b) => b.games - a.games || a.san.localeCompare(b.san))
        : [],
    };
  }

  return {
    games: counted,
    unattributed,
    from: Number.isFinite(from) ? from : 0,
    to,
    slots: out,
  };
}

export function factsFor(tree: YourTree | null, slotId: string): SlotFacts {
  return tree?.slots[slotId] ?? EMPTY_FACTS;
}

/**
 * Is there enough of their own play to state shares for this colour?
 *
 * This is also what stops a mistyped or renamed account from rendering as "you
 * have never played any of these": nothing attributed means a count of zero,
 * and zero is below the floor. There is deliberately no separate
 * zero-attribution branch — one was written and then removed, because it could
 * never fire while the floor is positive, and a guard that cannot fire makes
 * the next reader believe a case is handled specially when it is handled by
 * arithmetic. `MIN_GAMES_PER_COLOUR` being positive is what carries it, and a
 * test pins that.
 */
export function measuredFor(tree: YourTree | null, side: 'white' | 'black'): boolean {
  if (!tree) return false;
  return tree.games[side] >= MIN_GAMES_PER_COLOUR;
}

/**
 * The move they play at a slot, when they reliably play one.
 *
 * Returns null below `MIN_REACHES_FOR_SHARE` reaches — "you already play this"
 * off two games is not a repertoire, it is two games. Returns null on a genuine
 * tie as well: two moves at equal frequency is a player who has not decided,
 * and picking the alphabetically-first one would invent a decision for them.
 */
export function mainMoveAt(
  tree: YourTree | null,
  slotId: string,
  minReaches: number = MIN_REACHES_FOR_SHARE
): { san: string; games: number; share: number } | null {
  const facts = factsFor(tree, slotId);
  if (facts.reached < minReaches) return null;
  const [best, second] = facts.played;
  if (!best) return null;
  if (second && second.games === best.games) return null;
  return { san: best.san, games: best.games, share: best.games / facts.reached };
}
