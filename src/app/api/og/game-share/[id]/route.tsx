import { ImageResponse } from "next/og";
import { Chess } from "chess.js";
import { getGameShare } from "@/lib/gameShares";
import {
  parseFenToBoard,
  sideToMoveFromFen,
  type BoardSquare,
} from "@/lib/og/parseFen";

export const runtime = "nodejs";

// 1200×630 is the canonical Twitter / OG card aspect.
const CARD_W = 1200;
const CARD_H = 630;
const BOARD_SIZE = 480;
const CELL = BOARD_SIZE / 8; // 60

const BG = "#0B0F19";
const FG = "#F1F5F9";
const MUTED = "#94A3B8";
const EMBER = "#F97316";
const EDGE = "rgba(255,255,255,0.08)";
const LIGHT_SQUARE = "#E8DCC4";
const DARK_SQUARE = "#7E8FA3";
const WHITE_PIECE = "#FFFFFF";
const BLACK_PIECE = "#1A1A1A";

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * Server-rendered OG image for a shared game. The board shows the final
 * position from the PGN; the header shows White vs Black + result.
 *
 * Pattern mirrors src/app/api/og/insight/[id]/route.tsx — same visual
 * language, same Latin piece-letter board rendering trick to avoid
 * shipping chess glyph fonts to Satori.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let fen = STARTING_FEN;
  let whiteLabel = "White";
  let blackLabel = "Black";
  let resultLabel = "";
  let dateLabel = "";
  let moveCountLabel = "";

  if (id && typeof id === "string" && id.length <= 64) {
    try {
      const share = await getGameShare(id);
      if (share) {
        whiteLabel = share.white || "White";
        blackLabel = share.black || "Black";
        resultLabel = share.result || "";
        dateLabel = share.date || "";
        // Parse PGN to extract the final FEN. chess.js loadPgn returns void
        // and throws on invalid PGN; wrap defensively.
        try {
          const chess = new Chess();
          chess.loadPgn(share.pgn);
          fen = chess.fen();
          const moveCount = Math.floor(chess.history().length / 2);
          if (moveCount > 0) {
            moveCountLabel = `${moveCount} moves`;
          }
        } catch (err) {
          console.error("[og/game-share] PGN parse failed for", id, err);
          // Leave fen at STARTING_FEN
        }
      }
    } catch (err) {
      console.error("[og/game-share] share read failed for", id, err);
    }
  }

  const board = parseFenToBoard(fen);
  const side = sideToMoveFromFen(fen);

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
                COACHED GAME
              </span>
            </div>
          </div>
          {(dateLabel || moveCountLabel) && (
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
              {[dateLabel, moveCountLabel].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>

        {/* Main row: board left, info right */}
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

          {/* Info column */}
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
              GAME REVIEW
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: 32,
                lineHeight: 1.3,
                fontWeight: 700,
                letterSpacing: -0.3,
                color: FG,
              }}
            >
              <span>{whiteLabel}</span>
              <span style={{ color: MUTED, fontSize: 22, fontWeight: 500, margin: "4px 0" }}>vs</span>
              <span>{blackLabel}</span>
            </div>
            {resultLabel && (
              <div
                style={{
                  display: "flex",
                  marginTop: 16,
                  padding: "8px 16px",
                  borderRadius: 8,
                  background: `${EMBER}22`,
                  border: `1px solid ${EMBER}44`,
                  color: EMBER,
                  fontSize: 24,
                  fontWeight: 700,
                  alignSelf: "flex-start",
                }}
              >
                {resultLabel}
              </div>
            )}
            <div
              style={{
                marginTop: 18,
                color: MUTED,
                fontSize: 16,
              }}
            >
              {side === "b" ? "Black" : "White"} to move (final position)
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
          <span>Try the free AI chess coach →</span>
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
                  color:
                    square && square === square.toUpperCase()
                      ? WHITE_PIECE
                      : BLACK_PIECE,
                  fontSize: 34,
                  fontWeight: 800,
                  fontFamily: "ui-serif, Georgia, serif",
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
