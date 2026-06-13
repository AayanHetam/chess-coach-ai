import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  fetch_lichess_tablebase,
  isTablebaseEligible,
  countNonKingPieces,
  __setFetchForTesting,
  __resetFetchForTesting,
  __clearTablebaseCache,
} from "../lichessTablebase";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const KRK_WIN = "8/8/8/8/8/4k3/8/R3K3 w - - 0 1";
const KQVK = "8/8/8/8/8/4k3/8/3QK3 w - - 0 1";
// 5 non-king pieces (7 men incl. both kings) — the Syzygy ceiling, eligible.
const SEVEN_MAN = "4k3/8/8/8/8/8/2QRBNP1/4K3 w - - 0 1";
// 6 non-king pieces (8 men) — past the 7-man tables, must be ineligible.
const EIGHT_MAN = "4k3/8/8/8/8/8/1QRBNPP1/4K3 w - - 0 1";

describe("countNonKingPieces", () => {
  it("counts 30 non-king pieces in the starting position", () => {
    expect(countNonKingPieces(STARTING_FEN)).toBe(30);
  });

  it("counts 1 non-king piece in KRK", () => {
    expect(countNonKingPieces(KRK_WIN)).toBe(1);
  });
});

describe("isTablebaseEligible", () => {
  it("rejects starting position (far more than 5 non-king pieces)", () => {
    expect(isTablebaseEligible(STARTING_FEN)).toBe(false);
  });

  it("accepts KRK", () => {
    expect(isTablebaseEligible(KRK_WIN)).toBe(true);
  });

  it("accepts KQ-vs-K", () => {
    expect(isTablebaseEligible(KQVK)).toBe(true);
  });

  it("accepts the 7-man boundary (5 non-king pieces)", () => {
    expect(countNonKingPieces(SEVEN_MAN)).toBe(5); // confirms the FEN loaded
    expect(isTablebaseEligible(SEVEN_MAN)).toBe(true);
  });

  it("rejects 8-man positions (6 non-king pieces) — past the 7-man tables", () => {
    // Regression: the gate previously used a 7 non-king ceiling, admitting
    // 8- and 9-man positions the Lichess endpoint can't answer.
    expect(countNonKingPieces(EIGHT_MAN)).toBe(6); // confirms the FEN loaded
    expect(isTablebaseEligible(EIGHT_MAN)).toBe(false);
  });

  it("rejects invalid fen", () => {
    expect(isTablebaseEligible("not-a-fen")).toBe(false);
  });
});

describe("fetch_lichess_tablebase", () => {
  beforeEach(() => {
    __clearTablebaseCache();
  });

  afterEach(() => {
    __resetFetchForTesting();
    __clearTablebaseCache();
  });

  it("returns null for non-eligible positions without network call", async () => {
    let calls = 0;
    __setFetchForTesting(async () => {
      calls++;
      return new Response("{}", { status: 200 });
    });
    const result = await fetch_lichess_tablebase(STARTING_FEN);
    expect(result).toBeNull();
    expect(calls).toBe(0);
  });

  it("parses and normalizes the upstream response", async () => {
    __setFetchForTesting(async () => {
      return new Response(
        JSON.stringify({
          category: "win",
          dtm: 12,
          dtz: 12,
          moves: [
            { uci: "a1a2", san: "Ra2", category: "win", dtm: 11, dtz: 11 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    const result = await fetch_lichess_tablebase(KRK_WIN);
    expect(result).not.toBeNull();
    expect(result?.category).toBe("win");
    expect(result?.dtm).toBe(12);
    expect(result?.moves).toHaveLength(1);
    expect(result?.moves[0].category).toBe("win");
  });

  it("returns null on rate-limit (429)", async () => {
    __setFetchForTesting(async () => new Response("", { status: 429 }));
    const result = await fetch_lichess_tablebase(KRK_WIN);
    expect(result).toBeNull();
  });

  it("returns null on network failure", async () => {
    __setFetchForTesting(async () => {
      throw new Error("ECONNREFUSED");
    });
    const result = await fetch_lichess_tablebase(KRK_WIN);
    expect(result).toBeNull();
  });

  it("caches successful responses", async () => {
    let calls = 0;
    __setFetchForTesting(async () => {
      calls++;
      return new Response(JSON.stringify({ category: "draw" }), { status: 200 });
    });
    await fetch_lichess_tablebase(KRK_WIN);
    await fetch_lichess_tablebase(KRK_WIN);
    expect(calls).toBe(1);
  });

  it("normalizes unknown category", async () => {
    __setFetchForTesting(async () =>
      new Response(JSON.stringify({ category: "nonsense" }), { status: 200 })
    );
    const result = await fetch_lichess_tablebase(KRK_WIN);
    expect(result?.category).toBe("unknown");
  });
});
