"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { Chess } from "chess.js";
import { getLineEvalLabel, moveLineUciToSan } from "@/lib/chess";
import { useEngineWithStatus, isEngineUnavailable } from "@/hooks/useEngine";
import { DEFAULT_ENGINE, ENGINE_LABELS } from "@/constants";
import { SERIF_DISPLAY } from "@/theme/fonts";
import type { LineEval } from "@/types/eval";

/**
 * Engine readout for a solved puzzle.
 *
 * Mounted only once the analysis gate opens (see `analysisGate.ts`) — the
 * engine's top move is the puzzle's answer, so this must never be reachable
 * while the answer is still a secret.
 *
 * The engine is loaded LAZILY: `useEngineWithStatus(undefined)` stays idle and
 * downloads nothing, so passing a name only when `enabled` keeps the engine
 * download off the critical path for the many solvers who never open this. That
 * download is also why every non-ready state below is spelled out rather than
 * collapsed into a spinner — on a mid-range phone the wait is long, and
 * "nothing is happening" and "nothing will ever happen" must not look alike.
 */

const DEPTH = 16;
const DIM = "rgba(255,240,224,0.5)";

/**
 * How long to sit on "Evaluating…" before admitting nothing is coming.
 *
 * This guard is the reason the wrong-engine bug was findable at all. Pinned to
 * Stockfish 16, the panel was quietly pulling a 40 MB network and every user
 * saw the message below — which is exactly what it is for: "nothing yet" and
 * "nothing ever" must not look the same. Without it the panel would have spun
 * forever, still claiming to work, and the mistake would have looked like slow.
 *
 * Generous, because a genuine single-threaded depth-16 search on a slow phone
 * is allowed to take a while. It bounds the SEARCH, not the download — the
 * loading state above owns that, and it is only armed once status is "ready".
 */
const STALL_MS = 25_000;

interface PuzzleAnalysisPanelProps {
  /** Gate result. False keeps the engine unmounted entirely. */
  enabled: boolean;
  /** Position to evaluate — the board's current FEN. */
  fen: string;
}

