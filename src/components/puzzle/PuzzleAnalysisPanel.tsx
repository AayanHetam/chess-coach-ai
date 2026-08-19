"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { getLineEvalLabel, moveLineUciToSan } from "@/lib/chess";
import { useEngineWithStatus, isEngineUnavailable } from "@/hooks/useEngine";
import { EngineName } from "@/types/enums";
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
 * downloads nothing, so passing a name only when `enabled` keeps Stockfish's
 * ~7 MB off the critical path for the many solvers who never open this. That
 * download is also why every non-ready state below is spelled out rather than
 * collapsed into a spinner — on a mid-range phone the wait is long, and
 * "nothing is happening" and "nothing will ever happen" must not look alike.
 */

const DEPTH = 16;
const DIM = "rgba(255,240,224,0.5)";

/**
 * How long to sit on "Evaluating…" before admitting nothing is coming.
 *
 * A search that never returns is not hypothetical: the engine boots, logs that
 * it started, and then produces no line — reproducible locally on the existing
 * /analysis surface too, so it is a property of the engine path rather than of
 * this panel. Without a bound, the UI spins forever and claims to be working.
 * That is the silent-substitution failure mode this codebase keeps re-learning:
 * "nothing yet" and "nothing ever" must not look the same.
 *
 * Generous, because a genuine single-threaded depth-16 search on a slow phone
 * is allowed to take a while.
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
  // The lazy mount. `undefined` → the hook stays idle and fetches nothing.
  const { engine, status } = useEngineWithStatus(
    enabled ? EngineName.Stockfish16 : undefined
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
      .catch(() => {
        // A rejected evaluation must not leave a stale line on screen looking
        // like a fresh answer.
        if (!cancelled) setLine(null);
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
      {isEngineUnavailable(status) ? (
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
            Loading the engine (about 7 MB, first time only)…
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
