"use client";

import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { useAtomValue } from "jotai";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { PanelCard } from "./PanelCard";
import { puzzleStatsAtom } from "@/lib/puzzleRating";

/**
 * Puzzle rating over time.
 *
 * Deliberately spare: no X axis, no gridlines, no legend. The shape of the line
 * and the delta are the message; date ticks on a chart of "the last 100 solves"
 * are noise, and they were unreadable at this width anyway.
 *
 * Needs 3+ points before it draws. Two points make a straight line that implies
 * a trend from a single attempt.
 */

const MIN_POINTS = 3;

export function RatingTrendCard() {
  const stats = useAtomValue(puzzleStatsAtom);

  const data = useMemo(
    () =>
      (stats.ratingHistory ?? []).map((p, i) => ({
        i,
        rating: p.rating,
        when: new Date(p.timestamp).toLocaleDateString(),
      })),
    [stats.ratingHistory]
  );

  const first = data[0]?.rating;
  const last = data[data.length - 1]?.rating;
  const delta = first !== undefined && last !== undefined ? last - first : null;
  const peak = data.length > 0 ? Math.max(...data.map((d) => d.rating)) : null;

  return (
    <PanelCard
      title="Rating trend"
      subtitle={
        data.length >= MIN_POINTS
          ? `${data.length} rated attempts${peak !== null ? ` · peak ${peak}` : ""}`
          : undefined
      }
      action={
        delta !== null && data.length >= MIN_POINTS ? (
          <Typography
            sx={{
              fontSize: "0.8rem",
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              color:
                delta > 0
                  ? "#4ADE80"
                  : delta < 0
                    ? "#FCA5A5"
                    : "rgba(255,255,255,0.5)",
            }}
          >
            {delta > 0 ? "+" : ""}
            {delta}
          </Typography>
        ) : undefined
      }
    >
      {data.length >= MIN_POINTS ? (
        // Taller on desktop: at ~1100px wide a 150px chart reads as a stretched
        // sliver, while the same height at phone width looks right.
        <Box sx={{ width: "100%", height: { xs: 150, md: 200 }, mx: -0.5 }}>
          <ResponsiveContainer>
            <AreaChart
              data={data}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="ratingFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F97316" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#F97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={["dataMin - 40", "dataMax + 40"]} />
              <Tooltip
                cursor={{ stroke: "rgba(255,255,255,0.18)" }}
                contentStyle={{
                  background: "rgba(18,20,26,0.96)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.9)",
                }}
                labelFormatter={() => ""}
                formatter={(value: number) => [String(value), "Rating"]}
              />
              <Area
                type="monotone"
                dataKey="rating"
                stroke="#FB923C"
                strokeWidth={2}
                fill="url(#ratingFill)"
                dot={false}
                activeDot={{ r: 3, fill: "#FB923C", stroke: "none" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      ) : (
        // Collapsed, not a 150px empty frame. A brand-new user should not have
        // to scroll past a chart-shaped hole to reach the parts of the page
        // that can actually help them.
        <Typography
          sx={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.35)", py: 0.5 }}
        >
          Solve {Math.max(0, MIN_POINTS - data.length)} more puzzle
          {MIN_POINTS - data.length === 1 ? "" : "s"} to start your rating
          curve.
        </Typography>
      )}
    </PanelCard>
  );
}
