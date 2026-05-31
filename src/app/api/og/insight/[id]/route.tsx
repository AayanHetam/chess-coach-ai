import { ImageResponse } from "next/og";
import { getInsight } from "@/lib/insights";
import { excerptCoachContent } from "@/lib/og/excerptCoachContent";
import {
  parseFenToBoard,
  sideToMoveFromFen,
  type BoardSquare,
} from "@/lib/og/parseFen";

export const runtime = "nodejs";

// 1200×630 is the canonical Twitter / OG card aspect. Most clients
// (Twitter, LinkedIn, Discord, Slack) reflow it correctly at 2:1.
const CARD_W = 1200;
const CARD_H = 630;

// Board sizing — 480px lets us comfortably fit on the left half of a
// 1200×630 card with breathing room. 60px squares are large enough that
// the Latin piece letters render legibly even at 1× preview density.
const BOARD_SIZE = 480;
const CELL = BOARD_SIZE / 8; // 60

const BG = "#0B0F19"; // Obsidian Glass background
const FG = "#F1F5F9"; // primary text
const MUTED = "#94A3B8"; // secondary text
const EMBER = "#F97316"; // brand accent (Ember Core)
const EDGE = "rgba(255,255,255,0.08)";
// Board square colors — chosen to read on the dark card background.
// Light = warm parchment; dark = deep slate. Higher contrast than
// classic tournament wood since the surrounding card is already dark.
const LIGHT_SQUARE = "#E8DCC4";
const DARK_SQUARE = "#7E8FA3";
const WHITE_PIECE = "#FFFFFF";
const BLACK_PIECE = "#1A1A1A";

/**
 * Server-rendered OG image for a saved coach insight. Linked from the
 * /analysis?insightId=N getServerSideProps OG meta — every share unfurl
 * (Twitter, Discord, Slack, LinkedIn, …) fetches THIS endpoint as the
 * og:image and the card below is what appears in the preview.
 *
 * v2 (this revision): real chess board rendered from the insight's FEN
 * alongside the coach excerpt. Pieces are drawn with Latin notation
 * (K/Q/R/B/N/P uppercase = white, lowercase = black) — same convention
 * printed chess books use. Avoids needing to ship a font with chess
 * glyph coverage, which Satori would otherwise demand.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let coachExcerpt =
    "An AI chess coach that explains every move like a real coach — no hallucinations.";
  let fen = "";
  let sideLabel = "chessmasti.com";

  if (id && typeof id === "string" && id.length <= 64) {
    try {
      const insight = await getInsight(id);
      if (insight) {
        coachExcerpt =
          excerptCoachContent(insight.coachContent, 200) || coachExcerpt;
        fen = insight.fen || "";
        const fenParts = fen.trim().split(/\s+/);
        const side = sideToMoveFromFen(fen);
        const fullMove = fenParts[5];
        sideLabel = `${side === "b" ? "Black" : "White"} to move${fullMove ? `, move ${fullMove}` : ""}`;
      }
    } catch (err) {
      console.error("[og/insight] insight read failed for", id, err);
    }
  }

  const board = parseFenToBoard(fen);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: BG,
          backgroundImage: `radial-gradient(circle at 85% 15%, rgba(249,115,22,0.22) 0%, rgba(249,115,22,0) 55%), radial-gradient(circle at 12% 85%, rgba(56,189,248,0.10) 0%, rgba(56,189,248,0) 50%)`,
          padding: 48,
          color: FG,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: EMBER,
                color: BG,
                fontSize: 24,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              CM
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}
            >
              <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.4 }}>
                Chess Masti
              </span>
              <span style={{ fontSize: 13, color: MUTED, letterSpacing: 1.4 }}>
                COACH INSIGHT
              </span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              padding: "6px 14px",
              borderRadius: 999,
              border: `1px solid ${EDGE}`,
              color: MUTED,
              fontSize: 15,
              backgroundColor: "rgba(255,255,255,0.04)",
            }}
          >
            {sideLabel}
          </div>
        </div>

        {/* Main row: board left, quote right */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            gap: 36,
          }}
        >
          {/* Board column */}
          <div
            style={{
              display: "flex",
              flexShrink: 0,
              width: BOARD_SIZE,
              height: BOARD_SIZE,
              borderRadius: 8,
              overflow: "hidden",
              boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
              border: `1px solid ${EDGE}`,
            }}
          >
            <Board board={board} />
          </div>

          {/* Quote column */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: 14,
                color: EMBER,
                letterSpacing: 2,
                fontWeight: 700,
                marginBottom: 14,
              }}
            >
              COACH SAID —
            </div>
            <div
              style={{
                fontSize: 30,
                lineHeight: 1.3,
                fontWeight: 600,
                letterSpacing: -0.3,
                color: FG,
                // Cap height to keep tall excerpts from overflowing the card.
                maxHeight: 360,
                overflow: "hidden",
                display: "flex",
              }}
            >
              “{coachExcerpt}”
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 20,
            paddingTop: 18,
            borderTop: `1px solid ${EDGE}`,
            color: MUTED,
            fontSize: 16,
          }}
        >
          <span>Open this position in the AI coach →</span>
          <span style={{ color: FG, fontWeight: 600 }}>chessmasti.com</span>
        </div>
      </div>
    ),
    {
      width: CARD_W,
      height: CARD_H,
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    },
  );
}

/**
 * 8×8 board rendered as a column of 8 rows, each row a flex row of
 * 8 squares. Satori demands display:flex on any node with multiple
 * children — that's why every container below is flex.
 */
function Board({ board }: { board: BoardSquare[][] }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
      }}
    >
      {board.map((row, rIdx) => (
        <div
          key={rIdx}
          style={{
            display: "flex",
            flexDirection: "row",
            width: "100%",
            height: CELL,
          }}
        >
          {row.map((square, fIdx) => {
            // Standard chess color rule: a1 is dark. a1 = (rank 0 from
            // bottom, file 0). With our top-left = a8 convention, the
            // top-left is light. Light when (rank + file) is even.
            const isLight = (rIdx + fIdx) % 2 === 0;
            return (
              <div
                key={fIdx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: CELL,
                  height: CELL,
                  backgroundColor: isLight ? LIGHT_SQUARE : DARK_SQUARE,
                  color: square && square === square.toUpperCase()
                    ? WHITE_PIECE
                    : BLACK_PIECE,
                  fontSize: 34,
                  fontWeight: 800,
                  fontFamily: "ui-serif, Georgia, serif",
                  // Drop-shadow gives the pieces a touch of separation
                  // from the squares without needing real piece glyphs.
                  textShadow: square
                    ? square === square.toUpperCase()
                      ? "0 1px 2px rgba(0,0,0,0.45)"
                      : "0 1px 1px rgba(255,255,255,0.35)"
                    : "none",
                }}
              >
                {square ?? ""}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