export function PuzzleAnalysisPanel({
  enabled,
  fen,
}: PuzzleAnalysisPanelProps) {
  // A finished game deserves words, not a search. After "Show solution" on a
  // mate puzzle the board's FEN IS the mated position, and asking Stockfish
  // about it yields `bestmove (none)` — which used to reach the user as "the
  // engine didn't return an evaluation", a shrug about the one position whose
  // evaluation is absolute. Saying "checkmate" needs chess.js, not a 7 MB
  // engine download, so a terminal position also skips mounting the engine
  // entirely below.
  const terminal = useMemo(() => {
    if (!enabled || !fen) return null;
    try {
      const game = new Chess(fen);
      if (game.isCheckmate()) {
        const winner = game.turn() === "w" ? "Black" : "White";
        return `Checkmate — ${winner} has won this position, so there's nothing left to evaluate.`;
      }
      if (game.isStalemate()) {
        return "Stalemate — this position is a draw, so there's nothing left to evaluate.";
      }
      if (game.isDraw()) {
        return "This position is a dead draw, so there's nothing left to evaluate.";
      }
    } catch {
      // An unparseable FEN falls through to the engine path, whose own error
      // handling owns that case.
    }
    return null;
  }, [enabled, fen]);

  // The lazy mount. `undefined` → the hook stays idle and fetches nothing.
  //
  // DEFAULT_ENGINE, not a hardcoded name. This shipped pinned to
  // `EngineName.Stockfish16`, whose worker pairs with a separate 40 MB NNUE
  // network — so the panel sat downloading long past the stall guard and every
  // real user got "the engine didn't return an evaluation". Stockfish 17 Lite
  // is ~6 MB and self-contained, and it is what the rest of the app already
  // loads, so /puzzles and /analysis now agree on the engine by construction
  // rather than by two people remembering to pick the same one.
  const { engine, status } = useEngineWithStatus(
    enabled && !terminal ? DEFAULT_ENGINE : undefined
  );
  const [line, setLine] = useState<LineEval | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!enabled || !engine || status !== "ready" || !fen) return;
    let cancelled = false;
    setEvaluating(true);
    setLine(null);
    setStalled(false);

    // Bound the wait. Cleared by the first line that arrives (below), so a
    // search that is merely slow never trips it.
    const stallTimer = setTimeout(() => {
      if (!cancelled) setStalled(true);
    }, STALL_MS);

    void engine
      .evaluatePositionWithUpdate({
        fen,
        depth: DEPTH,
        multiPv: 1,
        setPartialEval: (evaluation) => {
          // Render depth as it climbs rather than staring at a spinner.
          if (cancelled) return;
          const first = evaluation.lines?.[0];
          if (first) {
            clearTimeout(stallTimer);
            setStalled(false);
            setLine(first);
          }
        },
      })
      .then((evaluation) => {
        if (cancelled) return;
        const first = evaluation.lines?.[0];
        if (first) {
          clearTimeout(stallTimer);
          setStalled(false);
          setLine(first);
        }
      })
      .catch((err) => {
        // A rejected evaluation must not leave a stale line on screen looking
        // like a fresh answer — and it means nothing is EVER coming, so show
        // the terminal message now rather than letting "Evaluating…" run out
        // the 25s stall clock. That silent-swallow-then-stall shape is
        // exactly how the multiPv:1 rejection hid for weeks: the error had a
        // message, and nobody ever saw it.
        console.error("[PuzzleAnalysisPanel] evaluation failed:", err);
        if (!cancelled) {
          clearTimeout(stallTimer);
          setLine(null);
          setStalled(true);
        }
      })
      .finally(() => {
        if (!cancelled) setEvaluating(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(stallTimer);
    };
  }, [enabled, engine, status, fen]);

  // UCI → SAN against the position being evaluated, so the line reads the way
  // a player would say it.
  const sanLine = useMemo(() => {
    if (!line?.pv?.length || !fen) return "";
    try {
      const toSan = moveLineUciToSan(fen);
      return line.pv.slice(0, 6).map(toSan).join(" ");
    } catch {
      return "";
    }
  }, [line, fen]);

  if (!enabled) return null;

  return (
    <Box
      sx={{
        mt: 1.5,
        px: 1.5,
        py: 1.25,
        borderRadius: "0.75rem",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {terminal ? (
        // The one evaluation that needs no engine. Serif like the eval label —
        // this IS the answer, not an apology for missing one.
        <Typography
          sx={{
            fontFamily: SERIF_DISPLAY,
            fontSize: "0.92rem",
            color: "rgba(255,240,224,0.88)",
          }}
        >
          {terminal}
        </Typography>
      ) : isEngineUnavailable(status) ? (
        // Terminal. Say so plainly instead of spinning forever — this is the
        // exact case `useEngine`'s status machine was built to make visible.
        <Typography sx={{ fontSize: "0.78rem", color: DIM }}>
          {status === "unsupported"
            ? "This browser can't run the engine, so there's no analysis here."
            : "The engine couldn't load, so there's no analysis here."}
        </Typography>
      ) : status !== "ready" ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <CircularProgress size={13} sx={{ color: DIM }} />
          <Typography sx={{ fontSize: "0.78rem", color: DIM }}>
            {`Loading the engine (~${ENGINE_LABELS[DEFAULT_ENGINE].sizeMb} MB, first time only)…`}
          </Typography>
        </Box>
      ) : !line && stalled ? (
        // Stop claiming to work. Better to say the engine gave nothing than to
        // spin indefinitely and let the user read that as "still thinking".
        <Typography sx={{ fontSize: "0.78rem", color: DIM }}>
          The engine didn&apos;t return an evaluation for this position. The
          coach&apos;s explanation above still stands on its own.
        </Typography>
      ) : !line ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <CircularProgress size={13} sx={{ color: DIM }} />
          <Typography sx={{ fontSize: "0.78rem", color: DIM }}>
            Evaluating…
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: "flex",
            alignItems: "baseline",
            gap: 1.25,
            flexWrap: "wrap",
          }}
        >
          <Typography
            sx={{
              fontFamily: SERIF_DISPLAY,
              fontSize: "1.05rem",
              fontWeight: 600,
              color: "#FFD1A8",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {getLineEvalLabel(line)}
          </Typography>
          {sanLine && (
            <Typography
              sx={{
                fontFamily: SERIF_DISPLAY,
                fontSize: "0.9rem",
                color: "rgba(255,240,224,0.88)",
                minWidth: 0,
              }}
            >
              {sanLine}
            </Typography>
          )}
          <Box sx={{ flex: 1 }} />
          {/* Depth earns its space: it is how the reader judges how much to
              trust the number, and it visibly climbs while the search runs. */}
          <Typography
            sx={{
              fontSize: "0.7rem",
              color: DIM,
              fontFamily: "Monaco, Menlo, monospace",
              whiteSpace: "nowrap",
            }}
          >
            depth {line.depth}
            {evaluating ? "…" : ""}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
