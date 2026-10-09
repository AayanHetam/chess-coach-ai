/**
 * Shared inputs for the early-grounding builder tests (pathway 4.8a): the
 * ten real fixtures as builder arguments, a one-insight game, and a
 * deterministic answer per position for each grounding source, so two builds
 * of one game see the same values.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { BuildCoachContractArgs } from "@/lib/contract/builder";
import { getFenAtHalfMove } from "@/lib/contract/chessFormat";
import type { CoachContract } from "@/lib/contract/types";
import type {
  GameEvalInput,
  GameHeadersInput,
} from "@/lib/contract/gameEvalSchema";
import type { ChessdbResult } from "@/lib/grounding/chessdb";
import type { Lc0Result } from "@/lib/grounding/lc0";
import type { MaiaProbResult } from "@/lib/grounding/maia";

interface FixtureFile {
  moveHistory: string[];
  gameEval: GameEvalInput;
  playerColor: string;
  username?: string;
  userRating?: number;
  gameHeaders?: GameHeadersInput;
}

const REAL_DIR = path.join(__dirname, "fixtures-real");
export const REAL_FIXTURES = fs
  .readdirSync(REAL_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

export function argsFor(name: string): BuildCoachContractArgs {
  const f = JSON.parse(
    fs.readFileSync(path.join(REAL_DIR, name), "utf8")
  ) as FixtureFile;
  return {
    moveHistory: f.moveHistory,
    gameEval: f.gameEval,
    playerColor: f.playerColor,
    username: f.username,
    userRating: f.userRating,
    gameHeaders: f.gameHeaders,
    uid: `early-${name}`,
    identity: {
      fen: getFenAtHalfMove(f.moveHistory, f.moveHistory.length),
      playerColor: f.playerColor || "w",
    },
  };
}

const line = (cp: number) => ({ pv: ["e2e4"], cp, depth: 16, multiPv: 1 });

/** groundingTelemetry.test.ts's game: one White blunder at ply 0, one chessdb fetch. */
export const SMALL: BuildCoachContractArgs = {
  moveHistory: ["e4", "e5", "Nf3", "Nc6"],
  gameEval: {
    positions: [
      { bestMove: "e2e4", lines: [line(620)] },
      { bestMove: "e2e4", lines: [line(-50)] },
      { bestMove: "e2e4", lines: [line(-60)] },
      { bestMove: "e2e4", lines: [line(-70)] },
      { bestMove: "e2e4", lines: [line(-80)] },
    ],
  },
  playerColor: "w",
  userRating: 1500,
};

// A deterministic answer per position, so two builds see the same values.
export const chessdbOk = (fen: string): ChessdbResult => {
  const score = ((fen.length * 37) % 400) - 200;
  return {
    fen,
    best_move: "e2e4",
    score_cp: score,
    outcome: score >= 200 ? "win" : score <= -200 ? "loss" : "unclear",
    source: "live",
  };
};
export const lc0Ok = (fen: string): Lc0Result => ({
  fen,
  eval_cp: ((fen.length * 13) % 300) - 150,
  best_move: "e2e4",
  nodes: 800,
  model: "test",
  source: "live",
});
export const maiaOk = (
  fen: string,
  rating: number,
  best: string
): MaiaProbResult => ({
  fen,
  rating,
  best_move_uci: best,
  prob_plays_best: ((fen.length * 7) % 100) / 100,
  likely_moves: [],
  model: "test",
  source: "live",
});

export const withoutTimes = (c: CoachContract) => {
  const { builtAtMs: _b, buildMs: _m, ...rest } = c;
  return rest;
};
