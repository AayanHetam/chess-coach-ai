// The sentences the book-exit panel is entitled to say.
//
// Separated from the component so they can be tested as prose, which is what
// they are. Every claim here is a COUNT and never a verdict: no engine has been
// consulted, no evaluation is attached, and frequency is not quality. A move
// one player in a hundred plays can be the best move on the board.
//
// The five outcomes must read as five different things. The two that are NOT
// about the reader — their opponent going first, and the corpus running out —
// are worded so they cannot be mistaken for the one that is. "We have no data
// here" read as "you left theory" would tell a player they went off book for
// reaching a position nobody in the sample happened to reach.
//
// AND NOTHING HERE PRINTS A PLY. The corpus counts half-moves; a reader counts
// moves. levels.ts said "moves" in its copy over a number that was plies for a
// year, and every band quietly showed half of what it promised.

import type { BookExit } from '@/lib/book/bookExit';
import type { BookExitResponse } from '@/pages/api/book-exit';

/** The band's own words, matching the ranges /learn already shows. */
export const RANGE: Record<string, string> = {
  new: 'under 800',
  beginner: '800\u20131199',
  improving: '1200\u20131599',
  club: '1600\u20131999',
  strong: '2000+',
};

/**
 * Plies, said as moves.
 *
 * `depth` is half-moves, because that is what the corpus counts. Nobody says
 * "six plies".
 */
export const inMoves = (plies: number): string => {
  const moves = Math.floor(plies / 2);
  if (moves <= 0) return 'from the very first move';
  if (moves === 1) return 'for the first move';
  return `for your first ${moves} moves`;
};

export interface Rendered {

  label: string;
  headline: string;
  detail: string | null;
  moves: BookExit["common"];
  disclaimer: string | null;
}

/**
 * The one sentence this panel is entitled to say, for each outcome.
 *
 * Returns null where it is entitled to say nothing — an unreadable game, or a
 * band with no book. Rendering an empty card there would be a claim of its own:
 * a reader who sees the panel appear on one game and vanish on the next reads
 * the absence as an answer.
 */
export function renderBookExit(state: BookExitResponse): Rendered | null {
  if (!state.band) {
    return {
      label: "Opening book",
      headline: "Add your rating and we can measure this game against your own level.",
      detail:
        "Which moves count as book depends entirely on who you play. Without a rating there is no population to compare you to, and we would rather say nothing than compare you to the wrong one.",
      moves: [],
      disclaimer: null,
    };
  }
  const exit = state.exit;
  const corpus = state.corpus;
  if (!exit || !corpus) return null;
  const range = RANGE[state.band] ?? state.band;
  const who = `players rated ${range}`;
  const floor = `fewer than 1 in ${Math.round(1 / (corpus.minShare || 0.02))}`;
  const notAMistake =
    "Leaving the book is not a mistake. This is a count of what other players do, not an evaluation of the move.";

  switch (exit.outcome) {
    case "left":
      return {
        label: "Opening book",
        headline: `Move ${exit.moveNumber}: you played ${exit.san}.`,
        detail:
          `${cap(floor)} ${who} play it there` +
          (exit.transposes
            ? ", though it rejoins a position they do know — a move order rather than a departure."
            : ".") +
          ` You were with them ${inMoves(exit.depth)}.`,
        moves: exit.common,
        disclaimer: notAMistake,
      };
    case "opponent-left":
      return {
        label: "Opening book",
        headline: `Your opponent left the book first, at move ${exit.moveNumber} with ${exit.san}.`,
        detail: `You were still in it. Past that point the game is off the map for ${who}, so there is nothing further to measure you against.`,
        moves: exit.common,
        disclaimer: notAMistake,
      };
    case "thin":
      return {
        label: "Opening book",
        headline: `We have no data past move ${exit.moveNumber}.`,
        detail: `Fewer than ${corpus.minGames} games by ${who} reached that position, so there is nothing to compare this game against. That is a gap in what we measured, not a comment on how you played.`,
        moves: [],
        disclaimer: null,
      };
    case "in-book":
      return {
        label: "Opening book",
        headline:
          exit.depth > 0
            ? `You stayed inside what ${who} play, for every move we can see.`
            : `Nothing to measure yet — the game has no moves.`,
        detail:
          exit.depth > 0
            ? `Our book stops at move ${Math.ceil((corpus.maxPly ?? 14) / 2)}, so this says nothing about what came after.`
            : null,
        moves: [],
        disclaimer: null,
      };
    case "unreadable":
      return null;
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
