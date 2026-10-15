// Public game share page — anyone with the ID can view, no auth required.
// /share/game/[id] is the unfurl-friendly URL. Twitter/Discord/Slack/LinkedIn
// fetch this page server-side for the OG tags, then humans click through to
// the interactive viewer.

import type { GetServerSideProps } from "next";
import { useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Box, Container, Typography, Button, IconButton } from "@mui/material";
import { ChevronLeft, ChevronRight, SkipBack, SkipForward } from "lucide-react";
import { getGameShare } from "@/lib/gameShares";
import {
  Masti,
  MastiAvatar,
  MastiSays,
  resultMood,
  type MastiMood,
} from "@/components/masti";
import type { GameShareRecord } from "@/types/gameShare";
import type { SavedCoachMessage } from "@/types/game";
import {
  ACCENT,
  FONT_MONO,
  LINE,
  MOTION,
  RADIUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

interface ShareGameProps {
  share: GameShareRecord | null;
}

const CARD_SX = {
  background: SURFACE.raised,
  border: `1px solid ${LINE.hairline}`,
  borderRadius: `${RADIUS.card}px`,
} as const;

// Parse the PGN once at module level for the page's render lifetime.
function buildMoveList(pgn: string): { sans: string[]; fens: string[] } {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });
    const sans = history.map((m) => m.san);
    // Replay to build the FEN at each move.
    const replay = new Chess();
    const fens: string[] = [replay.fen()];
    for (const move of history) {
      replay.move({ from: move.from, to: move.to, promotion: move.promotion });
      fens.push(replay.fen());
    }
    return { sans, fens };
  } catch {
    return {
      sans: [],
      fens: ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"],
    };
  }
}

// The share records the result but not which side the reader played, so a
// decisive result is never cheered: it could be the wrong colour. A draw has
// no side and gets its own face; anything else is a hello.
function shareMood(result: string | null): MastiMood {
  const r = (result ?? "").trim();
  return resultMood(r === "1/2-1/2" || r === "½-½" ? "draw" : null);
}

