/**
 * PR-CI-1 commit-1 safety net: byte-for-byte snapshots of buildGameContext.
 *
 * These snapshots pin the EXACT prompt text the legacy builder produces on
 * 8 deterministic fixture games (fixtures/*.json — synthetic, handcrafted
 * gameEval shapes covering mate evals, sentinel positions, SAN truncation,
 * multi-mistake sorting, motif detection, and quiet games).
 *
 * Commit 2 of PR-CI-1 refactors buildGameContext to render from a typed
 * CoachContract; the gate is that every snapshot here stays green WITHOUT
 * regeneration. "Semantically the same" = failure — byte equality only
 * (CONTRACT_INVERSION_PLAN.md §7 PR-CI-1, §11 non-goals).
 *
 * Network determinism:
 *  - chessdb: fetch seam forced to reject → queryChessdb resolves null on
 *    every call (module-level result cache cleared between tests).
 *  - Lc0 / Maia: LC0_API_URL / MAIA_API_URL are read at MODULE LOAD TIME in
 *    lc0.ts / maia.ts, so they are deleted inside vi.hoisted() — which
 *    vitest executes BEFORE the static imports below — and again in
 *    beforeAll as a belt-and-braces check. shouldCallLc0/shouldCallMaia
 *    then gate every query off deterministically.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

vi.hoisted(() => {
  delete process.env.LC0_API_URL;
  delete process.env.MAIA_API_URL;
});

import {
  buildGameContext,
  type GameEvalInput,
  type GameHeadersInput,
} from "@/lib/contract/legacyGameContext";
import {
  __setFetchForTesting,
  __resetFetchForTesting,
  __clearChessdbCache,
} from "@/lib/grounding/chessdb";

interface FixtureFile {
  moveHistory: string[];
  gameEval: GameEvalInput;
  playerColor: string;
  username?: string;
  userRating?: number;
  gameHeaders?: GameHeadersInput;
}

const FIXTURES_DIR = path.join(__dirname, "fixtures");
const fixtureNames = fs
  .readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

function loadFixture(name: string): FixtureFile {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8"));
}

beforeAll(() => {
  delete process.env.LC0_API_URL;
  delete process.env.MAIA_API_URL;
  __setFetchForTesting(async () => {
    throw new Error("network disabled in snapshot tests");
  });
});

afterAll(() => {
  __resetFetchForTesting();
});

beforeEach(() => {
  // queryChessdb caches per-FEN results in module state; clear so every test
  // sees the same cold-miss (null) behavior regardless of execution order.
  __clearChessdbCache();
});

describe("buildGameContext byte-equality snapshots (PR-CI-1)", () => {
  expect(fixtureNames.length).toBeGreaterThanOrEqual(8);

  for (const name of fixtureNames) {
    it(`renders ${name} byte-identically`, async () => {
      const f = loadFixture(name);
      const out = await buildGameContext(
        f.moveHistory,
        f.gameEval,
        f.playerColor,
        f.username,
        f.userRating,
        f.gameHeaders,
      );
      expect(typeof out).toBe("string");
      expect(out.length).toBeGreaterThan(0);
      expect(out).toMatchSnapshot();
    });
  }
});
