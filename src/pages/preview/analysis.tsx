"use client";

import {
  Box,
  Divider,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeft, Flame, Sparkles, Wand2, Zap } from "lucide-react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";

import { useChessActions } from "@/hooks/useChessActions";
import Board from "@/sections/analysis/board";
import PanelToolBar from "@/sections/analysis/panelToolbar";
import TopBar from "@/sections/analysis/panelToolbar/topBar";
import UnifiedSections from "@/sections/analysis/panelBody/unifiedSections";
import CoachTab from "@/sections/analysis/panelBody/coachTab";
import {
  autoAnalyzeStateAtom,
  boardAtom,
  boardOrientationAtom,
  evaluationProgressAtom,
  gameAtom,
  gameEvalAtom,
  panelExpandedAtom,
  preloadedInsightAtom,
} from "@/sections/analysis/states";
import EngineSettingsButton from "@/sections/engineSettings/engineSettingsButton";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BorderBeam } from "@/components/ui/BorderBeam";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { RevealOnScroll } from "@/components/ui/RevealOnScroll";

// Orange-and-black analysis theme. Pure orange family, no purple/blue accents.
const analysisTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#F97316" },
    secondary: { main: "#FB923C" },
    background: {
      default: "#08090C",
      paper: "rgba(20,22,28,0.65)",
    },
    text: {
      primary: "rgba(255,255,255,0.94)",
      secondary: "rgba(255,255,255,0.62)",
    },
    divider: "rgba(255,255,255,0.08)",
    success: { main: "#22c55e" },
    error: { main: "#ef4444" },
    warning: { main: "#EA580C" },
  },
  typography: {
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    h1: { fontWeight: 800, letterSpacing: "-0.03em" },
    h2: { fontWeight: 700, letterSpacing: "-0.02em" },
    h3: { fontWeight: 700, letterSpacing: "-0.015em" },
    overline: {
      letterSpacing: "0.16em",
      fontWeight: 700,
      fontSize: "0.7rem",
    },
    button: {
      textTransform: "none",
      fontWeight: 600,
      letterSpacing: "0.005em",
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "rgba(20,22,28,0.55)",
          backdropFilter: "blur(10px) saturate(140%)",
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: "rgba(255,255,255,0.08)" },
      },
    },
  },
});

function NavPill() {
  return (
    <Box
      component="header"
      sx={{
        position: "sticky",
        top: 16,
        zIndex: 50,
        mx: "auto",
        maxWidth: 1600,
        px: { xs: 2, md: 3 },
        py: 1.25,
        mb: 3,
        borderRadius: "999px",
        background: "rgba(12,14,20,0.6)",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "center",
        gap: 2,
      }}
    >
      <Box
        component={Link}
        href="/preview/launch"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          fontWeight: 800,
          color: "rgba(255,255,255,0.94)",
          letterSpacing: "-0.02em",
          textDecoration: "none",
        }}
      >
        <Box
          sx={{
            width: 26,
            height: 26,
            borderRadius: "8px",
            background:
              "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 16px rgba(249,115,22,0.4)",
          }}
        >
          <Sparkles size={14} color="#0A0A0A" />
        </Box>
        Chess Masti
      </Box>

      <Box sx={{ flex: 1 }} />

      <Stack
        direction="row"
        spacing={3}
        sx={{ display: { xs: "none", md: "flex" } }}
      >
        {[
          { label: "Play", href: "/play" },
          { label: "Practice", href: "/practice" },
          { label: "Scout", href: "/scout" },
        ].map((item) => (
          <Typography
            key={item.label}
            component={Link}
            href={item.href}
            sx={{
              fontSize: "0.88rem",
              fontWeight: 500,
              color: "rgba(255,255,255,0.7)",
              textDecoration: "none",
              transition: "color 180ms ease",
              "&:hover": { color: "rgba(255,255,255,1)" },
            }}
          >
            {item.label}
          </Typography>
        ))}
      </Stack>

      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.75,
          px: 1.5,
          py: 0.5,
          borderRadius: "999px",
          background: "rgba(249,115,22,0.12)",
          border: "1px solid rgba(249,115,22,0.3)",
        }}
      >
        <Zap size={12} color="#F97316" />
        <Typography
          sx={{
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            color: "#FB923C",
            textTransform: "uppercase",
          }}
        >
          Analysis
        </Typography>
      </Box>
    </Box>
  );
}