export default function ShareGamePage({ share }: ShareGameProps) {
  // All-hooks-first; conditional rendering after.
  const { sans, fens } = useMemo(
    () => (share ? buildMoveList(share.pgn) : { sans: [], fens: [] }),
    [share]
  );
  const [ply, setPly] = useState<number>(0);
  const fen = fens[ply] ?? fens[0] ?? "";
  const canPrev = ply > 0;
  const canNext = ply < fens.length - 1;

  if (!share) {
    return (
      <Box sx={{ minHeight: "100vh", color: TEXT.primary, py: 8 }}>
        <Container maxWidth="md">
          <Masti
            mood="defeated"
            size={140}
            loops={2}
            decorative
            style={{ marginBottom: 16 }}
          />
          <Typography sx={{ ...TYPE.h2, color: TEXT.primary, mb: 2 }}>
            Game share not found
          </Typography>
          <Typography sx={{ ...TYPE.body, color: TEXT.secondary, mb: 4 }}>
            This share may have been deleted or the link is incorrect.
          </Typography>
          <Button
            component={Link}
            href="/free-ai-chess-coach"
            variant="contained"
          >
            Meet Masti, your chess coach
          </Button>
        </Container>
      </Box>
    );
  }

  const whiteLabel = share.white || "White";
  const blackLabel = share.black || "Black";
  const headerLine = [
    share.event,
    share.date,
    share.timeControl && `(${share.timeControl})`,
  ]
    .filter(Boolean)
    .join(" · ");
  const mood = shareMood(share.result);
  const hasTranscript =
    !!share.coachTranscript && share.coachTranscript.length > 0;
  const mastiLine =
    (mood === "idea" ? "Half a point each. " : "") +
    (hasTranscript
      ? "I went through this one move by move. Step through the game and read my notes as you go."
      : "Step through the game at your own pace. For your own games, I am one PGN away.");

  return (
    <>
      <Head>
        <title>{`${whiteLabel} vs ${blackLabel} · Chess Masti AI`}</title>
        <meta
          name="description"
          content={`Coached chess game review: ${whiteLabel} vs ${blackLabel}${share.result ? `, ${share.result}` : ""}.`}
        />
        <meta
          property="og:title"
          content={`${whiteLabel} vs ${blackLabel} · Coached on Chess Masti AI`}
        />
        <meta
          property="og:description"
          content="A game reviewed move by move with Masti and the engine. Free for everyone."
        />
        <meta property="og:type" content="article" />
        <meta
          property="og:url"
          content={`https://chessmasti.com/share/game/${share.id}`}
        />
        <meta
          property="og:image"
          content={`https://chessmasti.com/api/og/game-share/${share.id}`}
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content={`${whiteLabel} vs ${blackLabel} · Coached on Chess Masti AI`}
        />
        <meta
          name="twitter:description"
          content="A game reviewed move by move with Masti and the engine."
        />
        <meta
          name="twitter:image"
          content={`https://chessmasti.com/api/og/game-share/${share.id}`}
        />
        <link
          rel="canonical"
          href={`https://chessmasti.com/share/game/${share.id}`}
        />
      </Head>

      <Box
        sx={{ minHeight: "100vh", color: TEXT.primary, py: { xs: 3, md: 6 } }}
      >
        <Container maxWidth="lg">
          {/* Header */}
          <Box sx={{ mb: 4, textAlign: "center" }}>
            <Typography
              component="h1"
              sx={{
                ...TYPE.h1,
                fontSize: { xs: "1.75rem", md: TYPE.h1.fontSize },
                color: TEXT.primary,
                mb: 1,
              }}
            >
              {whiteLabel} <span style={{ color: TEXT.secondary }}>vs</span>{" "}
              {blackLabel}
            </Typography>
            {share.result && (
              <Box
                sx={{
                  display: "inline-block",
                  px: 1.5,
                  py: 0.5,
                  borderRadius: `${RADIUS.small}px`,
                  background: SURFACE.raisedSecondary,
                  color: TEXT.primary,
                  fontWeight: 600,
                  fontSize: TYPE.h5.fontSize,
                  fontVariantNumeric: "tabular-nums",
                  mb: 1.5,
                }}
              >
                {share.result}
              </Box>
            )}
            {headerLine && (
              <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary }}>
                {headerLine}
              </Typography>
            )}
            {share.note && (
              <Box
                sx={{
                  ...CARD_SX,
                  mt: 3,
                  mx: "auto",
                  maxWidth: 600,
                  p: 2,
                  color: TEXT.primary,
                  fontStyle: "italic",
                }}
              >
                &ldquo;{share.note}&rdquo;
              </Box>
            )}
            {/* Masti greets above the board, never on it. Still on the
                server, one bounded burst after mount. */}
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                mt: 3,
                textAlign: "left",
              }}
            >
              <MastiSays
                mood={mood}
                size={88}
                priority
                maxWidth={440}
                data-testid="share-game-masti"
              >
                {mastiLine}
              </MastiSays>
            </Box>
          </Box>

          {/* Two-column layout */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "minmax(0, 480px) minmax(0, 1fr)",
              },
              gap: 4,
              alignItems: "flex-start",
            }}
          >
            {/* Board column */}
            <Box>
              <Box
                sx={{
                  borderRadius: `${RADIUS.card}px`,
                  overflow: "hidden",
                  border: `1px solid ${LINE.hairline}`,
                }}
              >
                <Chessboard
                  position={fen}
                  arePiecesDraggable={false}
                  boardWidth={480}
                  customBoardStyle={{ borderRadius: 0 }}
                  customLightSquareStyle={{ backgroundColor: "#E8DCC4" }}
                  customDarkSquareStyle={{ backgroundColor: "#7E8FA3" }}
                />
              </Box>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                  mt: 2,
                }}
              >
                <IconButton
                  onClick={() => setPly(0)}
                  disabled={!canPrev}
                  sx={{ color: TEXT.secondary }}
                  aria-label="Start of game"
                >
                  <SkipBack size={20} strokeWidth={1.75} aria-hidden />
                </IconButton>
                <IconButton
                  onClick={() => setPly((p) => Math.max(0, p - 1))}
                  disabled={!canPrev}
                  sx={{ color: TEXT.secondary }}
                  aria-label="Previous move"
                >
                  <ChevronLeft size={20} strokeWidth={1.75} aria-hidden />
                </IconButton>
                <Typography
                  sx={{
                    color: TEXT.secondary,
                    minWidth: 80,
                    textAlign: "center",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {ply === 0
                    ? "Start"
                    : `Move ${Math.floor((ply + 1) / 2)}${ply % 2 === 1 ? "w" : "b"}`}
                </Typography>
                <IconButton
                  onClick={() =>
                    setPly((p) => Math.min(fens.length - 1, p + 1))
                  }
                  disabled={!canNext}
                  sx={{ color: TEXT.secondary }}
                  aria-label="Next move"
                >
                  <ChevronRight size={20} strokeWidth={1.75} aria-hidden />
                </IconButton>
                <IconButton
                  onClick={() => setPly(fens.length - 1)}
                  disabled={!canNext}
                  sx={{ color: TEXT.secondary }}
                  aria-label="End of game"
                >
                  <SkipForward size={20} strokeWidth={1.75} aria-hidden />
                </IconButton>
              </Box>
            </Box>

            {/* Info column */}
            <Box>
              {/* Moves */}
              <Box
                sx={{
                  ...CARD_SX,
                  p: 3,
                  mb: 3,
                  maxHeight: 320,
                  overflowY: "auto",
                }}
              >
                <Typography sx={{ ...TYPE.h4, color: TEXT.primary, mb: 2 }}>
                  Moves
                </Typography>
                {sans.length === 0 ? (
                  <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary }}>
                    Could not parse the PGN.
                  </Typography>
                ) : (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {sans.map((san, i) => {
                      const moveNumber = Math.floor(i / 2) + 1;
                      const isWhite = i % 2 === 0;
                      const isActive = ply === i + 1;
                      return (
                        <Box
                          key={i}
                          component="button"
                          onClick={() => setPly(i + 1)}
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                            border: "none",
                            background: isActive ? ACCENT.tint : "transparent",
                            borderRadius: `${RADIUS.small}px`,
                            px: 1,
                            py: 0.5,
                            cursor: "pointer",
                            color: isActive ? ACCENT.hover : TEXT.primary,
                            fontWeight: isActive ? 600 : 400,
                            fontFamily: FONT_MONO,
                            fontSize: TYPE.bodySmall.fontSize,
                            touchAction: "manipulation",
                            WebkitTapHighlightColor: "transparent",
                            transition: `background-color ${MOTION.hover}, transform ${MOTION.press}`,
                            "&:hover": { background: "rgba(255,255,255,0.06)" },
                            "&:active": { transform: MOTION.pressScale },
                            "&:focus-visible": {
                              outline: `2px solid ${TEXT.primary}`,
                              outlineOffset: 2,
                            },
                          }}
                        >
                          {isWhite && (
                            <span style={{ color: TEXT.secondary }}>
                              {moveNumber}.
                            </span>
                          )}
                          <span>{san}</span>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Box>

              {/* Coach transcript */}
              {share.coachTranscript && share.coachTranscript.length > 0 && (
                <CoachTranscript transcript={share.coachTranscript} />
              )}
            </Box>
          </Box>

          {/* CTA */}
          <Box
            sx={{
              ...CARD_SX,
              mt: 6,
              p: 4,
              textAlign: "center",
            }}
          >
            <Typography sx={{ ...TYPE.h2, color: TEXT.primary, mb: 1 }}>
              Want this for your own games?
            </Typography>
            <Typography
              sx={{
                ...TYPE.body,
                color: TEXT.secondary,
                mb: 3,
                maxWidth: "65ch",
                mx: "auto",
              }}
            >
              Paste a PGN. Masti explains every critical move and turns your
              mistakes into puzzles. Free for everyone.
            </Typography>
            <Box
              sx={{
                display: "flex",
                gap: 2,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <Button
                component={Link}
                href="/analysis"
                variant="contained"
                size="large"
              >
                Try Masti for free
              </Button>
              <Button
                component={Link}
                href="/how-it-works"
                variant="outlined"
                size="large"
              >
                See how Masti works
              </Button>
            </Box>
          </Box>
        </Container>
      </Box>
    </>
  );
}

function CoachTranscript({ transcript }: { transcript: SavedCoachMessage[] }) {
  return (
    <Box sx={{ ...CARD_SX, p: 3 }}>
      <Typography sx={{ ...TYPE.h4, color: TEXT.primary, mb: 2 }}>
        Coach transcript
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {transcript.map((msg, i) => (
          <Box
            key={i}
            sx={{
              p: 1.5,
              borderRadius: `${RADIUS.control}px`,
              background: SURFACE.raisedSecondary,
              border: `1px solid ${LINE.hairline}`,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                mb: 0.75,
              }}
            >
              {msg.role !== "user" && (
                <MastiAvatar mood="idea" size={18} ring={false} />
              )}
              <Typography
                sx={{
                  ...TYPE.label,
                  color: msg.role === "user" ? TEXT.secondary : TEXT.primary,
                }}
              >
                {msg.role === "user" ? "You" : "Masti"}
              </Typography>
            </Box>
            <Typography
              sx={{
                ...TYPE.bodySmall,
                color: TEXT.primary,
                whiteSpace: "pre-wrap",
              }}
            >
              {msg.content}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export const getServerSideProps: GetServerSideProps<ShareGameProps> = async (
  ctx
) => {
  const rawId = ctx.params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || typeof id !== "string" || id.length > 64) {
    return { props: { share: null } };
  }
  try {
    const share = await getGameShare(id);
    return { props: { share } };
  } catch (err) {
    console.error("[share/game] getServerSideProps", err);
    return { props: { share: null } };
  }
};
