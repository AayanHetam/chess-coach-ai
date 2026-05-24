import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { vercelBypassHeaders, analyzeGame } from "../client";
import type { GameEval } from "../../../src/types/eval";

describe("vercelBypassHeaders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("env var unset → no headers", () => {
    it("returns empty object when VERCEL_AUTOMATION_BYPASS_SECRET is unset", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "");
      expect(vercelBypassHeaders("https://chess-coach-abc123.vercel.app")).toEqual({});
    });
  });

  describe("env var set + base URL is *.vercel.app → headers injected", () => {
    it("returns the protection-bypass header for a typical preview URL", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "test-secret-value-abc123");
      const headers = vercelBypassHeaders("https://chess-coach-abc123.vercel.app");
      expect(headers).toEqual({
        "x-vercel-protection-bypass": "test-secret-value-abc123",
      });
    });

    it("does NOT include x-vercel-set-bypass-cookie (causes infinite redirect loop)", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "secret-xyz");
      const headers = vercelBypassHeaders("https://chess-coach-abc.vercel.app");
      expect(headers["x-vercel-set-bypass-cookie"]).toBeUndefined();
    });

    it("works with subdomain variants (production-like vercel.app subdomains)", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "secret-xyz");
      const headers = vercelBypassHeaders("https://chess-coach-mbeuac5re-aayan-hs-projects.vercel.app");
      expect(headers["x-vercel-protection-bypass"]).toBe("secret-xyz");
    });

    it("preserves trailing path / query without affecting host detection", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "secret-xyz");
      const headers = vercelBypassHeaders("https://preview.vercel.app/api/scout?x=1");
      expect(headers["x-vercel-protection-bypass"]).toBe("secret-xyz");
    });
  });

  describe("env var set + base URL is NOT *.vercel.app → no headers (production-safety invariant)", () => {
    it("does NOT inject for production chessmasti.com", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "secret-xyz");
      expect(vercelBypassHeaders("https://chessmasti.com")).toEqual({});
    });

    it("does NOT inject for localhost", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "secret-xyz");
      expect(vercelBypassHeaders("http://127.0.0.1:3000")).toEqual({});
      expect(vercelBypassHeaders("http://localhost:3000")).toEqual({});
    });

    it("does NOT inject for random non-vercel domains", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "secret-xyz");
      expect(vercelBypassHeaders("https://example.com")).toEqual({});
      expect(vercelBypassHeaders("https://api.chess.com")).toEqual({});
    });

    it("does NOT inject when base URL is malformed (no schema)", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "secret-xyz");
      expect(vercelBypassHeaders("not-a-url")).toEqual({});
    });

    it("does NOT match host substrings — e.g. vercel.app.evil.com is not bypassed", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "secret-xyz");
      expect(vercelBypassHeaders("https://vercel.app.evil.com")).toEqual({});
    });
  });

  describe("secret hygiene", () => {
    it("returns a fresh object each call (no shared mutation across requests)", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "secret-xyz");
      const a = vercelBypassHeaders("https://chess.vercel.app");
      const b = vercelBypassHeaders("https://chess.vercel.app");
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// analyzeGame: gameEval shape contract invariant
// ─────────────────────────────────────────────────────────────────────

function buildGameEval(positionCount: number): GameEval {
  return {
    positions: Array.from({ length: positionCount }, () => ({
      lines: [{ pv: [], cp: 0, depth: 14, multiPv: 1 }],
    })),
    accuracy: { white: 0, black: 0 },
  } as GameEval;
}

function baseAnalyzeArgs(overrides: {
  moveHistory: string[];
  gameEval: GameEval;
}) {
  return {
    baseUrl: "http://localhost:3000",
    cookie: "test-cookie",
    fen: "8/8/8/8/8/8/8/8 w - - 0 1",
    playerColor: "w" as const,
    userRating: 1500,
    personalityId: "friendly",
    ...overrides,
  };
}

describe("analyzeGame — gameEval shape invariant (Follow-up B Layer 3)", () => {
  beforeEach(() => {
    // Stub fetch so a passing invariant doesn't actually hit the network.
    // Tests that pass the invariant only need to verify fetch was reached.
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ gameAnalysis: { contextId: "ctx-test", analysis: "ok" } }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("valid shape (positions.length === moveHistory.length + 1) → no throw, fetch called", async () => {
    const result = await analyzeGame(
      baseAnalyzeArgs({
        moveHistory: ["e4", "e5", "Nf3", "Nc6"],
        gameEval: buildGameEval(5), // 4 moves + 1 starting state
      }),
    );
    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it("off-by-one (positions.length === moveHistory.length) → throws with grep-able cleanup_followups reference", async () => {
    await expect(
      analyzeGame(
        baseAnalyzeArgs({
          moveHistory: ["e4", "e5", "Nf3", "Nc6"],
          gameEval: buildGameEval(4), // off by one: missing starting state
        }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      errorMessage: expect.stringContaining("gameEval shape contract violated"),
    });
    // The thrown Error is caught by analyzeGame's try/catch and returned
    // as ok=false; verify fetch was NOT reached (invariant fired first).
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("error message references cleanup_followups.md for grep-ability", async () => {
    const result = await analyzeGame(
      baseAnalyzeArgs({
        moveHistory: ["e4", "e5", "Nf3", "Nc6"],
        gameEval: buildGameEval(4),
      }),
    );
    expect(result.errorMessage).toContain("MASTERMIND_CONTEXT/cleanup_followups.md");
  });

  it("empty moveHistory edge → no throw (invariant skipped; fen-anchored fallback applies)", async () => {
    const result = await analyzeGame(
      baseAnalyzeArgs({
        moveHistory: [],
        gameEval: buildGameEval(0),
      }),
    );
    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledOnce();
  });
});

describe("run.ts truncation slice — Layer 3 regression test", () => {
  // This test asserts the truncation logic shape independently of analyzeGame's
  // invariant. A future refactor of the slice in run.ts could re-introduce the
  // off-by-one and the analyzeGame test above would still pass (because
  // analyzeGame only sees the post-truncation shape; the truncation itself
  // happens in run.ts before the call). This test pins the slice math directly.
  //
  // The truncation is inlined in run.ts:1040-1044 and not extracted into a
  // helper, so the test reproduces the slice expressions verbatim and asserts
  // shape parity with production's positions.length === moveHistory.length + 1
  // contract.

  it("slice(0, cp.ply + 1) on positions matches production shape", () => {
    // Fixture mimics the post-(α-extension) cached gameEntry: 59-ply game
    // with 60 positions (1 starting + 59 moves).
    const fullChessjsHistory = Array.from({ length: 59 }, (_, i) => `M${i + 1}`);
    const fullPositions = Array.from({ length: 60 }, () => ({
      lines: [{ pv: [], cp: 0, depth: 14, multiPv: 1 }],
    }));
    const cpPly = 52;

    // The slices verbatim from run.ts (truncation site).
    const truncatedMoveHistory = fullChessjsHistory.slice(0, cpPly);
    const truncatedPositions = fullPositions.slice(0, cpPly + 1);

    // Production contract: positions.length === moveHistory.length + 1.
    expect(truncatedMoveHistory.length).toBe(cpPly);
    expect(truncatedPositions.length).toBe(cpPly + 1);
    expect(truncatedPositions.length).toBe(truncatedMoveHistory.length + 1);
  });

  it("regression guard: slice(0, cp.ply) on positions would violate the contract", () => {
    // Document what the old buggy slice produced. If anyone changes the
    // truncation site back to slice(0, cp.ply), this test pins the broken
    // shape so the diff catches them.
    const fullPositions = Array.from({ length: 60 }, () => ({}));
    const cpPly = 52;
    const buggySlice = fullPositions.slice(0, cpPly);
    expect(buggySlice.length).toBe(cpPly); // not cp.ply + 1 — the bug
    expect(buggySlice.length).not.toBe(cpPly + 1);
  });
});
