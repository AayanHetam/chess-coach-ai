"use client";

/**
 * The board's answer to a compare, under the question that asked it
 * ("8. Qxc1 or 8. Nd6+?", pathway 3.5).
 *
 * Two reserved lines of numbers (both moves' and the engine's best where
 * it is neither, from one search, with the depth), two reserved lines for
 * the engine's verdict on the two in the app's words, then each move and
 * the engine's reply to it as a proof line, the first move named first.
 * The block is on the page from the moment the question is sent, at its
 * full height, with "Checking …" and both lines' empty rows in place, so
 * nothing under it moves when the engine answers. No box, no chip, no
 * badge.
 *
 * Neither move goes on the board until the reader taps or plays one of
 * the lines. Each line's moves are held once the reader taps or plays it
 * (pinWhatIfLine), so a deeper search never swaps them under the reader.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { Box, Tooltip } from "@mui/material";
import { ProofLine, ProofLinePlaceholder, type ShowLinePly } from "./ProofLine";
import {
  compareSummary,
  initialWhatIfState,
  pinWhatIfLine,
  type WhatIfAsk,
  type WhatIfStore,
} from "./coachWhatIf";
import type { CoachLine } from "./coachLines";
import type { LineCaption } from "@/lib/coach/lineCaptions";

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const SCORED_NOTE =
  "From White's side. Both moves were scored in one cold search, so the difference between them means something. Neither number compares with the review's.";

/** Two lines of text, never a third: the block's height is fixed from the push. */
const TWO_LINES = {
  fontSize: "0.76rem",
  lineHeight: 1.3,
  minHeight: "2.6em",
  maxHeight: "2.6em",
  overflow: "hidden",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflowWrap: "anywhere",
} as const;

export function CompareLines({
  id,
  ask,
  store,
  playerColor,
  onShowPly,
}: {
  id: number;
  ask: WhatIfAsk;
  /** The page's what-if states; this block reads its own and re-renders alone when it changes. */
  store: WhatIfStore;
  playerColor: "w" | "b" | null;
  onShowPly?: ShowLinePly;
}) {
  const initial = useMemo(() => initialWhatIfState(id, ask), [id, ask]);
  const read = () => store.get(id) ?? initial;
  const state = useSyncExternalStore(store.subscribe, read, read);
  const showPly = useCallback(
    (
      line: CoachLine,
      k: number,
      replay?: () => boolean,
      ply?: LineCaption | null
    ) => {
      store.update(id, (st) => pinWhatIfLine(st, line));
      onShowPly?.(line, k, replay, ply);
    },
    [onShowPly, store, id]
  );
  const unavailable = state.status === "unavailable";
  const first = unavailable ? null : (state.pinned ?? state.line);
  const second = unavailable
    ? null
    : (state.compared?.pinned ?? state.compared?.line ?? null);
  const pinned = !!state.pinned || !!state.compared?.pinned;
  const { numbers, words } = compareSummary(state);
  const scored = state.status === "drawn" || state.status === "final";
  // The first paint of both lines, for the budget the e2e holds: marked at
  // the start of the frame after the one that paints them (see WhatIfLine).
  const drawnOnce = state.line !== null && !!state.compared?.line;
  useEffect(() => {
    if (!drawnOnce || typeof performance === "undefined") return;
    let after: number | undefined;
    const frame = requestAnimationFrame(() => {
      after = requestAnimationFrame(() => {
        try {
          performance.mark("coach-what-if:drawn", {
            detail: { id, kind: "compare" },
          });
        } catch {
          /* no marks here */
        }
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      if (after !== undefined) cancelAnimationFrame(after);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawnOnce]);
  const numbersRow = (
    <Box
      data-testid="compare-summary"
      sx={{
        ...TWO_LINES,
        fontFamily: MONO,
        color: scored ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.5)",
      }}
    >
      {numbers}
    </Box>
  );
  const lineSlot = (
    line: CoachLine | null,
    testId: "compare-line-first" | "compare-line-second"
  ) =>
    line ? (
      <ProofLine
        // A new set of moves is a new line: its highlighted ply and its
        // Play belong to the moves they were shown on. The slot is in the
        // key too, so the two slots are never taken for each other.
        key={`${testId} ${line.sans.join(" ")}`}
        line={line}
        playerColor={playerColor}
        onShowPly={onShowPly ? showPly : undefined}
        label="Compare"
        reserveCaption
        // The moves the moment they are known, their facts a frame later.
        deferCaptions
        data-testid={testId}
      />
    ) : (
      <ProofLinePlaceholder
        key={`${testId}-placeholder`}
        label="Compare"
        data-testid={`${testId}-placeholder`}
      />
    );
  return (
    <Box
      data-testid="compare"
      data-status={state.status}
      data-depth={state.depth}
      data-pinned={pinned ? "true" : undefined}
      sx={{ minWidth: 0 }}
    >
      {scored ? (
        <Tooltip title={SCORED_NOTE} enterDelay={600} describeChild>
          {numbersRow}
        </Tooltip>
      ) : (
        numbersRow
      )}
      <Box
        data-testid="compare-words"
        sx={{
          ...TWO_LINES,
          fontSize: "0.8rem",
          color: "rgba(255,255,255,0.72)",
        }}
      >
        {words}
      </Box>
      {lineSlot(first, "compare-line-first")}
      {lineSlot(second, "compare-line-second")}
    </Box>
  );
}
