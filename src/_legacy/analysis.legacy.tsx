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
  gameAtom,
  gameEvalAtom,
  panelExpandedAtom,
  preloadedInsightAtom,
} from "@/sections/analysis/states";
import { Box, Divider, Grid, useMediaQuery, useTheme } from "@mui/material";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import EngineSettingsButton from "@/sections/engineSettings/engineSettingsButton";

import { PageTitle } from "@/components/pageTitle";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function GameAnalysis() {
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
  const { gameId, fen, lichessReview, pgn, insightId, autoAnalyze } = router.query;

  // ── autoAnalyze=1 trigger ───────────────────────────────────────────────
  // When the Chess Masti browser extension opens chessmasti.com, it appends
  // ?autoAnalyze=1 alongside ?pgn=. We set the state machine to 'pending'
  // so AICoachChat knows to auto-send "analyze my game" once Stockfish
  // finishes analyzing the loaded PGN, and to lock the chat input until
  // the coach's first reply contains [INSIGHT:...] tags. The Stockfish
  // analysis itself starts automatically — see analyzeButton.tsx — so we
  // don't need to trigger it here.
  const autoAnalyzeFiredRef = useRef(false);
  useEffect(() => {
    if (autoAnalyze !== '1') return;
    if (autoAnalyzeFiredRef.current) return;
    autoAnalyzeFiredRef.current = true;
    setAutoAnalyzeState('pending');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAnalyze]);

  // Reset on unmount so a later visit without the flag starts fresh.
  useEffect(() => {
    return () => {
      setAutoAnalyzeState('idle');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pick up a Lichess game PGN stored by the "Analyze with Coach" button.
  useEffect(() => {
    if (lichessReview !== '1') return;
    const reviewPgn = localStorage.getItem('lichess-review-pgn');
    if (!reviewPgn) return;
    localStorage.removeItem('lichess-review-pgn');
    // Load PGN into BOTH atoms — mirrors what the "Load PGN" button in
    // loadGame.tsx does. setGamePgn alone leaves the board cursor at the
    // starting position; setBoardPgn navigates it to the end of the PGN
    // so the user lands on the latest position.
    setGamePgn(reviewPgn);
    setBoardPgn(reviewPgn);
    setGameEval(undefined);
    setBoardOrientation(true);
    // Remove the query param so refreshing doesn't re-trigger.
    router.replace('/analysis', undefined, { shallow: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lichessReview]);

  // Load a PGN from a query param — used by the Chess Masti browser extension
  // (Analyze with Chess Masti button on Lichess / Chess.com) and any
  // hand-shared URL. Unlike lichessReview, we keep the param in the URL so
  // the link is sharable; a ref dedupes re-loads on innocuous re-renders.
  const pgnLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof pgn !== 'string' || !pgn.trim()) return;
    if (pgnLoadedRef.current === pgn) return;
    pgnLoadedRef.current = pgn;
    try {
      const decoded = decodeURIComponent(pgn);
      // Load PGN into BOTH atoms — see the lichessReview comment above for
      // why setGamePgn alone isn't enough. Without setBoardPgn, the board
      // cursor stays at the starting position and any move the user makes
      // is treated as the second ply of an empty game, not the next move
      // after the loaded PGN's tail. This was the "board doesn't navigate
      // to end of game" bug reported against the extension's deep link.
      setGamePgn(decoded);
      setBoardPgn(decoded);
      setGameEval(undefined);
      setBoardOrientation(true);
    } catch {
      // Malformed URI escape — leave board untouched.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pgn]);

  // Load a persisted insight permalink (?insightId=). Fetches the saved coach
  // response so the recipient sees the original explanation without a fresh
  // LLM call. Drops into preloadedInsightAtom which AICoachChat reads on mount.
  const insightLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof insightId !== 'string' || !insightId.trim()) return;
    if (insightLoadedRef.current === insightId) return;
    insightLoadedRef.current = insightId;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/insights/${encodeURIComponent(insightId)}`);
        if (!res.ok) {
          // 404 / 500 — fall through to bare-FEN-style load if we have one.
          return;
        }
        const insight = await res.json();
        if (cancelled) return;
        if (typeof insight.fen === 'string' && insight.fen.trim()) {
          resetBoard({ fen: insight.fen });
          resetGame({ fen: insight.fen, noHeaders: true });
          setGameEval(undefined);
          setBoardOrientation(!insight.fen.includes(' b '));
        }
        if (typeof insight.coachContent === 'string' && insight.coachContent.trim()) {
          const kind = insight.kind === 'transcript' ? 'transcript' : 'single';
          setPreloadedInsight({
            fen: insight.fen,
            coachContent: insight.coachContent,
            createdAt: insight.createdAt ?? Date.now(),
            kind,
            transcript:
              kind === 'transcript' && Array.isArray(insight.transcript)
                ? insight.transcript
                : null,
          });
        }
      } catch (err) {
        console.error('Failed to load insight permalink:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insightId]);

  // Clear preloaded insight on page unmount so a later visit without
  // ?insightId= starts fresh.
  useEffect(() => {
    return () => {
      setPreloadedInsight(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lichessReview === '1') return; // handled above
    if (typeof pgn === 'string' && pgn.trim()) return; // handled above
    if (typeof insightId === 'string' && insightId.trim()) return; // handled above
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
  }, [gameId, fen, lichessReview, pgn, insightId, setGameEval, setBoardOrientation, resetBoard, resetGame]);

  return (
    <Grid
      container
      gap={1}
      justifyContent="flex-start"
      alignItems="start"
      direction={{ xs: "column", lg: "row" }}
      sx={{ width: "100%", maxWidth: "100vw" }}
    >
      <PageTitle title="Chess Masti AI - Game Analysis" />

      <Grid
        ref={boardContainerRef}
        size={{ xs: 12, lg: "auto" }}
        sx={{ flexShrink: 0, minWidth: { lg: "400px" } }}
      >
        <ErrorBoundary name="chessboard">
          <Board />
        </ErrorBoundary>
      </Grid>

      {/* Backdrop when panel is expanded */}
      {panelExpanded && (
        <Box
          onClick={() => setPanelExpanded(false)}
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            zIndex: 1200,
            transition: "opacity 0.3s ease",
          }}
        />
      )}

      <Grid
        size={{ xs: 12, lg: "grow" }}
        container
        justifyContent="start"
        alignItems="stretch"
        borderRadius={2}
        border={1}
        borderColor={"secondary.main"}
        sx={{
          backgroundColor: "secondary.main",
          borderColor: "primary.main",
          borderWidth: 2,
          boxShadow: panelExpanded
            ? "0 4px 30px rgba(0, 0, 0, 0.6)"
            : "0 2px 10px rgba(0, 0, 0, 0.5)",
          minWidth: { lg: "420px" },
          width: "100%",
          flex: 1,
          ...(gameEval && { overflow: "visible" }),
          ...(panelExpanded && {
            position: "fixed",
            top: "64px",
            right: 0,
            bottom: 0,
            left: { xs: 0, lg: `${boardRight}px` },
            width: "auto",
            zIndex: 1300,
            borderRadius: { xs: 0, lg: "16px 0 0 0" },
            overflow: "hidden",
          }),
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        padding={1}
        rowGap={1}
        height={{
          xs: "auto",
          lg: panelExpanded ? "calc(100vh - 64px)" : "calc(88vh - 60px)",
        }}
        display="flex"
        flexDirection="column"
        flexWrap="nowrap"
      >
        {/* Top bar: section toggles + compact load/analyze/expand */}
        <Box sx={{ px: 1, pt: 0.5, flexShrink: 0 }}>
          <TopBar />
        </Box>

        <Divider sx={{ mx: 1, flexShrink: 0 }} />

        {/* Togglable sections (scrollable cap) */}
        <Box
          sx={{
            width: "100%",
            maxHeight: isLgOrGreater ? "45%" : "none",
            overflowY: "auto",
            scrollbarWidth: "thin",
            flexShrink: 0,
          }}
        >
          <ErrorBoundary name="unified-sections">
            <UnifiedSections />
          </ErrorBoundary>
        </Box>

        {/* AI Coach — always visible, main content area */}
        <Box
          sx={{
            flex: 1,
            minHeight: { xs: "32rem", lg: 0 },
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderTop: "1px solid",
            borderColor: "divider",
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

        {/* Bottom: board nav toolbar */}
        <Box sx={{ width: "100%", flexShrink: 0 }}>
          <Divider sx={{ mx: 1, mb: 0.5 }} />
          <PanelToolBar key="main-panel-toolbar" />
        </Box>
      </Grid>

      <EngineSettingsButton />
    </Grid>
  );
}
