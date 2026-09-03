/**
 * Caption copy.
 *
 * The answer lives in the caption below the fold, never in a comment:
 * Instagram's API cannot post a top-level comment on your own media, only
 * replies. It is also never in the video.
 *
 * Claims here are engine-free by construction. Mate is proven by chess.js
 * (no legal reply exists), material is counted. Nothing says "crushing" or
 * "winning" — that needs evals.mjs on the Mac.
 */
import { linkBand } from "./puzzles.mjs";

const HOOKS = {
  mate: [
    "Mate in {n}. Most people find it in about eight seconds. Most.",
    "Mate in {n}. The king has fewer squares than it looks.",
    "Mate in {n}. If you saw it instantly, you are the target audience.",
  ],
  fork: [
    "One move hits two things. Took me longer than I would like to admit.",
    "There is a fork here. Your knight already knows where.",
    "Two targets, one move. Go.",
  ],
  pin: [
    "Line them up and the back one is not going anywhere.",
    "Something on this board cannot legally move. Use that.",
    "A pin is just a piece with no permission to leave.",
  ],
  hanging: [
    "A piece is loose. It has been loose for a whole move.",
    "Somebody forgot to defend something. Cash it.",
    "Free material, if you look at the right square.",
  ],
  sacrifice: [
    "Give something up. That is the whole idea.",
    "Hand the material over first. The point arrives one move later.",
    "You have to hand over material first. Trust it.",
  ],
};

const HASHTAGS =
  "#chess #chesspuzzle #chesstactics #chessmasti #tactics #chessgame " +
  "#chesslover #chessdaily #brainteaser #chesscommunity";

function pad(i) {
  return String(i).padStart(2, "0");
}

/** Engine-free, replay-backed one-liner explaining the line. */
function why(p) {
  if (p.isMate) {
    const last = p.solutionSan[p.solutionSan.length - 1];
    return `Mate in ${p.mateIn}. After ${last} there is no legal reply.`;
  }
  const g = p.materialGain;
  return `The line ends ${g} point${g === 1 ? "" : "s"} of material up, counted on the board.`;
}

export function caption(p, index) {
  const pool = HOOKS[p.goal.id];
  const hook = pool[index % pool.length].replace("{n}", String(p.mateIn));
  const band = linkBand(p.rating);
  const plays = p.nbPlays.toLocaleString("en-US");
  const side = p.solverColor === "w" ? "White" : "Black";

  // The spacer pushes the answer past Instagram's "... more" fold.
  const fold = ["", ".", "", ".", "", ".", "", ".", "", ".", ""].join("\n");

  return [
    hook,
    "",
    `${side} to play. Rated ${p.rating}. They just played ${p.setupSan}.`,
    "",
    "Answer below — stop scrolling if you still want to solve it.",
    fold,
    `ANSWER: ${p.solutionSan.join(" ")}`,
    "",
    why(p),
    "",
    `Puzzle from the Lichess open puzzle database (CC0). Played ${plays} times on Lichess.`,
    `More puzzles at this level: chessmasti.com/puzzles/${band}`,
    "Chess Masti is free to start.",
    "",
    HASHTAGS,
  ].join("\n");
}

export function pinnedComment(p) {
  return [
    "// Paste by hand from the phone if you want the answer in a comment too.",
    "// Instagram's API cannot post a top-level comment on your own media,",
    "// only replies, which is why the answer already ships in the caption.",
    "",
    `ANSWER: ${p.solutionSan.join(" ")}`,
    why(p),
    `Full game: ${p.gameUrl}`,
  ].join("\n");
}

export function sheetRow(p, index) {
  return [
    pad(index + 1),
    p.id,
    p.tier.id,
    p.goal.id,
    p.rating,
    linkBand(p.rating),
    p.solverColor === "w" ? "white" : "black",
    p.isMate ? `mate-in-${p.mateIn}` : `+${p.materialGain}`,
    p.solutionSan.join(" "),
    p.gameUrl,
  ].join("\t");
}
