import { describe, expect, it } from "vitest";
import { resolveEngineGate } from "../engineGate";
import type { EngineStatus } from "@/hooks/useEngine";

/**
 * T7 (SILENT_SUBSTITUTION_HANDOFF §4) — the coach unlocked with no engine data.
 *
 * The gate this replaces was:
 *
 *     allMoves.length > 0 && engine !== null &&
 *     enginePositions === null && analysisError === null
 *
 * `engine !== null` is the defect. The composer unlocks when the expression is
 * false, and `engine` is null in three situations that have nothing in common:
 * still booting (7.16 MB, single-threaded in production), cannot boot in this
 * browser, and failed to boot. Two of those are permanent and one is a few
 * seconds away, and all three presented the same open, inviting input.
 *
 * The tests below are written as the three outcomes the UI has to distinguish,
 * because "locked" vs "open" vs "open but honest" are three different products.
 */

const base = {
  moveCount: 40,
  hasEnginePositions: false,
  hasAnalysisError: false,
  status: "ready" as EngineStatus,
};

describe("resolveEngineGate — evaluations are coming (hold the question)", () => {
  it("holds while the engine is still downloading and booting", () => {
    // THE BUG: the old expression read `engine !== null` as false here and
    // therefore reported "not analyzing", opening the composer during the
    // longest window on the slowest devices.
    const gate = resolveEngineGate({ ...base, status: "loading" });
    expect(gate.pending).toBe(true);
    expect(gate.unavailable).toBe(false);
  });

  it("holds on the first render, before the engine has been asked for", () => {
    const gate = resolveEngineGate({ ...base, status: "idle" });
    expect(gate.pending).toBe(true);
  });

  it("holds while the sweep runs on a booted engine", () => {
    expect(resolveEngineGate(base).pending).toBe(true);
  });
});

describe("resolveEngineGate — evaluations are never coming (take it, but say so)", () => {
  it("does NOT hold when the browser cannot run the engine", () => {
    // Permanently locking the input would be its own lie: the user would sit
    // behind "coach unlocks when Stockfish finishes" forever.
    const gate = resolveEngineGate({ ...base, status: "unsupported" });
    expect(gate.pending).toBe(false);
    expect(gate.unavailable).toBe(true);
  });

  it("does NOT hold when the engine failed to load", () => {
    // `/engines/*` blocked by a school/corporate network filter — the case the
    // old code turned into a confident, engine-free answer.
    const gate = resolveEngineGate({ ...base, status: "failed" });
    expect(gate.pending).toBe(false);
    expect(gate.unavailable).toBe(true);
  });

  it("treats a failed sweep the same as a failed engine", () => {
    const gate = resolveEngineGate({ ...base, hasAnalysisError: true });
    expect(gate.pending).toBe(false);
    expect(gate.unavailable).toBe(true);
  });

  it("never reports both at once", () => {
    // `pending` means "wait" and `unavailable` means "don't wait"; a caller
    // reading them independently must never see both.
    const statuses: EngineStatus[] = ["idle", "loading", "ready", "unsupported", "failed"];
    for (const status of statuses) {
      for (const hasAnalysisError of [true, false]) {
        for (const hasEnginePositions of [true, false]) {
          const gate = resolveEngineGate({
            moveCount: 40,
            hasEnginePositions,
            hasAnalysisError,
            status,
          });
          expect(gate.pending && gate.unavailable).toBe(false);
        }
      }
    }
  });
});

describe("resolveEngineGate — evaluations are in hand", () => {
  it("opens the composer once the sweep has produced positions", () => {
    const gate = resolveEngineGate({ ...base, hasEnginePositions: true });
    expect(gate.pending).toBe(false);
    expect(gate.unavailable).toBe(false);
  });

  it("does not hold on an empty board", () => {
    // There is no sweep to wait for, so waiting would never end — the reason
    // the original expression was gated on the move count.
    const gate = resolveEngineGate({ ...base, moveCount: 0, status: "loading" });
    expect(gate.pending).toBe(false);
  });
});
