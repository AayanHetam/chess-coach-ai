import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  gameSideKey,
  inferPlayerSideFromHeaders,
  loadStoredSide,
  storeSide,
} from "@/components/preview-analysis/playerSide";

/**
 * "Which side did you play?" — inference + persistence contract.
 *
 * The coach's playerColor used to silently default to the board
 * orientation (white). These tests pin the new resolution order:
 * username match → stored per-game answer → null (→ UI asks inline).
 */

const HEADERS = {
  White: "MagnusFan99",
  Black: "aayan_h",
  Date: "2026.08.09",
  Site: "https://lichess.org/abc123",
};

describe("inferPlayerSideFromHeaders", () => {
  it("matches a lichess/chess.com handle case-insensitively", () => {
    expect(inferPlayerSideFromHeaders(HEADERS, ["AAYAN_H"])).toBe("black");
    expect(inferPlayerSideFromHeaders(HEADERS, ["magnusfan99"])).toBe("white");
  });

  it("tries every candidate and skips empty ones", () => {
    expect(
      inferPlayerSideFromHeaders(HEADERS, [null, undefined, "", "aayan_h"])
    ).toBe("black");
  });

  it("returns null when nothing matches — the ambiguous case that must trigger the inline ask", () => {
    expect(inferPlayerSideFromHeaders(HEADERS, ["someoneelse"])).toBeNull();
    expect(inferPlayerSideFromHeaders(HEADERS, [])).toBeNull();
  });

  it("does not partial-match (a substring is not the player)", () => {
    expect(inferPlayerSideFromHeaders(HEADERS, ["aayan"])).toBeNull();
  });
});

describe("gameSideKey", () => {
  it("is stable for the same game and distinguishes different games", () => {
    const a = gameSideKey(HEADERS, 42);
    expect(a).toBe(gameSideKey({ ...HEADERS }, 42));
    expect(a).not.toBe(gameSideKey(HEADERS, 40));
    expect(a).not.toBe(gameSideKey({ ...HEADERS, White: "Other" }, 42));
  });

  it("returns null when there is nothing to key on (bare FEN load)", () => {
    expect(gameSideKey({}, 0)).toBeNull();
    expect(gameSideKey({ White: "a", Black: "b" }, 0)).toBeNull();
  });
});

describe("storeSide / loadStoredSide (localStorage-backed)", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a per-game choice", () => {
    const key = gameSideKey(HEADERS, 42)!;
    expect(loadStoredSide(key)).toBeNull();
    storeSide(key, "black");
    expect(loadStoredSide(key)).toBe("black");
    // Other games unaffected
    expect(loadStoredSide(gameSideKey(HEADERS, 40)!)).toBeNull();
  });

  it("null key is a no-op on both paths", () => {
    storeSide(null, "white");
    expect(loadStoredSide(null)).toBeNull();
    expect(Object.keys(store)).toHaveLength(0);
  });

  it("survives corrupt storage payloads", () => {
    store["cm-analysis-player-sides"] = "{not json";
    expect(loadStoredSide("k")).toBeNull();
    storeSide("k", "white");
    expect(loadStoredSide("k")).toBe("white");
  });

  it("caps the stored map at 100 games, dropping oldest entries", () => {
    for (let i = 0; i < 105; i++) storeSide(`game-${i}`, "white");
    const map = JSON.parse(store["cm-analysis-player-sides"]);
    expect(Object.keys(map)).toHaveLength(100);
    expect(map["game-0"]).toBeUndefined();
    expect(map["game-104"]).toBe("white");
  });
});