function StatusStrip() {
  const gameEval = useAtomValue(gameEvalAtom);
  const game = useAtomValue(gameAtom);
  const board = useAtomValue(boardAtom);
  const progress = useAtomValue(evaluationProgressAtom);

  const moveCount = game.history().length;
  const currentPlyIndex = board.history().length;
  const hasGame = moveCount > 0;
  const isAnalyzing = progress > 0 && progress < 100;
  const isDone = gameEval !== undefined && !isAnalyzing;

  const headers = game.header();
  const whiteName = headers.White || "White";
  const blackName = headers.Black || "Black";
  const opening = headers.Opening || headers.ECO;

  return (
    <Box
      sx={{
        mb: 3,
        px: { xs: 3, md: 4 },
        py: 2,
        borderRadius: "1.25rem",
        background:
          "linear-gradient(135deg, rgba(249,115,22,0.06), rgba(20,22,28,0.55))",
        backdropFilter: "blur(14px) saturate(150%)",
        WebkitBackdropFilter: "blur(14px) saturate(150%)",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        gap: 2,
        alignItems: { md: "center" },
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: "10px",
            background:
              "linear-gradient(135deg, rgba(249,115,22,0.18), rgba(234,88,12,0.18))",
            border: "1px solid rgba(249,115,22,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isAnalyzing ? (
            <Wand2 size={18} color="#F97316" />
          ) : isDone ? (
            <Flame size={18} color="#F97316" />
          ) : (
            <Sparkles size={18} color="#F97316" />
          )}
        </Box>
        <Box>
          <Typography
            sx={{
              fontSize: "0.7rem",
              fontWeight: 700,
              letterSpacing: "0.16em",
              color: "rgba(255,255,255,0.5)",
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            {!hasGame
              ? "Ready"
              : isAnalyzing
              ? "Analyzing"
              : isDone
              ? "Analyzed"
              : "Loaded"}
          </Typography>
          <Typography
            sx={{
              fontSize: "0.98rem",
              fontWeight: 600,
              color: "rgba(255,255,255,0.94)",
              lineHeight: 1.3,
              mt: 0.5,
            }}
          >
            {!hasGame ? (
              "Drop a PGN, paste a Lichess link, or set up a position."
            ) : (
              <>
                {whiteName}{" "}
                <Box
                  component="span"
                  sx={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}
                >
                  vs
                </Box>{" "}
                {blackName}
                {opening && (
                  <Box
                    component="span"
                    sx={{
                      color: "rgba(255,255,255,0.5)",
                      fontWeight: 400,
                      ml: 1.5,
                      fontSize: "0.88rem",
                    }}
                  >
                    · {opening}
                  </Box>
                )}
              </>
            )}
          </Typography>
        </Box>
      </Stack>

      <Box sx={{ flex: 1 }} />

      <Stack
        direction="row"
        spacing={2.5}
        alignItems="center"
        sx={{ flexWrap: "wrap" }}
      >
        {hasGame && (
          <Stack direction="row" spacing={0.5} alignItems="baseline">
            <Typography
              sx={{
                fontSize: "1.4rem",
                fontWeight: 800,
                color: "rgba(255,255,255,0.96)",
                lineHeight: 1,
                fontFamily: "Monaco, Menlo, monospace",
              }}
            >
              {currentPlyIndex}
            </Typography>
            <Typography
              sx={{
                fontSize: "0.85rem",
                color: "rgba(255,255,255,0.4)",
              }}
            >
              / {moveCount} plies
            </Typography>
          </Stack>
        )}

        {isAnalyzing && (
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{
              px: 1.5,
              py: 0.75,
              borderRadius: "999px",
              background: "rgba(249,115,22,0.1)",
              border: "1px solid rgba(249,115,22,0.25)",
            }}
          >
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#F97316",
                boxShadow: "0 0 8px rgba(249,115,22,0.7)",
                animation: "pulse 1.4s ease-in-out infinite",
                "@keyframes pulse": {
                  "0%, 100%": { opacity: 0.4 },
                  "50%": { opacity: 1 },
                },
              }}
            />
            <Typography
              sx={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "#FB923C",
                fontFamily: "Monaco, Menlo, monospace",
              }}
            >
              Stockfish 17 · {Math.round(progress)}%
            </Typography>
          </Stack>
        )}

        {isDone && (
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{
              px: 1.5,
              py: 0.75,
              borderRadius: "999px",
              background: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.25)",
            }}
          >
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#22c55e",
                boxShadow: "0 0 8px rgba(34,197,94,0.7)",
              }}
            />
            <Typography
              sx={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "#86efac",
                fontFamily: "Monaco, Menlo, monospace",
              }}
            >
              Engine-grounded
            </Typography>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

