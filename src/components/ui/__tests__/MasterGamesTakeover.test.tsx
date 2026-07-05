import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SourceBadge,
  buildCandidatesFromApi,
  formatCount,
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
  it('renders "CUR" for the curated source', () => {
    const html = renderBadge({ source: "curated" });
    expect(html).toContain("CUR");
    expect(html).toContain("Curated master index");
  });

  it('renders "LIC" for the lichess source', () => {
    const html = renderBadge({ source: "lichess" });
    expect(html).toContain("LIC");
    expect(html).toContain("Lichess Masters");
  });

  it('renders "CDB" for the chessdb source', () => {
    const html = renderBadge({ source: "chessdb" });
    expect(html).toContain("CDB");
    expect(html).toContain("chessdb.cn");
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

  it("sets count=0 for a chessdb-shaped move (synthesized color splits, not games)", () => {
    const candidates = buildCandidatesFromApi(
      {
        white: 0,
        draws: 0,
        black: 0,
        source: "chessdb",
        moves: [
          { uci: "e2e4", san: "e4", white: 60, draws: 20, black: 20, eval: 30, winrate: 55 },
        ],
      },
      START_FEN
    );
    expect(candidates[0].count).toBe(0);
    expect(candidates[0].source).toBe("chessdb");
    expect(candidates[0].eval).toBe(30);
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
