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
import type { SessionResult } from "@/lib/puzzleSession";

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

const GREEN = "#4ade80";
const RED = "#f87171";
const EMBER = "#FF7A1A";

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
    [results, startRating],
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
  // a small "+5" doesn't show a green number next to a neutral note.
  const trend = classifyTrend(netDelta);
  const deltaColor = trend === "gain" ? GREEN : trend === "loss" ? RED : "#FBBF24";
  const deltaLabel = `${netDelta > 0 ? "+" : ""}${netDelta}`;
  const chartSummary = `Rating ${netDelta >= 0 ? "rose" : "fell"} from ${startRating} to ${endRating} over ${total} ${total === 1 ? "puzzle" : "puzzles"} (${solvedCount} solved, ${wrongCount} missed).`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="session-recap-title"
      PaperProps={{
        sx: {
          borderRadius: "1.5rem",
          background: "linear-gradient(160deg, #161210, #0A0907)",
          border: "1px solid rgba(255,122,26,0.22)",
          backgroundImage:
            "linear-gradient(160deg, rgba(255,122,26,0.06), rgba(10,9,7,0.9))",
          boxShadow: "0 32px 80px -24px rgba(0,0,0,0.8)",
          color: "rgba(255,240,224,0.94)",
          overflow: "hidden",
        },
      }}
    >
      <Box sx={{ p: { xs: 2.5, sm: 3.5 } }}>
        <Typography
          id="session-recap-title"
          sx={{
            fontSize: "0.68rem",
            fontWeight: 700,
            letterSpacing: "0.18em",
            color: "#FFD1A8",
            textTransform: "uppercase",
            mb: 0.5,
          }}
        >
          Session complete
        </Typography>

        {/* Headline net rating move */}
        <Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ mb: 0.5 }}>
          <Typography
            sx={{
              fontSize: "2.4rem",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: deltaColor,
              lineHeight: 1,
            }}
          >
            {deltaLabel}
          </Typography>
          <Typography
            sx={{ fontSize: "0.95rem", color: "rgba(255,240,224,0.6)" }}
          >
            rating · {startRating} → {endRating}
          </Typography>
        </Stack>

        {/* Motivational note */}
        <Typography
          sx={{
            fontSize: "0.98rem",
            fontWeight: 600,
            color: "rgba(255,240,224,0.9)",
            mb: 2,
            minHeight: 24,
          }}
        >
          {message}
        </Typography>

        {/* Count chips */}
        <Stack direction="row" spacing={1.25} sx={{ mb: 2 }}>
          <CountChip color={GREEN} icon={<Check size={13} />} value={solvedCount} label="solved" />
          <CountChip color={RED} icon={<XIcon size={13} />} value={wrongCount} label="missed" />
          <CountChip
            color="rgba(255,240,224,0.55)"
            value={total}
            label="puzzles"
          />
        </Stack>

        {/* Rating-by-puzzle chart */}
        <Box
          role="img"
          aria-label={chartSummary}
          sx={{
            height: 200,
            borderRadius: "1rem",
            background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(255,255,255,0.06)",
            p: 1.5,
            pr: 2,
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="n"
                tick={{ fill: "rgba(255,240,224,0.6)", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={false}
              />
              <YAxis
                domain={["dataMin - 20", "dataMax + 20"]}
                tick={{ fill: "rgba(255,240,224,0.6)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip
                contentStyle={{
                  background: "#161210",
                  border: "1px solid rgba(255,122,26,0.3)",
                  borderRadius: 10,
                  color: "rgba(255,240,224,0.92)",
                  fontSize: 12,
                }}
                labelFormatter={(n) => (n === 0 ? "Start" : `Puzzle ${n}`)}
                formatter={(v: number) => [v, "Rating"]}
              />
              <ReferenceLine
                y={startRating}
                stroke="rgba(255,240,224,0.25)"
                strokeDasharray="4 4"
              />
              <Line
                type="monotone"
                dataKey="rating"
                stroke={EMBER}
                strokeWidth={2.5}
                dot={<RatingDot />}
                activeDot={{ r: 5, fill: EMBER }}
                isAnimationActive
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>

        <Button
          onClick={onClose}
          fullWidth
          sx={{
            mt: 2.5,
            py: 1.1,
            borderRadius: "999px",
            background: "linear-gradient(135deg, #FF7A1A, #FB923C)",
            color: "#0A0907",
            fontWeight: 800,
            fontSize: "0.92rem",
            textTransform: "none",
            "&:hover": {
              background: "linear-gradient(135deg, #FB923C, #FBBF24)",
            },
          }}
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
    solved === null ? "rgba(255,240,224,0.4)" : solved ? GREEN : RED;
  return <circle cx={cx} cy={cy} r={4} fill={fill} stroke="#0A0907" strokeWidth={1.5} />;
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
        borderRadius: "999px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {icon && <Box sx={{ color, display: "inline-flex" }}>{icon}</Box>}
      <Typography sx={{ fontSize: "0.9rem", fontWeight: 800, color }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: "0.78rem", color: "rgba(255,240,224,0.5)" }}>
        {label}
      </Typography>
    </Box>
  );
}

export default SessionRecapDialog;
