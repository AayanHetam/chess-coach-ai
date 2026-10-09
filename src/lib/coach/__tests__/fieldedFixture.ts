/**
 * Fixture 07 for the fielded follow-up's tests: White's 8. Nc7+ (played)
 * against 8. Qxc1 (the engine's best), the game going Kd8 Nxa8 Qxd1+ Kxd1.
 * The compact contract is the one the moment checks' and the referee's
 * tests build, and the referee is the real one with the inputs the route
 * gives it on a turn anchored on the move.
 */
import { Chess } from "chess.js";
import { toCompactContract } from "@/lib/contract/followUp";
import { buildLineStory } from "@/lib/contract/lineStory";
import { refereeFollowUp } from "@/lib/contract/followUpReferee";
import {
  lineFact,
  makeContract,
  makeInsight,
} from "@/lib/contract/__tests__/insightFactory";
import type { QuestionAnchor } from "../questionAnchor";
import { anchorLicensedLines } from "../followUpContext";

export const MOVES =
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Qb6 Nf3 Qxb2 Na3 Qxa1 Nb5 Qxc1 Nc7+ Kd8 Nxa8 Qxd1+ Kxd1 e5".split(
    " "
  );

export function fenAt(n: number): string {
  const g = new Chess();
  MOVES.slice(0, n).forEach((m) => g.move(m));
  return g.fen();
}

const fenBefore8 = fenAt(14);

const insight = makeInsight({
  factIdPrefix: "M1",
  ply: 14,
  moveNumber: 8,
  color: "w",
  colorName: "White",
  playedSan: "Nc7+",
  bestSan: "Qxc1",
  fenBefore: fenBefore8,
  fenAfter: fenAt(15),
  motifs: [],
  allowedTacticalKeywords: [],
  evalBefore: {
    cp: 284,
    mate: null,
    depth: 16,
    sentinel: false,
    display: "+2.84",
    provenance: {
      source: "stockfish_client",
      confidence: "client_reported",
      depth: 16,
    },
  },
  evalAfter: {
    cp: -211,
    mate: null,
    depth: 16,
    sentinel: false,
    display: "-2.11",
    provenance: {
      source: "stockfish_client",
      confidence: "client_reported",
      depth: 16,
    },
  },
  lines: [
    {
      ...lineFact("M1.pv0", ["Qxc1", "Rb8", "Qf4"], ["d1c1", "a8b8", "c1f4"], {
        cp: 284,
        display: "+2.84",
      }),
      story: buildLineStory(fenBefore8, ["Qxc1", "Rb8", "Qf4"]),
    },
  ],
  gameStory: buildLineStory(fenBefore8, [
    "Nc7+",
    "Kd8",
    "Nxa8",
    "Qxd1+",
    "Kxd1",
  ]),
  sayables: {
    motifs: [],
    relationalCaptures: [],
    relationalHanging: ["The q on c1 is undefended."],
    relationalPins: [],
  },
});

export const compact = toCompactContract(makeContract([insight]), ["M1"]);

/** The engine's sweep as the context stores it: a real line before 8. Nc7+ only. */
export const gameEval = {
  positions: MOVES.map((_, i) =>
    i === 14
      ? {
          bestMove: "d1c1",
          lines: [{ pv: ["d1c1", "a8b8", "c1f4"], cp: 284, depth: 16 }],
        }
      : { lines: [] }
  ).concat([{ lines: [] }]),
};

export function anchorAt(index: number): QuestionAnchor {
  const g = new Chess();
  MOVES.slice(0, index).forEach((m) => g.move(m));
  const fenBefore = g.fen();
  const mv = g.move(MOVES[index]);
  return {
    index,
    moveNumber: Math.floor(index / 2) + 1,
    color: mv.color,
    san: mv.san,
    ply: index + 1,
    fenBefore,
    fenAfter: g.fen(),
    matched: "numbered",
  };
}

export const anchor8 = anchorAt(14);

/** The real referee with the inputs the route gives it on a turn anchored on `anchor`. */
export function refereeFor(anchor: QuestionAnchor = anchor8) {
  return (reply: string) =>
    refereeFollowUp({
      reply,
      compact,
      activeFen: anchor.fenAfter,
      moveHistory: MOVES,
      licensedEvals: [],
      extraFens: [anchor.fenBefore, anchor.fenAfter],
      extraLicensedText: "",
      activePly: anchor.ply,
      extraLines: anchorLicensedLines(anchor, gameEval),
    });
}
