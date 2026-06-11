import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  shouldCallLc0,
  lc0AgreesWithSf,
  lc0ResultToContext,
  queryLc0,
  __clearLc0Cache,
} from "../lc0";
import type { Lc0Result } from "../lc0";

// ─── shouldCallLc0 — trigger condition ────────────────────────────────────────

describe("shouldCallLc0", () => {
  const lines = (cps: number[]) => cps.map((cp) => ({ cp, pv: ["e2e4"] }));

  it("returns false when LC0_API_URL not configured", () => {
    // LC0_API_URL is unset in test env → all calls return false
    expect(shouldCallLc0(50, lines([50, 40]))).toBe(false);
  });

  describe("with LC0_API_URL configured (module reloaded)", () => {
    // LC0_API_URL is captured at module load, so the band tests need a
    // fresh module instance with the env stubbed first.
    async function loadConfigured() {
      vi.resetModules();
      vi.stubEnv("LC0_API_URL", "http://lc0.test");
      const mod = await import("../lc0");
      return mod.shouldCallLc0;
    }

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it("fires inside the ±200cp second-opinion band when top-2 lines are close (Q6 widening)", async () => {
      const gate = await loadConfigured();
      expect(gate(50, lines([50, 40]))).toBe(true);
      // [150, 200]: the band that makes the voter's MED→HIGH upgrades
      // (lc0AgreesWithSf, both ≥150) reachable — the Q6 fix.
      expect(gate(180, lines([180, 170]))).toBe(true);
      expect(gate(-180, lines([-180, -170]))).toBe(true);
      expect(gate(200, lines([200, 190]))).toBe(true);
    });

    it("does not fire beyond ±200cp (lopsided positions)", async () => {
      const gate = await loadConfigured();
      expect(gate(201, lines([201, 195]))).toBe(false);
      expect(gate(-450, lines([-450, -440]))).toBe(false);
    });

    it("still requires top-2 lines within 30cp", async () => {
      const gate = await loadConfigured();
      expect(gate(180, lines([180, 120]))).toBe(false);
      expect(gate(180, lines([180]))).toBe(false);
    });

    it("still refuses forced-mate lines", async () => {
      const gate = await loadConfigured();
      expect(gate(50, [{ cp: 50, mate: 3, pv: ["e2e4"] }, { cp: 40, pv: ["d2d4"] }])).toBe(false);
    });
  });
});

// ─── lc0AgreesWithSf — strict spec: both ≥ +150 or both ≤ -150 ────────────────

describe("lc0AgreesWithSf", () => {
  it("true when both ≥ +150", () => {
    expect(lc0AgreesWithSf(180, 200)).toBe(true);
    expect(lc0AgreesWithSf(150, 150)).toBe(true);
  });

  it("true when both ≤ -150", () => {
    expect(lc0AgreesWithSf(-180, -200)).toBe(true);
    expect(lc0AgreesWithSf(-150, -150)).toBe(true);
  });

  it("false when one is below threshold magnitude", () => {
    expect(lc0AgreesWithSf(100, 200)).toBe(false);
    expect(lc0AgreesWithSf(180, 140)).toBe(false);
  });

  it("false when opposite directions", () => {
    expect(lc0AgreesWithSf(180, -200)).toBe(false);
    expect(lc0AgreesWithSf(-180, 200)).toBe(false);
  });

  it("false when either is null", () => {
    expect(lc0AgreesWithSf(null, 200)).toBe(false);
    expect(lc0AgreesWithSf(180, null)).toBe(false);
    expect(lc0AgreesWithSf(null, null)).toBe(false);
  });

  it("false at boundary just below threshold", () => {
    expect(lc0AgreesWithSf(149, 200)).toBe(false);
    expect(lc0AgreesWithSf(200, -149)).toBe(false);
  });
});

// ─── lc0ResultToContext — prompt injection text ───────────────────────────────

const LC0_AGREE: Lc0Result = {
  fen: "test",
  eval_cp: 220,
  best_move: "Nf6",
  nodes: 800,
  model: "lc0",
  source: "live",
};

describe("lc0ResultToContext", () => {
  it("returns empty string when result is null", () => {
    expect(lc0ResultToContext(null, 180)).toBe("");
  });

  it("returns empty string when eval_cp is null", () => {
    expect(lc0ResultToContext({ ...LC0_AGREE, eval_cp: null }, 180)).toBe("");
  });

  it("includes AGREES marker when SF and Lc0 agree (both ≥ +150)", () => {
    const ctx = lc0ResultToContext(LC0_AGREE, 180);
    expect(ctx).toContain("AGREES with Stockfish");
    expect(ctx).toContain("+2.20");
    expect(ctx).toContain("Nf6");
    expect(ctx).toContain("800 nodes");
  });

  it("marks divergence when SF and Lc0 differ in magnitude or direction", () => {
    const ctx = lc0ResultToContext(LC0_AGREE, 50);
    expect(ctx).toContain("diverges from Stockfish");
  });

  it("formats negative eval correctly", () => {
    const lc0Loss: Lc0Result = { ...LC0_AGREE, eval_cp: -220 };
    const ctx = lc0ResultToContext(lc0Loss, -180);
    expect(ctx).toContain("-2.20");
    expect(ctx).toContain("AGREES");
  });

  it("handles missing best_move gracefully", () => {
    const noMove: Lc0Result = { ...LC0_AGREE, best_move: null };
    const ctx = lc0ResultToContext(noMove, 180);
    expect(ctx).not.toContain("Best:");
    expect(ctx).toContain("+2.20");
  });
});

// ─── queryLc0 — HTTP client safety ────────────────────────────────────────────

describe("queryLc0", () => {
  beforeEach(() => { __clearLc0Cache(); });
  afterEach(() => { __clearLc0Cache(); });

  it("returns null when LC0_API_URL is not set", async () => {
    // No env var in test runtime → fail-closed
    const result = await queryLc0("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    expect(result).toBeNull();
  });
});
