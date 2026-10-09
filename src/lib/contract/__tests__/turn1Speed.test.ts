/**
 * The turn-1 switches, the early stream (pathway 4.8a) and the lean move
 * table (4.8b): each read per call, off unless set to one of the four on
 * spellings.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isTurn1EarlyStream,
  isTurn1LeanTable,
  TURN1_GROUNDING_WAIT_MS,
} from "@/lib/contract/turn1Speed";
import { TURN1_GROUNDING_SETTLE_CAP_MS } from "@/lib/contract/builder";
import { FETCH_TIMEOUT_MS as CHESSDB_TIMEOUT_MS } from "@/lib/grounding/chessdb";
import { FETCH_TIMEOUT_MS as LC0_TIMEOUT_MS } from "@/lib/grounding/lc0";
import { FETCH_TIMEOUT_MS as MAIA_TIMEOUT_MS } from "@/lib/grounding/maia";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isTurn1EarlyStream", () => {
  it("is off when unset", () => {
    vi.stubEnv("COACH_TURN1_EARLY_STREAM", undefined as unknown as string);
    expect(isTurn1EarlyStream()).toBe(false);
  });

  it.each(["1", "true", "yes", "on", " ON ", "True"])("is on for %j", (v) => {
    vi.stubEnv("COACH_TURN1_EARLY_STREAM", v);
    expect(isTurn1EarlyStream()).toBe(true);
  });

  it.each(["", "0", "false", "no", "off", "2", "enabled"])(
    "is off for %j",
    (v) => {
      vi.stubEnv("COACH_TURN1_EARLY_STREAM", v);
      expect(isTurn1EarlyStream()).toBe(false);
    }
  );

  it("is read per call", () => {
    vi.stubEnv("COACH_TURN1_EARLY_STREAM", "1");
    expect(isTurn1EarlyStream()).toBe(true);
    vi.stubEnv("COACH_TURN1_EARLY_STREAM", "0");
    expect(isTurn1EarlyStream()).toBe(false);
  });
});

describe("isTurn1LeanTable", () => {
  it("is off when unset", () => {
    vi.stubEnv("COACH_TURN1_LEAN_TABLE", undefined);
    expect(isTurn1LeanTable()).toBe(false);
  });

  it.each(["1", "true", "yes", "on", " ON ", "True"])("is on for %j", (v) => {
    vi.stubEnv("COACH_TURN1_LEAN_TABLE", v);
    expect(isTurn1LeanTable()).toBe(true);
  });

  it.each(["", "0", "false", "no", "off", "2", "enabled"])(
    "is off for %j",
    (v) => {
      vi.stubEnv("COACH_TURN1_LEAN_TABLE", v);
      expect(isTurn1LeanTable()).toBe(false);
    }
  );

  it("is read per call", () => {
    vi.stubEnv("COACH_TURN1_LEAN_TABLE", "1");
    expect(isTurn1LeanTable()).toBe(true);
    vi.stubEnv("COACH_TURN1_LEAN_TABLE", "0");
    expect(isTurn1LeanTable()).toBe(false);
  });

  it("is its own switch, apart from the early stream", () => {
    vi.stubEnv("COACH_TURN1_LEAN_TABLE", "1");
    vi.stubEnv("COACH_TURN1_EARLY_STREAM", "0");
    expect(isTurn1LeanTable()).toBe(true);
    expect(isTurn1EarlyStream()).toBe(false);
    vi.stubEnv("COACH_TURN1_LEAN_TABLE", "0");
    vi.stubEnv("COACH_TURN1_EARLY_STREAM", "1");
    expect(isTurn1LeanTable()).toBe(false);
    expect(isTurn1EarlyStream()).toBe(true);
  });
});

describe("the waits", () => {
  it("the prompt's wait is well inside every client's own timeout", () => {
    expect(TURN1_GROUNDING_WAIT_MS).toBeGreaterThan(0);
    expect(TURN1_GROUNDING_WAIT_MS).toBeLessThanOrEqual(3000);
  });

  it("the referee's cap is the slowest client's timeout plus one second", () => {
    expect(TURN1_GROUNDING_SETTLE_CAP_MS).toBe(
      Math.max(CHESSDB_TIMEOUT_MS, LC0_TIMEOUT_MS, MAIA_TIMEOUT_MS) + 1000
    );
    expect(TURN1_GROUNDING_SETTLE_CAP_MS).toBe(9000);
  });
});
