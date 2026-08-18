import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SourceBadge,
  buildCandidatesFromApi,
  formatCount,
  nextCandidateIndex,
  replayPreviewMove,
} from "@/components/ui/MasterGamesTakeover";

/**
 * Public-API tests for the Master Games per-row data-source tracker.
 *
 * The repo's vitest env is `node` with no jsdom / testing-library. The stateful
 * MasterGamesTakeover panel (hooks + fetch) is not directly SSR-testable, so we
 * exercise the extracted pure units instead: the presentational SourceBadge and
 * the buildCandidatesFromApi / formatCount helpers.
 */

const renderBadge = (props: Parameters<typeof SourceBadge>[0]) =>
  renderToStaticMarkup(createElement(SourceBadge, props));

// Standard start position — a legal FEN so chess.js SAN derivation succeeds.
const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("SourceBadge", () => {
  it('renders "DB" for the master-games tree', () => {
    // Was "CUR"/"Curated master index" — retired with the hand-typed overlay
    // that name described. `curated` stays in the union so responses still in
    // the edge cache across a deploy keep rendering.
    for (const source of ["tree", "curated"] as const) {
      const html = renderBadge({ source });
      expect(html).toContain("DB");
      expect(html).toContain("Master-games database");
    }
  });

  it('renders "LIC" for the lichess source', () => {
    const html = renderBadge({ source: "lichess" });
    expect(html).toContain("LIC");
    expect(html).toContain("Lichess Masters");
  });

  it('renders "ENG" for the chessdb source, and says it has no game stats', () => {
    const html = renderBadge({ source: "chessdb" });
    expect(html).toContain("ENG");
    expect(html).toContain("chessdb.cn");
    // The whole point of the relabel: chessdb is an engine database, and its
    // rows used to be indistinguishable from game statistics.
    expect(html).toContain("no game statistics");
  });

  it("renders nothing when the source is undefined (hardcoded demo rows)", () => {
    const html = renderBadge({ source: undefined });
    expect(html).toBe("");
  });

  it("exposes the source label as an accessible aria-label", () => {
    const html = renderBadge({ source: "lichess" });
    expect(html).toContain('aria-label="Source: Lichess Masters (live)"');
  });
});

describe("buildCandidatesFromApi", () => {
  it("threads the response-level source onto every candidate", () => {
    const candidates = buildCandidatesFromApi(
      {
        white: 0,
        draws: 0,
        black: 0,
        source: "lichess",
        moves: [
          { uci: "e2e4", san: "e4", white: 1_400_000, draws: 900_000, black: 500_000 },
        ],
      },
      START_FEN
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].source).toBe("lichess");
  });

  it("sets count from white+draws+black for a lichess-shaped move", () => {
    const candidates = buildCandidatesFromApi(
      {
        white: 0,
        draws: 0,
        black: 0,
        source: "lichess",
        moves: [
          { uci: "e2e4", san: "e4", white: 1_400_000, draws: 900_000, black: 500_000 },
        ],
      },
      START_FEN
    );
    expect(candidates[0].count).toBe(2_800_000);
  });

  it("sets count=0 for an engine-only source, on the API's say-so", () => {
    // This used to be inferred from the magnitude of the color split. The API
    // now states it, because the magnitude test also zeroed real positions
    // played fewer than 1000 times.
    const candidates = buildCandidatesFromApi(
      {
        source: "chessdb",
        hasGameCounts: false,
        moves: [{ uci: "e2e4", san: "e4", eval: 30, winrate: 55 }],
      },
      START_FEN
    );
    expect(candidates[0].count).toBe(0);
    expect(candidates[0].source).toBe("chessdb");
    expect(candidates[0].eval).toBe(30);
    expect(candidates[0].whiteWins).toBeUndefined();
  });

  it("derives SAN from FEN+UCI when the move omits san (chessdb path)", () => {
    const candidates = buildCandidatesFromApi(
      {
        white: 0,
        draws: 0,
        black: 0,
        source: "chessdb",
        moves: [{ uci: "e2e4", white: 60, draws: 20, black: 20 }],
      },
      START_FEN
    );
    expect(candidates[0].san).toBe("e4");
  });
});

describe("formatCount", () => {
  it("formats millions with an M suffix", () => {
    expect(formatCount(2_800_000)).toBe("3M");
    expect(formatCount(1_400_000)).toBe("1M");
  });

  it("formats thousands with a K suffix", () => {
    expect(formatCount(240_000)).toBe("240K");
    expect(formatCount(1_500)).toBe("2K");
  });

  it("leaves sub-thousand counts bare", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(42)).toBe("42");
  });
});

/**
 * Regression coverage for the Master Games takeover desync (June-6 report).
 *
 * The ae4cf45 fix requires exploration moves to replay on the *currently
 * displayed* FEN (the running preview cursor), not the canonical game FEN.
 * replayPreviewMove is that logic extracted into a pure unit; both board
 * move handlers in AnalysisImpl call it.
 */
describe("replayPreviewMove (ae4cf45 replay pattern)", () => {
  it("chains e4 → e5 when each step replays on the PREVIOUS displayFen", () => {
    // Step 1: e4 from the start position.
    const first = replayPreviewMove(START_FEN, "e2e4");
    expect(first).not.toBeNull();
    expect(first!.san).toBe("e4");
    expect(first!.from).toBe("e2");
    expect(first!.to).toBe("e4");

    // Step 2: black replies e5 — replayed on the FEN produced by step 1, NOT
    // on the canonical start FEN. This is the whole point of the fix: chained
    // clicks walk the opening tree instead of throwing.
    const second = replayPreviewMove(first!.fen, "e7e5");
    expect(second).not.toBeNull();
    expect(second!.san).toBe("e5");
    // The resulting position must be black-having-moved (white to move again).
    expect(second!.fen.split(" ")[1]).toBe("w");
  });

  it("returns null for an illegal move (e7e5 on the ply-0 start FEN)", () => {
    // Reproduces the original "Invalid move: e7-e5" bug: replaying black's
    // reply on the start position (white to move) is illegal. The helper must
    // no-op (null) rather than throw, so the caller leaves the board untouched.
    expect(replayPreviewMove(START_FEN, "e7e5")).toBeNull();
  });

  it("returns null for a malformed / empty UCI", () => {
    expect(replayPreviewMove(START_FEN, "")).toBeNull();
    expect(replayPreviewMove(START_FEN, "e2")).toBeNull();
  });
});

/**
 * ↑/↓ keyboard nav wrap logic (PR #147 in-panel candidate navigation).
 * nextCandidateIndex is the pure unit behind the panel's ArrowUp/ArrowDown
 * handler; the wrap-around at both ends is the part worth pinning.
 */
describe("nextCandidateIndex", () => {
  it("advances forward (down) within bounds", () => {
    expect(nextCandidateIndex(0, 5, 1)).toBe(1);
    expect(nextCandidateIndex(3, 5, 1)).toBe(4);
  });

  it("wraps from the last row back to the first when going down", () => {
    expect(nextCandidateIndex(4, 5, 1)).toBe(0);
  });

  it("moves backward (up) within bounds", () => {
    expect(nextCandidateIndex(3, 5, -1)).toBe(2);
  });

  it("wraps from the first row to the last when going up", () => {
    expect(nextCandidateIndex(0, 5, -1)).toBe(4);
  });

  it("returns 0 for an empty list so callers can index safely", () => {
    expect(nextCandidateIndex(0, 0, 1)).toBe(0);
    expect(nextCandidateIndex(0, 0, -1)).toBe(0);
  });
});
