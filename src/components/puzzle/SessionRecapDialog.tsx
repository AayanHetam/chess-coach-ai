"use client";

import { useEffect, useMemo } from "react";
import { Box, Button, Dialog, Stack, Typography } from "@mui/material";
import { Check, X as XIcon } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { classifyTrend, pickSessionMessage } from "@/lib/puzzleSessionMessages";
import { Masti, trendMood } from "@/components/masti";
import type { SessionResult } from "@/lib/puzzleSession";
import {
  ACCENT,
  LINE,
  RADIUS,
  SHADOW,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

// Re-exported so existing imports (`SessionResult` from this module) keep
// working; the canonical definition now lives in lib/puzzleSession.
export type { SessionResult };

interface SessionRecapDialogProps {
  open: boolean;
  results: SessionResult[];
  onClose: () => void;
  /** Last shown note, so back-to-back recaps don't repeat the same line. */
  lastMessage?: string;
  /** Called with the note we picked, so the parent can pass it back as
   *  `lastMessage` next time. */
  onMessagePicked?: (msg: string) => void;
}

export function SessionRecapDialog({
  open,
  results,
  onClose,
  lastMessage,
  onMessagePicked,
}: SessionRecapDialogProps) {
  const solvedCount = results.filter((r) => r.solved).length;
  const wrongCount = results.length - solvedCount;
  const total = results.length;

  const startRating = results[0]?.ratingBefore ?? 0;
  const endRating = results[results.length - 1]?.ratingAfter ?? startRating;
  const netDelta = endRating - startRating;

  // Chart series: a leading anchor at the session's starting rating, then one
  // point per graded puzzle at its post-grade rating.
  const data = useMemo(
    () => [
      { n: 0, rating: startRating, solved: null as boolean | null },
      ...results.map((r, i) => ({
        n: i + 1,
        rating: r.ratingAfter,
        solved: r.solved,
      })),
    ],
    [results, startRating]
  );

  // Picked once per open (pure — no parent setState during render). Keyed on
  // the session identity so it stays stable while the dialog is open.
  const message = useMemo(() => {
    if (!open) return "";
    return pickSessionMessage(netDelta, lastMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, results.length]);

  // Report the picked note back to the parent in an effect (not during render)
  // so back-to-back recaps avoid repeating the same line.
  useEffect(() => {
    if (open && message) onMessagePicked?.(message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, message]);

  // Color the headline by the SAME trend bucket the motivational note uses, so
  // a small "+5" doesn't show a green number next to a neutral note. A flat
  // session is a number, not a status, so it reads in plain text.
  const trend = classifyTrend(netDelta);
  const deltaColor =
    trend === "gain"
      ? STATUS.success
      : trend === "loss"
        ? STATUS.error
        : TEXT.primary;
  const deltaLabel = `${netDelta > 0 ? "+" : ""}${netDelta}`;
  const chartSummary = `Rating ${netDelta >= 0 ? "rose" : "fell"} from ${startRating} to ${endRating} over ${total} ${total === 1 ? "puzzle" : "puzzles"} (${solvedCount} solved, ${wrongCount} missed).`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="session-recap-title"
    >
      <Box sx={{ p: { xs: 2.5, sm: 3.5 } }}>
        <Typography
          id="session-recap-title"
          component="h2"
          sx={{ ...TYPE.h4, color: TEXT.primary, mb: 1 }}
        >
          Session complete
        </Typography>

        {/* Headline net rating move */}
        <Stack
          direction="row"
          alignItems="baseline"
          spacing={1.5}
          sx={{ mb: 0.5 }}
        >
          <Typography
            sx={{
              ...TYPE.h1,
              fontVariantNumeric: "tabular-nums",
              color: deltaColor,
              lineHeight: 1,
            }}
          >
            {deltaLabel}
          </Typography>
          <Typography
            sx={{
              fontSize: "0.95rem",
              color: TEXT.secondary,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            rating · {startRating} → {endRating}
          </Typography>
        </Stack>

        {/* Motivational note, delivered by Masti wearing the same trend
            bucket that colours the headline: a gain jumps, a loss is dizzy,
            sideways is a wave. */}
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
          <Masti
            mood={trendMood(trend)}
            size={72}
            loops={2}
            decorative
            data-testid="recap-masti"
          />
          <Typography
            sx={{
              fontSize: "0.98rem",
              fontWeight: 600,
              color: TEXT.primary,
              minHeight: 24,
            }}
          >
            {message}
          </Typography>
        </Stack>

        {/* Count chips */}
        <Stack direction="row" spacing={1.25} sx={{ mb: 2 }}>
          <CountChip
            color={STATUS.success}
            icon={<Check size={13} />}
            value={solvedCount}
            label="solved"
          />
          <CountChip
            color={STATUS.error}
            icon={<XIcon size={13} />}
            value={wrongCount}
            label="missed"
          />
          <CountChip color={TEXT.secondary} value={total} label="puzzles" />
        </Stack>

        {/* Rating-by-puzzle chart */}
        <Box
          role="img"
          aria-label={chartSummary}
          sx={{
            height: 200,
            borderRadius: `${RADIUS.control}px`,
            background: SURFACE.raisedSecondary,
            border: `1px solid ${LINE.hairline}`,
            p: 1.5,
            pr: 2,
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 4, left: -12 }}
            >
              <CartesianGrid stroke={LINE.hairline} vertical={false} />
              <XAxis
                dataKey="n"
                tick={{ fill: TEXT.secondary, fontSize: 13 }}
                axisLine={{ stroke: LINE.hairline }}
                tickLine={false}
              />
              <YAxis
                domain={["dataMin - 20", "dataMax + 20"]}
                tick={{ fill: TEXT.secondary, fontSize: 13 }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip
                contentStyle={{
                  background: SURFACE.raisedTertiary,
                  border: `1px solid ${LINE.hairline}`,
                  borderRadius: RADIUS.small,
                  boxShadow: SHADOW.floating,
                  color: TEXT.primary,
                  fontSize: 12,
                }}
                labelFormatter={(n) => (n === 0 ? "Start" : `Puzzle ${n}`)}
                formatter={(v: number) => [v, "Rating"]}
              />
              <ReferenceLine
                y={startRating}
                stroke={TEXT.tertiary}
                strokeDasharray="4 4"
              />
              <Line
                type="monotone"
                dataKey="rating"
                stroke={ACCENT.main}
                strokeWidth={2.5}
                dot={<RatingDot />}
                activeDot={{ r: 5, fill: ACCENT.main }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>

        <Button
          onClick={onClose}
          fullWidth
          variant="contained"
          size="large"
          sx={{ mt: 2.5 }}
        >
          Start a fresh session
        </Button>
      </Box>
    </Dialog>
  );
}

/** Per-point dot, colored by whether that puzzle was solved. The anchor
 *  point (solved === null) renders muted. */
function RatingDot(props: {
  cx?: number;
  cy?: number;
  payload?: { solved: boolean | null };
}) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const solved = payload?.solved;
  const fill =
    solved === null ? TEXT.tertiary : solved ? STATUS.success : STATUS.error;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={fill}
      stroke={SURFACE.raisedSecondary}
      strokeWidth={1.5}
    />
  );
}

function CountChip({
  color,
  icon,
  value,
  label,
}: {
  color: string;
  icon?: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.6,
        px: 1.5,
        py: 0.6,
        borderRadius: `${RADIUS.control}px`,
        background: SURFACE.raisedSecondary,
        border: `1px solid ${LINE.hairline}`,
      }}
    >
      {icon && <Box sx={{ color, display: "inline-flex" }}>{icon}</Box>}
      <Typography
        sx={{
          fontSize: "0.9rem",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color,
        }}
      >
        {value}
      </Typography>
      <Typography sx={{ fontSize: "0.78rem", color: TEXT.secondary }}>
        {label}
      </Typography>
    </Box>
  );
}

export default SessionRecapDialog;
