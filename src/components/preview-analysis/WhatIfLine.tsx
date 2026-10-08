"use client";

/**
 * The board's answer to a what-if, under the question that asked it.
 *
 * One line of plain words (the asked move's number beside the move it is
 * compared with, from the same search, and the depth), then the asked move
 * and the engine's reply as a proof line. The block is on the page from
 * the moment the question is sent, at its full height, with "Checking …"
 * and the line's empty rows in place, so nothing under it moves when the
 * engine's first partial lands, when a deeper one replaces it, or when no
 * answer comes at all. No box, no chip, no badge.
 */
import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import { Box, Tooltip } from "@mui/material";
import { ProofLine, ProofLinePlaceholder } from "./ProofLine";
import {
  initialWhatIfState,
  whatIfSummary,
  type WhatIfAsk,
  type WhatIfStore,
} from "./coachWhatIf";
import type { CoachLine } from "./coachLines";

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const SCORED_NOTE =
  "From White's side. Both moves were scored in one cold search, so their difference means something; neither number compares with the review's.";

export function WhatIfLine({
  id,
  ask,
  store,
  playerColor,
  onShowPly,
}: {
  id: number;
  ask: WhatIfAsk;
  /** The page's what-if states; this line reads its own and re-renders alone when it changes. */
  store: WhatIfStore;
  playerColor: "w" | "b" | null;
  onShowPly?: (line: CoachLine, k: number) => void;
}) {
  const initial = useMemo(() => initialWhatIfState(id, ask), [id, ask]);
  const read = () => store.get(id) ?? initial;
  const state = useSyncExternalStore(store.subscribe, read, read);
  const summary = whatIfSummary(state);
  const scored = state.status === "drawn" || state.status === "final";
  // The first paint of the line, for the budget the e2e holds: marked at
  // the start of the frame after the one that paints it, not at the commit
  // (a store update renders on the sync lane, whose effects run before the
  // paint). Two animation frames, not a frame and a timer: a timer queues
  // behind the board's render, which the page starts on that same second
  // frame (afterNextPaint in AnalysisImpl), and would date the line's paint
  // after the board's.
  const drawnOnce = state.line !== null;
  useEffect(() => {
    if (!drawnOnce || typeof performance === "undefined") return;
    let second: number | undefined;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        try {
          performance.mark("coach-what-if:drawn", { detail: { id } });
        } catch {
          /* no marks here */
        }
      });
    });
    return () => {
      cancelAnimationFrame(first);
      if (second !== undefined) cancelAnimationFrame(second);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawnOnce]);
  // Two lines are reserved whatever the state: the three-role form ("8.
  // Nd6+ -1.20 · played 8. Nc7+ -0.97 · engine's 8. Qxc1 +2.51 · d12") does
  // not fit a phone's column on one, and the numbers are what the block is
  // for. Never a third: the height is the block's and must not change.
  const summaryRow = (
    <Box
      data-testid="what-if-summary"
      sx={{
        fontFamily: MONO,
        fontSize: "0.76rem",
        lineHeight: 1.3,
        minHeight: "2.6em",
        maxHeight: "2.6em",
        color: scored ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.5)",
        overflow: "hidden",
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflowWrap: "anywhere",
      }}
    >
      {summary}
    </Box>
  );
  return (
    <Box
      data-testid="what-if"
      data-status={state.status}
      data-depth={state.depth}
      sx={{ minWidth: 0 }}
    >
      {scored ? (
        <Tooltip title={SCORED_NOTE} enterDelay={600} describeChild>
          {summaryRow}
        </Tooltip>
      ) : (
        summaryRow
      )}
      {state.line ? (
        <ProofLine
          line={state.line}
          playerColor={playerColor}
          onShowPly={onShowPly}
          label="What if"
          reserveCaption
          data-testid="what-if-line"
        />
      ) : (
        <ProofLinePlaceholder
          label="What if"
          data-testid="what-if-line-placeholder"
        />
      )}
    </Box>
  );
}
