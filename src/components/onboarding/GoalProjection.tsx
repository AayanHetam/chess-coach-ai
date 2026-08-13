"use client";

import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { projectToGoal, type Projection } from "@/lib/curriculum/improvementModel";
import { EMBER } from "./diagramTokens";

/**
 * "Here's how long that takes" — the projection chart for the goal-rating step.
 *
 * The curve is CONCAVE by construction (see improvementModel.ratingAfterWeeks):
 * each further rating point costs more than the last, so progress is fast at
 * first and flattens. Drawing a straight line here would be the single most
 * misleading thing this screen could do — it would promise late gains at the
 * same rate as early ones, which is exactly the false promise that makes people
 * quit at the 1500 plateau.
 *
 * The headline is a RANGE, never a date. Practice explains only ~40% of the
 * variance in chess rating (Charness et al. 2005) and reported hours-to-master
 * span 8:1, so a single "you'll get there in March" would be a fabrication with
 * decimal places on it.
 */

const TRACK = "rgba(255,255,255,0.10)";

function formatMonths(m: number): string {
  if (m < 1) return "under a month";
  if (m < 2) return "about a month";
  if (m < 18) return `${Math.round(m)} months`;
  const years = m / 12;
  return years < 2.2 ? "about 2 years" : `about ${Math.round(years)} years`;
}

interface GoalProjectionProps {
  currentRating: number;
  goalRating: number;
  minutesPerDay: number;
  daysPerWeek: number;
}

export default function GoalProjection({
  currentRating,
  goalRating,
  minutesPerDay,
  daysPerWeek,
}: GoalProjectionProps) {
  const p: Projection = useMemo(
    () => projectToGoal({ currentRating, goalRating, minutesPerDay, daysPerWeek }),
    [currentRating, goalRating, minutesPerDay, daysPerWeek]
  );

  const data = useMemo(
    () => p.curve.map((pt) => ({ w: Math.round(pt.weeks), rating: pt.rating })),
    [p.curve]
  );

  if (p.status === "already_there") {
    return (
      <Note>
        You&apos;re already at {currentRating}. Aim higher and we&apos;ll map the route.
      </Note>
    );
  }
  if (p.status === "no_schedule") {
    return <Note>Tell us how often you can practise and we&apos;ll plot the route.</Note>;
  }
  if (p.status === "unrealistic") {
    return (
      <Note>
        {goalRating} is a long way from {currentRating} at this pace — more than a
        decade. Pick a nearer milestone and we&apos;ll build a plan you can
        actually finish.
      </Note>
    );
  }

  const lo = Math.min(...data.map((d) => d.rating));
  const hi = Math.max(...data.map((d) => d.rating));
  const pad = Math.max(20, Math.round((hi - lo) * 0.15));

  return (
    <Box
      sx={{
        mt: 2,
        p: 2,
        borderRadius: "16px",
        background: "rgba(249,115,22,0.06)",
        border: "1px solid rgba(249,115,22,0.22)",
      }}
    >
      <Typography sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.78rem" }}>
        At {Math.round(minutesPerDay)} min a day, {daysPerWeek} days a week
      </Typography>

      <Typography
        sx={{ color: "#fff", fontWeight: 800, fontSize: "1.35rem", lineHeight: 1.2, mt: 0.25 }}
      >
        {currentRating} → {goalRating} in {formatMonths(p.months!)}
      </Typography>

      {/* The band is the honest part, so it sits with the headline rather than
          in a footnote. */}
      <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.8rem", mt: 0.25 }}>
        Most players land between {formatMonths(p.fastMonths!)} and{" "}
        {formatMonths(p.slowMonths!)} — around {Math.round(p.totalHours)} hours of
        focused practice.
      </Typography>

      <Box sx={{ height: 132, mt: 1.5, mx: -0.5 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="goalProjGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={EMBER} stopOpacity={0.4} />
                <stop offset="100%" stopColor={EMBER} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="w"
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: TRACK }}
              tickFormatter={(w: number) => (w === 0 ? "now" : `${Math.round(w / 4.33)}mo`)}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              domain={[lo - pad, hi + pad]}
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={34}
            />
            <ReferenceLine
              y={goalRating}
              stroke="rgba(255,255,255,0.35)"
              strokeDasharray="4 4"
            />
            <Area
              type="monotone"
              dataKey="rating"
              stroke={EMBER}
              strokeWidth={2.5}
              fill="url(#goalProjGrad)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Box>

      <Typography sx={{ color: "rgba(255,255,255,0.38)", fontSize: "0.72rem", mt: 0.5 }}>
        An estimate from typical improvement rates, not a promise — how fast you
        actually move depends on you.
      </Typography>
    </Box>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        mt: 2,
        p: 1.75,
        borderRadius: "14px",
        background: "rgba(255,255,255,0.03)",
        border: "1px dashed rgba(255,255,255,0.14)",
      }}
    >
      <Typography sx={{ color: "rgba(255,255,255,0.7)", fontSize: "0.85rem" }}>
        {children}
      </Typography>
    </Box>
  );
}
