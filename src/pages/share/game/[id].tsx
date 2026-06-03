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
import { Icon } from "@iconify/react";
import { getGameShare } from "@/lib/gameShares";
import type { GameShareRecord } from "@/types/gameShare";
import type { SavedCoachMessage } from "@/types/game";

interface ShareGameProps {
  share: GameShareRecord | null;
}

const BG = "#08080f";
const SURFACE = "rgba(255,255,255,0.04)";
const BORDER = "rgba(255,255,255,0.08)";
const EMBER = "#FF6B2B";

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
    return { sans: [], fens: ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"] };
  }
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
  const canNext = ply < (fens.length - 1);

  if (!share) {
    return (
      <Box sx={{ background: BG, minHeight: "100vh", color: "#fff", py: 8 }}>
        <Container maxWidth="md">
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>
            Game share not found
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.6)", mb: 4 }}>
            This share may have been deleted or the link is incorrect.
          </Typography>
          <Button
            component={Link}
            href="/free-ai-chess-coach"
            variant="contained"
            sx={{ background: EMBER, "&:hover": { background: "#ff8050" } }}
          >
            Try the free AI chess coach
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

  return (
    <>
      <Head>
        <title>{`${whiteLabel} vs ${blackLabel} — Chess Masti AI`}</title>
        <meta name="description" content={`Coached chess game review: ${whiteLabel} vs ${blackLabel}${share.result ? `, ${share.result}` : ""}.`} />
        <meta property="og:title" content={`${whiteLabel} vs ${blackLabel} — Coached on Chess Masti AI`} />
        <meta property="og:description" content={`Game review with engine analysis and AI coaching. Try the free AI chess coach.`} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={`https://chessmasti.com/share/game/${share.id}`} />
        <meta property="og:image" content={`https://chessmasti.com/api/og/game-share/${share.id}`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${whiteLabel} vs ${blackLabel} — Coached on Chess Masti AI`} />
        <meta name="twitter:description" content={`Game review with engine analysis and AI coaching.`} />
        <meta name="twitter:image" content={`https://chessmasti.com/api/og/game-share/${share.id}`} />
        <link rel="canonical" href={`https://chessmasti.com/share/game/${share.id}`} />
      </Head>

      <Box sx={{ background: BG, minHeight: "100vh", color: "rgba(255,255,255,0.85)", py: { xs: 3, md: 6 } }}>
        <Container maxWidth="lg">
          {/* Header */}
          <Box sx={{ mb: 4, textAlign: "center" }}>
            <Typography
              component="h1"
              sx={{
                fontSize: { xs: "1.5rem", md: "2.25rem" },
                fontWeight: 800,
                color: "#fff",
                mb: 1,
              }}
            >
              {whiteLabel} <span style={{ color: "rgba(255,255,255,0.4)" }}>vs</span> {blackLabel}
            </Typography>
            {share.result && (
              <Box
                sx={{
                  display: "inline-block",
                  px: 2,
                  py: 0.5,
                  borderRadius: 1,
                  background: `${EMBER}22`,
                  border: `1px solid ${EMBER}44`,
                  color: EMBER,
                  fontWeight: 700,
                  fontSize: "1.1rem",
                  mb: 1.5,
                }}
              >
                {share.result}
              </Box>
            )}
            {headerLine && (
              <Typography sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.9rem" }}>
                {headerLine}
              </Typography>
            )}
            {share.note && (
              <Box
                sx={{
                  mt: 3,
                  mx: "auto",
                  maxWidth: 600,
                  background: SURFACE,
                  border: `1px solid ${BORDER}`,
                  borderRadius: "1rem",
                  p: 2,
                  color: "rgba(255,255,255,0.75)",
                  fontStyle: "italic",
                }}
              >
                &ldquo;{share.note}&rdquo;
              </Box>
            )}
          </Box>

          {/* Two-column layout */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "minmax(0, 480px) minmax(0, 1fr)" },
              gap: 4,
              alignItems: "flex-start",
            }}
          >
            {/* Board column */}
            <Box>
              <Box
                sx={{
                  borderRadius: "1rem",
                  overflow: "hidden",
                  border: `1px solid ${BORDER}`,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
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
                  sx={{ color: "rgba(255,255,255,0.7)" }}
                  aria-label="Start of game"
                >
                  <Icon icon="mdi:skip-previous" width={20} />
                </IconButton>
                <IconButton
                  onClick={() => setPly((p) => Math.max(0, p - 1))}
                  disabled={!canPrev}
                  sx={{ color: "rgba(255,255,255,0.7)" }}
                  aria-label="Previous move"
                >
                  <Icon icon="mdi:chevron-left" width={20} />
                </IconButton>
                <Typography sx={{ color: "rgba(255,255,255,0.6)", minWidth: 80, textAlign: "center" }}>
                  {ply === 0 ? "Start" : `Move ${Math.floor((ply + 1) / 2)}${ply % 2 === 1 ? "w" : "b"}`}
                </Typography>
                <IconButton
                  onClick={() => setPly((p) => Math.min(fens.length - 1, p + 1))}
                  disabled={!canNext}
                  sx={{ color: "rgba(255,255,255,0.7)" }}
                  aria-label="Next move"
                >
                  <Icon icon="mdi:chevron-right" width={20} />
                </IconButton>
                <IconButton
                  onClick={() => setPly(fens.length - 1)}
                  disabled={!canNext}
                  sx={{ color: "rgba(255,255,255,0.7)" }}
                  aria-label="End of game"
                >
                  <Icon icon="mdi:skip-next" width={20} />
                </IconButton>
              </Box>
            </Box>

            {/* Info column */}
            <Box>
              {/* Moves */}
              <Box
                sx={{
                  background: SURFACE,
                  border: `1px solid ${BORDER}`,
                  borderRadius: "1rem",
                  p: 3,
                  mb: 3,
                  maxHeight: 320,
                  overflowY: "auto",
                }}
              >
                <Typography sx={{ fontWeight: 700, color: "#fff", mb: 2, fontSize: "0.95rem" }}>
                  Moves
                </Typography>
                {sans.length === 0 ? (
                  <Typography sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem" }}>
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
                            background: isActive ? `${EMBER}22` : "transparent",
                            borderRadius: 1,
                            px: 1,
                            py: 0.5,
                            cursor: "pointer",
                            color: isActive ? EMBER : "rgba(255,255,255,0.8)",
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                            fontSize: "0.85rem",
                            "&:hover": { background: `${EMBER}11` },
                          }}
                        >
                          {isWhite && (
                            <span style={{ color: "rgba(255,255,255,0.4)" }}>{moveNumber}.</span>
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
              mt: 6,
              background: SURFACE,
              border: `1px solid ${EMBER}33`,
              borderRadius: "1rem",
              p: 4,
              textAlign: "center",
            }}
          >
            <Typography sx={{ fontWeight: 700, color: "#fff", fontSize: "1.5rem", mb: 1 }}>
              Want this for your own games?
            </Typography>
            <Typography sx={{ color: "rgba(255,255,255,0.65)", mb: 3 }}>
              Paste a PGN. The free AI chess coach explains every critical move and turns your
              mistakes into puzzles.
            </Typography>
            <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
              <Button
                component={Link}
                href="/analysis"
                variant="contained"
                sx={{
                  background: EMBER,
                  fontWeight: 700,
                  px: 3,
                  py: 1.25,
                  textTransform: "none",
                  fontSize: "1rem",
                  "&:hover": { background: "#ff8050" },
                }}
              >
                Try the free coach
              </Button>
              <Button
                component={Link}
                href="/free-ai-chess-coach"
                variant="outlined"
                sx={{
                  borderColor: BORDER,
                  color: "rgba(255,255,255,0.75)",
                  fontWeight: 600,
                  px: 3,
                  py: 1.25,
                  textTransform: "none",
                  fontSize: "1rem",
                  "&:hover": { borderColor: "rgba(255,255,255,0.25)", color: "#fff" },
                }}
              >
                Learn more
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
    <Box
      sx={{
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        borderRadius: "1rem",
        p: 3,
      }}
    >
      <Typography sx={{ fontWeight: 700, color: "#fff", mb: 2, fontSize: "0.95rem" }}>
        Coach transcript
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {transcript.map((msg, i) => (
          <Box
            key={i}
            sx={{
              p: 1.5,
              borderRadius: 1,
              background: msg.role === "user" ? "rgba(255,255,255,0.03)" : `${EMBER}11`,
              border: `1px solid ${msg.role === "user" ? BORDER : `${EMBER}22`}`,
            }}
          >
            <Typography
              sx={{
                fontSize: "0.7rem",
                fontWeight: 700,
                letterSpacing: 1.2,
                color: msg.role === "user" ? "rgba(255,255,255,0.5)" : EMBER,
                textTransform: "uppercase",
                mb: 0.75,
              }}
            >
              {msg.role === "user" ? "You" : "Coach"}
            </Typography>
            <Typography
              sx={{
                color: "rgba(255,255,255,0.8)",
                fontSize: "0.9rem",
                lineHeight: 1.7,
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

export const getServerSideProps: GetServerSideProps<ShareGameProps> = async (ctx) => {
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
