/**
 * PR-CI-1 commit-2 unit tests — everything the snapshot suite can't say:
 *  - selectInsights reproduces the legacy selection (hard-coded expectations
 *    per fixture, including the sentinel/color asymmetries it formalizes)
 *  - evalIntegrity flags fire on the sentinel / truncation / mixed-mate
 *    fixtures and stay quiet on the clean one
 *  - the builder's single Promise.all dedupes grounding fetches by FEN
 *    (fetch invocations === unique FENs < legacy serial count)
 *  - Degraded semantics: unavailable sources carry typed reasons + forbidden
 *    claim classes (never a silent null)
 *  - serializeForVerbalizer is canonical: sorted keys, no timestamp fields
 *  - CONTRACT_SHADOW parsing is trim-hardened and memoized
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

vi.hoisted(() => {
  delete process.env.LC0_API_URL;
  delete process.env.MAIA_API_URL;
});

import { selectInsights } from "@/lib/contract/selectInsights";
import { computeEvalIntegrity } from "@/lib/contract/gameEvalSchema";
import type { GameEvalInput, GameHeadersInput } from "@/lib/contract/gameEvalSchema";
import { buildCoachContract } from "@/lib/contract/builder";
import { renderLegacyPrompt, serializeForVerbalizer } from "@/lib/contract/serialize";
import { getFenAtHalfMove } from "@/lib/contract/chessFormat";
import { generateContextId } from "@/lib/analysisContextCache";
import {
  __setFetchForTesting,
  __resetFetchForTesting,
  __clearChessdbCache,
} from "@/lib/grounding/chessdb";
import { getContractEnv, __resetContractEnvCacheForTests } from "@/env";

interface FixtureFile {
  moveHistory: string[];
  gameEval: GameEvalInput;
  playerColor: string;
  username?: string;
  userRating?: number;
  gameHeaders?: GameHeadersInput;
}

const FIXTURES_DIR = path.join(__dirname, "fixtures");
function loadFixture(name: string): FixtureFile {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, `${name}.json`), "utf8"));
}

let fetchCount = 0;

beforeAll(() => {
  delete process.env.LC0_API_URL;
  delete process.env.MAIA_API_URL;
  __setFetchForTesting(async () => {
    fetchCount++;
    throw new Error("network disabled in contract tests");
  });
});

afterAll(() => {
  __resetFetchForTesting();
});

beforeEach(() => {
  fetchCount = 0;
  __clearChessdbCache();
});

function replayedPlies(moveHistory: string[]): number {
  // The builder counts successfully replayed plies; tests derive the same
  // number from the fixture's known truncation point.
  return moveHistory.length;
}

// ── selectInsights mirrors the legacy selection ─────────────────────────────
describe("selectInsights (legacy policy)", () => {
  it("01: no user-color mistakes but the intelligence layer picks up Black's blunder", () => {
    const f = loadFixture("01_mate_for_white_midgame");
    const sel = selectInsights(f.moveHistory, f.gameEval, f.playerColor);
    expect(sel.topMistakes).toEqual([]);
    expect(sel.intelligenceTop3.map((m) => [m.ply, m.colorName, m.dropCp])).toEqual([
      [13, "Black", 9999 - 250],
    ]);
  });

  it("02: black player top-10 + mixed-color intel ordering (stable sort on equal drops)", () => {
    const f = loadFixture("02_mate_for_black");
    const sel = selectInsights(f.moveHistory, f.gameEval, f.playerColor);
    expect(sel.topMistakes.map((m) => [m.ply, m.dropCp])).toEqual([
      [15, 9699],
      [9, 90],
    ]);
    // ply14 (10119) first; plies 15 and 16 tie at 9699 — stable sort keeps
    // scan order (15 before 16).
    expect(sel.intelligenceTop3.map((m) => [m.ply, m.colorName, m.dropCp])).toEqual([
      [14, "White", 10119],
      [15, "Black", 9699],
      [16, "White", 9699],
    ]);
  });

  it("03: sentinel plies are skipped by BOTH the top-10 scan and the intelligence scan", () => {
    const f = loadFixture("03_sentinel_timeout");
    const sel = selectInsights(f.moveHistory, f.gameEval, f.playerColor);
    expect(sel.topMistakes.map((m) => [m.ply, m.dropCp])).toEqual([[10, 180]]);

    // CHANGED by the Group C fix (SILENT_SUBSTITUTION_HANDOFF §3 C4).
    //
    // This assertion previously ENDED with `[8, "White", 80]` and a comment
    // saying the intelligence scan "has no sentinel skip, and this suite pins
    // that discrepancy rather than fixing it (CI-4)". It is now fixed, so the
    // pin is updated rather than deleted.
    //
    // Why exactly one entry goes, hand-derived from the fixture (position 8 is
    // the `{cp: 0, depth: 0}` sentinel):
    //   ply 8  — evalBefore IS the sentinel; its 80cp "drop" is measured
    //            against a position the engine never scored. PHANTOM → gone.
    //   ply 9  — positions 9 (-80) → 10 (+40); Black, drop 120. Touches no
    //            sentinel. REAL → kept.
    //   ply 10 — positions 10 (+40) → 11 (-140); White, drop 180. REAL → kept.
    // ply 7 straddles the sentinel too but yields a NEGATIVE drop, so the
    // `drop > 50` filter already excluded it for unrelated reasons.
    expect(sel.intelligenceTop3.map((m) => [m.ply, m.colorName, m.dropCp])).toEqual([
      [10, "White", 180],
      [9, "Black", 120],
    ]);
  });

  it("05: six user mistakes sorted by drop; intel top-3 mixes in the opponent blunder", () => {
    const f = loadFixture("05_long_game_six_mistakes");
    const sel = selectInsights(f.moveHistory, f.gameEval, f.playerColor);
    expect(sel.topMistakes.map((m) => [m.ply, m.dropCp])).toEqual([
      [70, 500],
      [60, 320],
      [50, 250],
      [40, 160],
      [30, 90],
      [20, 55],
    ]);
    expect(sel.intelligenceTop3.map((m) => [m.ply, m.colorName, m.dropCp])).toEqual([
      [70, "White", 500],
      [45, "Black", 400],
      [60, "White", 320],
    ]);
  });

  it("06: quiet game selects nothing", () => {
    const f = loadFixture("06_short_opening");
    const sel = selectInsights(f.moveHistory, f.gameEval, f.playerColor);
    expect(sel.topMistakes).toEqual([]);
    expect(sel.intelligenceTop3).toEqual([]);
  });

  it("handles absent gameEval", () => {
    const f = loadFixture("06_short_opening");
    const sel = selectInsights(f.moveHistory, undefined, f.playerColor);
    expect(sel.topMistakes).toEqual([]);
    expect(sel.intelligenceTop3).toEqual([]);
  });

  it("rejects unknown policies (single legal value in CI-1)", () => {
    const f = loadFixture("06_short_opening");
    expect(() =>
      selectInsights(f.moveHistory, f.gameEval, f.playerColor, {
        policy: "teachability" as unknown as "legacy",
      }),
    ).toThrow(/unknown policy/);
  });
});

// ── evalIntegrity flags ─────────────────────────────────────────────────────
describe("computeEvalIntegrity", () => {
  it("03: flags the timeout sentinel at positions[8]", () => {
    const f = loadFixture("03_sentinel_timeout");
    const integ = computeEvalIntegrity(f.gameEval, f.moveHistory, replayedPlies(f.moveHistory));
    expect(integ.sentinelPlies).toEqual([8]);
    expect(integ.sanTruncatedAtPly).toBeNull();
    expect(integ.minDepth).toBe(12);
    expect(integ.suspectMixedSignMate).toBe(false);
  });

  it("04: flags SAN truncation at the first unreplayable ply", () => {
    const f = loadFixture("04_invalid_san_truncation");
    // Fixture 04 breaks at ply 9 ("Qxz9") — the builder replays 9 plies.
    const integ = computeEvalIntegrity(f.gameEval, f.moveHistory, 9);
    expect(integ.sanTruncatedAtPly).toBe(9);
    expect(integ.sentinelPlies).toEqual([]);
  });

  it("02: flags mixed-sign mates within one position's multipv", () => {
    const f = loadFixture("02_mate_for_black");
    const integ = computeEvalIntegrity(f.gameEval, f.moveHistory, replayedPlies(f.moveHistory));
    expect(integ.suspectMixedSignMate).toBe(true);
    expect(integ.multiPv).toBe(3);
  });

  it("06: clean game yields quiet flags", () => {
    const f = loadFixture("06_short_opening");
    const integ = computeEvalIntegrity(f.gameEval, f.moveHistory, replayedPlies(f.moveHistory));
    expect(integ).toEqual({
      sentinelPlies: [],
      sanTruncatedAtPly: null,
      minDepth: 12,
      multiPv: 1,
      suspectMixedSignMate: false,
    });
  });

  it("never throws on junk input (flags, never gates)", () => {
    expect(computeEvalIntegrity(null, ["e4"], 1)).toEqual({
      sentinelPlies: [],
      sanTruncatedAtPly: null,
      minDepth: 0,
      multiPv: 0,
      suspectMixedSignMate: false,
    });
    expect(
      computeEvalIntegrity({ positions: [{ lines: "garbage" }, null] }, ["e4", "e5"], 1),
    ).toMatchObject({ sanTruncatedAtPly: 1 });
  });
});

// ── Promise.all dedup (the plan-§1 free win) ────────────────────────────────
describe("builder fetch dedup", () => {
  it("05: one chessdb fetch per unique FEN — strictly fewer than the legacy serial count", async () => {
    const f = loadFixture("05_long_game_six_mistakes");
    const sel = selectInsights(f.moveHistory, f.gameEval, f.playerColor);
    const unionPlies = new Set<number>([
      ...sel.topMistakes.map((m) => m.ply),
      ...sel.intelligenceTop3.map((m) => m.ply),
    ]);
    const uniqueFens = new Set<string>();
    for (const ply of Array.from(unionPlies)) {
      uniqueFens.add(getFenAtHalfMove(f.moveHistory, ply));
    }
    // Legacy issued one fetch per top-10 entry PLUS one per intel entry
    // (serially, re-fetching FENs the mistake loop already covered).
    const legacySerialCount = sel.topMistakes.length + sel.intelligenceTop3.length;
    expect(legacySerialCount).toBe(9); // 6 top mistakes + 3 intel

    fetchCount = 0;
    await buildCoachContract({
      moveHistory: f.moveHistory,
      gameEval: f.gameEval,
      playerColor: f.playerColor,
      username: f.username,
      userRating: f.userRating,
      gameHeaders: f.gameHeaders,
    });

    expect(fetchCount).toBe(uniqueFens.size);
    expect(fetchCount).toBeLessThanOrEqual(uniqueFens.size);
    expect(fetchCount).toBeLessThan(legacySerialCount);
    expect(fetchCount).toBe(7); // {20,30,40,50,60,70} ∪ {70,45,60} = 7 plies
  });

  it("06: no insights ⇒ zero grounding fetches", async () => {
    const f = loadFixture("06_short_opening");
    fetchCount = 0;
    await buildCoachContract({
      moveHistory: f.moveHistory,
      gameEval: f.gameEval,
      playerColor: f.playerColor,
    });
    expect(fetchCount).toBe(0);
  });
});

// ── Degraded semantics ──────────────────────────────────────────────────────
describe("Degraded source semantics", () => {
  it("lc0 unset ⇒ unavailable/service_unconfigured with positional_plan forbidden", async () => {
    const f = loadFixture("07_knight_fork");
    const contract = await buildCoachContract({
      moveHistory: f.moveHistory,
      gameEval: f.gameEval,
      playerColor: f.playerColor,
      username: f.username,
      userRating: f.userRating,
    });
    expect(contract.insights.length).toBeGreaterThan(0);
    for (const insight of contract.insights) {
      expect(insight.lc0).toEqual({
        status: "unavailable",
        reason: "service_unconfigured",
        claimClassesForbidden: ["positional_plan"],
      });
      // Syzygy never runs on the game path — honest not_applicable.
      expect(insight.syzygy).toEqual({
        status: "unavailable",
        reason: "not_applicable",
        claimClassesForbidden: ["endgame_wdl"],
      });
      // Maia gated off (MAIA_API_URL unset).
      expect(insight.visibility).toMatchObject({
        status: "unavailable",
        reason: "service_unconfigured",
      });
      // chessdb fetch rejects ⇒ service_error, no claim class withdrawn
      // (chessdb only corroborates; SF grounding stands on its own).
      expect(insight.chessdb).toEqual({
        status: "unavailable",
        reason: "service_error",
        claimClassesForbidden: [],
      });
    }
  });

  it("07: the confirmed fork reaches the contract with its keywords and sayables", async () => {
    const f = loadFixture("07_knight_fork");
    const contract = await buildCoachContract({
      moveHistory: f.moveHistory,
      gameEval: f.gameEval,
      playerColor: f.playerColor,
      userRating: f.userRating,
    });
    const forkInsight = contract.insights.find((i) => i.playedSan === "Nc7+");
    expect(forkInsight).toBeDefined();
    expect(forkInsight!.motifs.some((m) => m.motif === "fork" && m.confirmed)).toBe(true);
    expect(forkInsight!.allowedTacticalKeywords).toContain("fork");
    expect(forkInsight!.sayables.motifs.length).toBe(forkInsight!.motifs.length);
    expect(forkInsight!.sayables.motifs.join(" ")).toContain("fork");
  });
});

// ── Contract shape + canonical serialization ────────────────────────────────
describe("contract assembly + serializeForVerbalizer", () => {
  it("renderLegacyPrompt(buildCoachContract(x)) is deterministic across builds", async () => {
    const f = loadFixture("03_sentinel_timeout");
    const args = {
      moveHistory: f.moveHistory,
      gameEval: f.gameEval,
      playerColor: f.playerColor,
      username: f.username,
      userRating: f.userRating,
      gameHeaders: f.gameHeaders,
    };
    __clearChessdbCache();
    const a = await buildCoachContract(args);
    __clearChessdbCache();
    const b = await buildCoachContract(args);
    expect(renderLegacyPrompt(a)).toBe(renderLegacyPrompt(b));
    expect(serializeForVerbalizer(a)).toBe(serializeForVerbalizer(b));
  });

  it("serializeForVerbalizer strips timestamps and sorts keys canonically", async () => {
    const f = loadFixture("06_short_opening");
    const contract = await buildCoachContract({
      moveHistory: f.moveHistory,
      gameEval: f.gameEval,
      playerColor: f.playerColor,
    });
    const json = serializeForVerbalizer(contract);
    expect(json).not.toContain("builtAtMs");
    expect(json).not.toContain("buildMs");
    const parsed = JSON.parse(json);
    const topKeys = Object.keys(parsed);
    expect(topKeys).toEqual([...topKeys].sort());
    expect(parsed.version).toBe("1.0");
    expect(parsed.contractId).toMatch(/^[0-9a-f]{16}$/);
  });

  it("contractId ≡ route contextId for a moveHistory-AND-fen request (PR-CI-2 identity fix)", async () => {
    const f = loadFixture("07_knight_fork");
    // The route sends the request-body fen (usually the final position) and
    // computes contextId with `playerColor || "w"`. The contract must land on
    // the SAME id — one identity for response cache, chat context, telemetry.
    const requestFen = getFenAtHalfMove(f.moveHistory, f.moveHistory.length);
    const contract = await buildCoachContract({
      moveHistory: f.moveHistory,
      gameEval: f.gameEval,
      playerColor: f.playerColor,
      userRating: f.userRating,
      uid: "user-identity-1",
      identity: { fen: requestFen, playerColor: f.playerColor || "w" },
    });
    expect(contract.contractId).toBe(
      generateContextId(f.moveHistory, requestFen, f.playerColor || "w", "user-identity-1"),
    );
    // And it differs from the fen-less identity CI-1 used to compute —
    // proving the fen actually participates.
    expect(contract.contractId).not.toBe(
      generateContextId(f.moveHistory, undefined, f.playerColor || "w", "user-identity-1"),
    );
  });

  it("contractId ≡ route contextId for a fen-only request (empty moveHistory)", async () => {
    const requestFen = "8/8/4k3/8/8/4K3/4P3/8 w - - 0 1";
    const contract = await buildCoachContract({
      moveHistory: [],
      gameEval: undefined,
      // Route corner: client sent no playerColor — the route's contextId
      // defaults it to "w" and threads exactly that through identity.
      playerColor: "",
      uid: "user-identity-2",
      identity: { fen: requestFen, playerColor: "w" },
    });
    expect(contract.contractId).toBe(
      generateContextId(undefined, requestFen, "w", "user-identity-2"),
    );
  });

  it("contractId without identity falls back to the CI-1 shape with || 'w' defaulting", async () => {
    const f = loadFixture("06_short_opening");
    const contract = await buildCoachContract({
      moveHistory: f.moveHistory,
      gameEval: f.gameEval,
      playerColor: f.playerColor,
      uid: "user-identity-3",
    });
    expect(contract.contractId).toBe(
      generateContextId(f.moveHistory, undefined, f.playerColor || "w", "user-identity-3"),
    );
  });

  it("contractId is stable for the same game+player+uid and differs across uids", async () => {
    const f = loadFixture("06_short_opening");
    const base = {
      moveHistory: f.moveHistory,
      gameEval: f.gameEval,
      playerColor: f.playerColor,
    };
    const a = await buildCoachContract({ ...base, uid: "user-1" });
    const b = await buildCoachContract({ ...base, uid: "user-1" });
    const c = await buildCoachContract({ ...base, uid: "user-2" });
    expect(a.contractId).toBe(b.contractId);
    expect(a.contractId).not.toBe(c.contractId);
  });

  it("union insights carry both rank fields (top-10 ∩ intel-3 share one insight)", async () => {
    const f = loadFixture("05_long_game_six_mistakes");
    const contract = await buildCoachContract({
      moveHistory: f.moveHistory,
      gameEval: f.gameEval,
      playerColor: f.playerColor,
      userRating: f.userRating,
    });
    // 6 top mistakes + 1 intel-only (the opponent blunder at ply 45)
    expect(contract.insights.length).toBe(7);
    const ply70 = contract.insights.find((i) => i.ply === 70)!;
    expect(ply70.topMistakeRank).toBe(1);
    expect(ply70.intelligenceRank).toBe(1);
    expect(ply70.factIdPrefix).toBe("M1");
    const ply45 = contract.insights.find((i) => i.ply === 45)!;
    expect(ply45.topMistakeRank).toBeNull();
    expect(ply45.intelligenceRank).toBe(2);
    expect(ply45.factIdPrefix).toBe("I2");
    // Intel-only insights carry the intelligence-layer facts…
    expect(ply45.relational).not.toBeNull();
    // …and never a legacy bestSan (that datum belongs to the top-10 loop).
    expect(ply45.bestSan).toBeNull();
    // pieceRoleChanges: honest [] on the game path (see types.ts).
    expect(ply70.pieceRoleChanges).toEqual([]);
  });
});

// ── CONTRACT_SHADOW env plumbing ────────────────────────────────────────────
describe("getContractEnv", () => {
  afterAll(() => {
    vi.unstubAllEnvs();
    __resetContractEnvCacheForTests();
  });

  it("defaults off; trims the Vercel trailing-newline save hazard; memoizes", () => {
    __resetContractEnvCacheForTests();
    vi.stubEnv("CONTRACT_SHADOW", "");
    expect(getContractEnv().shadowEnabled).toBe(false);

    __resetContractEnvCacheForTests();
    vi.stubEnv("CONTRACT_SHADOW", "true\n");
    expect(getContractEnv().shadowEnabled).toBe(true);

    // Memoized: flipping the env without the reset seam changes nothing.
    vi.stubEnv("CONTRACT_SHADOW", "false");
    expect(getContractEnv().shadowEnabled).toBe(true);

    __resetContractEnvCacheForTests();
    expect(getContractEnv().shadowEnabled).toBe(false);
  });

  it("CONTRACT_REFEREE_SHADOW (PR-CI-3): defaults off, trim-hardened, independent of CONTRACT_SHADOW", () => {
    __resetContractEnvCacheForTests();
    vi.stubEnv("CONTRACT_SHADOW", "");
    vi.stubEnv("CONTRACT_REFEREE_SHADOW", "");
    expect(getContractEnv().refereeShadowEnabled).toBe(false);

    // The Vercel trailing-newline save hazard.
    __resetContractEnvCacheForTests();
    vi.stubEnv("CONTRACT_REFEREE_SHADOW", "true\n");
    expect(getContractEnv().refereeShadowEnabled).toBe(true);
    // Independent flags: referee shadow on does not imply build shadow on.
    expect(getContractEnv().shadowEnabled).toBe(false);

    __resetContractEnvCacheForTests();
    vi.stubEnv("CONTRACT_REFEREE_SHADOW", "garbage");
    expect(getContractEnv().refereeShadowEnabled).toBe(false);
  });
});