function BoardFrame() {
  return (
    <Box
      sx={{
        position: "relative",
        borderRadius: "1.5rem",
        background:
          "linear-gradient(135deg, rgba(249,115,22,0.05), rgba(20,22,28,0.45))",
        backdropFilter: "blur(12px) saturate(140%)",
        WebkitBackdropFilter: "blur(12px) saturate(140%)",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow:
          "0 16px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)",
        p: { xs: 1.5, md: 2 },
        overflow: "visible",
      }}
    >
      <ErrorBoundary name="chessboard">
        <Board />
      </ErrorBoundary>
    </Box>
  );
}

function PanelFrame({
  panelExpanded,
  boardRight,
  isLgOrGreater,
}: {
  panelExpanded: boolean;
  boardRight: number;
  isLgOrGreater: boolean;
}) {
  return (
    <Box
      sx={{
        position: "relative",
        borderRadius: "1.5rem",
        background: "rgba(20,22,28,0.6)",
        backdropFilter: "blur(14px) saturate(150%)",
        WebkitBackdropFilter: "blur(14px) saturate(150%)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow:
          "0 16px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
        height: {
          xs: "auto",
          lg: panelExpanded ? "calc(100vh - 32px)" : "calc(88vh - 60px)",
        },
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        flex: 1,
        minWidth: { lg: "420px" },
        width: "100%",
        ...(panelExpanded && {
          position: "fixed",
          top: 16,
          right: 16,
          bottom: 16,
          left: { xs: 16, lg: `${boardRight + 16}px` },
          width: "auto",
          zIndex: 1300,
        }),
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <BorderBeam duration={18} colorFrom="#F97316" colorTo="#FB923C" />

      <Box sx={{ px: 1, pt: 1, flexShrink: 0, position: "relative", zIndex: 1 }}>
        <TopBar />
      </Box>

      <Divider sx={{ mx: 1, flexShrink: 0 }} />

      <Box
        sx={{
          width: "100%",
          maxHeight: isLgOrGreater ? "45%" : "none",
          overflowY: "auto",
          scrollbarWidth: "thin",
          flexShrink: 0,
          position: "relative",
          zIndex: 1,
          "&::-webkit-scrollbar": { width: "8px" },
          "&::-webkit-scrollbar-thumb": {
            background: "rgba(249,115,22,0.2)",
            borderRadius: "4px",
          },
          "&::-webkit-scrollbar-thumb:hover": {
            background: "rgba(249,115,22,0.35)",
          },
        }}
      >
        <ErrorBoundary name="unified-sections">
          <UnifiedSections />
        </ErrorBoundary>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: { xs: "32rem", lg: 0 },
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <ErrorBoundary name="ai-coach-tab">
          <CoachTab
            role="tabpanel"
            id="tabContent-coach"
            sx={{ height: "100%", width: "100%" }}
          />
        </ErrorBoundary>
      </Box>

      <Box
        sx={{
          width: "100%",
          flexShrink: 0,
          position: "relative",
          zIndex: 1,
        }}
      >
        <Divider sx={{ mx: 1, mb: 0.5 }} />
        <PanelToolBar key="analysis-preview-toolbar" />
      </Box>
    </Box>
  );
}

function FooterStrip() {
  return (
    <Box
      component="footer"
      sx={{
        mt: 5,
        py: 3,
        borderTop: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        gap: 1.5,
        alignItems: "center",
        justifyContent: "space-between",
        color: "rgba(255,255,255,0.4)",
        fontSize: "0.78rem",
      }}
    >
      <Stack direction="row" spacing={2.5} alignItems="center">
        <Box
          component={Link}
          href="/preview/launch"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            color: "rgba(255,255,255,0.6)",
            textDecoration: "none",
            transition: "color 180ms ease",
            "&:hover": { color: "rgba(255,255,255,0.9)" },
          }}
        >
          <ArrowLeft size={14} />
          Back to launch
        </Box>
        <Box>·</Box>
        <Box>Engine-grounded coaching</Box>
      </Stack>
      <Stack direction="row" spacing={2.5} alignItems="center">
        <Box>Powered by</Box>
        <Box sx={{ color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>
          Claude
        </Box>
        <Box>×</Box>
        <Box sx={{ color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>
          Stockfish 17
        </Box>
      </Stack>
    </Box>
  );
}

export default function PreviewAnalysisPage() {
  const theme = useTheme();
  const isLgOrGreater = useMediaQuery(theme.breakpoints.up("lg"));
  const [panelExpanded, setPanelExpanded] = useAtom(panelExpandedAtom);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [boardRight, setBoardRight] = useState(0);

  const updateBoardRight = useCallback(() => {
    if (boardContainerRef.current) {
      const rect = boardContainerRef.current.getBoundingClientRect();
      setBoardRight(rect.right);
    }
  }, []);

  useEffect(() => {
    updateBoardRight();
    window.addEventListener("resize", updateBoardRight);
    return () => window.removeEventListener("resize", updateBoardRight);
  }, [updateBoardRight]);

  const { reset: resetBoard, setPgn: setBoardPgn } = useChessActions(boardAtom);
  const { reset: resetGame, setPgn: setGamePgn } = useChessActions(gameAtom);
  const [gameEval, setGameEval] = useAtom(gameEvalAtom);
  const setBoardOrientation = useSetAtom(boardOrientationAtom);
  const setPreloadedInsight = useSetAtom(preloadedInsightAtom);
  const setAutoAnalyzeState = useSetAtom(autoAnalyzeStateAtom);

  const router = useRouter();
  const { gameId, fen, lichessReview, pgn, insightId, autoAnalyze } =
    router.query;

  // Deep-link handling — same logic as /analysis so the preview can be tested
  // with real share URLs / extension flows without breaking them.
  const autoAnalyzeFiredRef = useRef(false);
  useEffect(() => {
    if (autoAnalyze !== "1") return;
    if (autoAnalyzeFiredRef.current) return;
    autoAnalyzeFiredRef.current = true;
    setAutoAnalyzeState("pending");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAnalyze]);

  useEffect(() => {
    return () => {
      setAutoAnalyzeState("idle");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lichessReview !== "1") return;
    const reviewPgn = localStorage.getItem("lichess-review-pgn");
    if (!reviewPgn) return;
    localStorage.removeItem("lichess-review-pgn");
    setGamePgn(reviewPgn);
    setBoardPgn(reviewPgn);
    setGameEval(undefined);
    setBoardOrientation(true);
    router.replace("/preview/analysis", undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lichessReview]);

  const pgnLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof pgn !== "string" || !pgn.trim()) return;
    if (pgnLoadedRef.current === pgn) return;
    pgnLoadedRef.current = pgn;
    try {
      const decoded = decodeURIComponent(pgn);
      setGamePgn(decoded);
      setBoardPgn(decoded);
      setGameEval(undefined);
      setBoardOrientation(true);
    } catch {
      // Malformed URI escape — leave board untouched.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pgn]);

  const insightLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof insightId !== "string" || !insightId.trim()) return;
    if (insightLoadedRef.current === insightId) return;
    insightLoadedRef.current = insightId;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/insights/${encodeURIComponent(insightId)}`
        );
        if (!res.ok) return;
        const insight = await res.json();
        if (cancelled) return;
        if (typeof insight.fen === "string" && insight.fen.trim()) {
          resetBoard({ fen: insight.fen });
          resetGame({ fen: insight.fen, noHeaders: true });
          setGameEval(undefined);
          setBoardOrientation(!insight.fen.includes(" b "));
        }
        if (
          typeof insight.coachContent === "string" &&
          insight.coachContent.trim()
        ) {
          const kind =
            insight.kind === "transcript" ? "transcript" : "single";
          setPreloadedInsight({
            fen: insight.fen,
            coachContent: insight.coachContent,
            createdAt: insight.createdAt ?? Date.now(),
            kind,
            transcript:
              kind === "transcript" && Array.isArray(insight.transcript)
                ? insight.transcript
                : null,
          });
        }
      } catch (err) {
        console.error("Failed to load insight permalink:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insightId]);

  useEffect(() => {
    return () => {
      setPreloadedInsight(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lichessReview === "1") return;
    if (typeof pgn === "string" && pgn.trim()) return;
    if (typeof insightId === "string" && insightId.trim()) return;
    if (typeof fen === "string" && fen.trim()) {
      const decodedFen = decodeURIComponent(fen);
      resetBoard({ fen: decodedFen });
      resetGame({ fen: decodedFen, noHeaders: true });
      setGameEval(undefined);
      const isBlackToMove = decodedFen.includes(" b ");
      setBoardOrientation(!isBlackToMove);
    } else if (!gameId) {
      resetBoard();
      setGameEval(undefined);
      setBoardOrientation(true);
      resetGame({ noHeaders: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, fen, lichessReview, pgn, insightId]);

  return (
    <ThemeProvider theme={analysisTheme}>
      <Head>
        <title>Chess Masti — Analyze your game</title>
        <meta
          name="description"
          content="Stockfish 17 evaluates, Claude explains, a validator checks every claim. Engine-grounded chess coaching, free."
        />
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#08090C" />
        <style>{`
          html, body { background-color: #08090C; color-scheme: dark; margin: 0; }
          ::-webkit-scrollbar { width: 10px; height: 10px; }
          ::-webkit-scrollbar-track { background: #08090C; }
          ::-webkit-scrollbar-thumb { background: rgba(249,115,22,0.18); border-radius: 5px; }
          ::-webkit-scrollbar-thumb:hover { background: rgba(249,115,22,0.32); }
        `}</style>
      </Head>

      <GradientBackdrop />

      <Box
        sx={{
          minHeight: "100vh",
          width: "100%",
          color: "rgba(255,255,255,0.94)",
          pt: 2,
          pb: 4,
          px: { xs: 2, md: 3 },
        }}
      >
        <NavPill />

        <Box sx={{ maxWidth: 1600, mx: "auto" }}>
          <RevealOnScroll>
            <StatusStrip />
          </RevealOnScroll>

          {/* Backdrop when panel is expanded */}
          {panelExpanded && (
            <Box
              onClick={() => setPanelExpanded(false)}
              sx={{
                position: "fixed",
                inset: 0,
                background:
                  "radial-gradient(ellipse at center, rgba(0,0,0,0.65), rgba(0,0,0,0.85))",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                zIndex: 1200,
                transition: "opacity 0.3s ease",
              }}
            />
          )}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", lg: "minmax(420px, 1fr) 1.1fr" },
              gap: { xs: 3, lg: 2.5 },
              alignItems: "start",
            }}
          >
            <Box
              ref={boardContainerRef}
              sx={{ minWidth: { lg: "400px" } }}
            >
              <RevealOnScroll delay={0.05}>
                <BoardFrame />
              </RevealOnScroll>
            </Box>

            <RevealOnScroll delay={0.1} style={{ height: "100%" }}>
              <PanelFrame
                panelExpanded={panelExpanded}
                boardRight={boardRight}
                isLgOrGreater={isLgOrGreater}
              />
            </RevealOnScroll>
          </Box>

          <FooterStrip />
        </Box>

        <EngineSettingsButton />
      </Box>
    </ThemeProvider>
  );
}
