"use client";

import { useMemo } from "react";
import { Box, Skeleton, Typography } from "@mui/material";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { ChartedPerf } from "@/lib/rating/ratingHistory";
import {
  useRatingHistory,
  type HistoryTrend,
} from "@/lib/rating/useRatingHistory";
import {
  forwardProjection,
  stitchProjection,
  type ProjectedPoint,
} from "@/lib/curriculum/forwardProjection";
import { formatTargetDate } from "@/lib/curriculum/improvementModel";

/**
 * Bullet / blitz / rapid rating trends for /plan.
 *
 * SMALL MULTIPLES, not one chart with three lines. The three controls share a
 * unit but not a range — a 2400 bullet and a 1100 rapid on one axis squashes
 * both into flat noise, and the reader's actual question is "is THIS one going
 * up", which is a per-panel question.
 *
 * One series per panel, so the panel title carries identity and no legend is
 * needed. A single ember accent across all three keeps colour meaning "this is
 * your data" rather than encoding a category that the headings already state.
 */

const EMBER = "#F97316";
const EMBER_SOFT = "rgba(249,115,22,0.28)";

const PERF_LABEL: Record<ChartedPerf, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
};

/**
 * What the goal implies for these panels. Absent when no goal is set, in which
 * case the panels show history only — the same rule as everywhere else here: no
 * goal, no forecast, rather than a forecast against an invented target.
 */
export interface TrendProjection {
  targetDateMs: number;
  minutesPerDay: number;
  daysPerWeek: number;
  goalRating: number;
  /**
   * Which control the goal is actually about — the perf the platform rating
   * was taken from. A goal of 2000 set off a 1805 rapid rating says nothing
   * about bullet, so the goal line belongs on one panel, not all three.
   * Undefined (or `classical`) means we cannot say, and no line is drawn.
   */
  goalPerf?: ChartedPerf;
  /**
   * Per-control targets in RAW platform numbers — the same scale these panels
   * plot. When a control has its own goal it wins over the single-goal rule
   * above, so a goal set control-by-control draws on every panel it names.
   */
  perfGoals?: Partial<Record<ChartedPerf, number>>;
}

function DeltaBadge({ delta }: { delta?: number }) {
  // Deliberately renders NOTHING when delta is undefined. A "+0" badge claims
  // we measured no change; with fewer than two observations we measured nothing.
  if (delta === undefined) return null;
  const up = delta > 0;
  const flat = delta === 0;
  const color = flat ? "rgba(255,255,255,0.5)" : up ? "#4ADE80" : "#F87171";
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, color }}>
      {!flat &&
        (up ? (
          <TrendingUp size={13} strokeWidth={2.5} />
        ) : (
          <TrendingDown size={13} strokeWidth={2.5} />
        ))}
      <Typography
        component="span"
        sx={{ fontSize: "0.78rem", fontWeight: 700, color: "inherit" }}
      >
        {up ? "+" : ""}
        {delta}
      </Typography>
    </Box>
  );
}

function TrendPanel({
  trend,
  projection,
}: {
  trend: HistoryTrend;
  projection?: TrendProjection;
}) {
  const history = useMemo(
    () => trend.points.map((p) => ({ t: p.t, rating: p.rating })),
    [trend.points]
  );

  // Projected forward from THIS control's own current rating, not from the
  // goal's anchor. The same practice buys fewer points at 1900 than at 1200,
  // so three panels sharing one curve would be a drawn claim we cannot support.
  const data: ProjectedPoint[] = useMemo(() => {
    const last = history[history.length - 1];
    const from = trend.current ?? last?.rating;
    if (!projection || from === undefined) return history;
    return stitchProjection(
      history,
      forwardProjection({
        currentRating: from,
        minutesPerDay: projection.minutesPerDay,
        daysPerWeek: projection.daysPerWeek,
        // NOW, not the last recorded game. Anchoring to the last data point
        // would count the silent weeks since then as practice and inflate the
        // curve — someone who last played in June would be credited two months
        // of study they did not do. stitchProjection still joins the line to
        // that final measurement, so the gap renders flat rather than as gains.
        fromMs: Date.now(),
        toMs: projection.targetDateMs,
      })
    );
  }, [history, projection, trend]);

  const projectedEnd = useMemo(() => {
    const withProjection = data.filter((d) => d.projected !== undefined);
    return withProjection.length > 1
      ? withProjection[withProjection.length - 1].projected
      : undefined;
  }, [data]);

  // Ratings live in a narrow band, so a zero-based axis flattens every line into
  // a straight edge. Padding around the actual range is what makes movement
  // legible. (Truncating a LINE baseline is fine; truncating a bar baseline is
  // not — bars encode magnitude by length, lines encode change by slope.)
  // A control's own goal wins; otherwise the single overall goal draws on the
  // one control it was set from (see TrendProjection.goalPerf).
  const goalOnThisPanel =
    projection?.perfGoals?.[trend.perf] ??
    (projection && projection.goalPerf === trend.perf
      ? projection.goalRating
      : undefined);

  const [lo, hi] = useMemo(() => {
    if (data.length === 0) return [0, 1];
    // Both series, or the forecast runs off the top of the panel and silently
    // renders as a line pinned to the ceiling.
    // The goal is in the domain too, on the panel that owns it. Recharts
    // DISCARDS a ReferenceLine outside the axis range by default, so the goal
    // line was computed, passed review, and rendered zero elements on every
    // panel — confirmed by counting .recharts-reference-line in a real browser.
    const vals = [
      ...data.flatMap((d) =>
        [d.rating, d.projected].filter((v): v is number => v !== undefined)
      ),
      ...(goalOnThisPanel !== undefined ? [goalOnThisPanel] : []),
    ];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max(20, Math.round((max - min) * 0.2));
    return [min - pad, max + pad];
  }, [data, goalOnThisPanel]);

  const empty = history.length === 0;
  const single = history.length === 1 && projectedEnd === undefined;

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        p: 2,
        borderRadius: "16px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 0.25 }}>
        <Typography
          sx={{
            color: "rgba(255,255,255,0.55)",
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {PERF_LABEL[trend.perf]}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <DeltaBadge delta={trend.delta} />
      </Box>

      <Typography
        sx={{
          color: "#fff",
          fontWeight: 800,
          fontSize: "1.6rem",
          lineHeight: 1.15,
        }}
      >
        {trend.current ?? "—"}
      </Typography>

      <Box sx={{ height: 72, mt: 1, mx: -0.5 }}>
        {empty ? (
          // An empty panel says so in words. Padding it with a flat line at some
          // default would draw a trend the user never played.
          <Box sx={{ height: "100%", display: "flex", alignItems: "center" }}>
            <Typography
              sx={{ color: "rgba(255,255,255,0.35)", fontSize: "0.78rem" }}
            >
              No rated {PERF_LABEL[trend.perf].toLowerCase()} games this year.
            </Typography>
          </Box>
        ) : single ? (
          <Box sx={{ height: "100%", display: "flex", alignItems: "center" }}>
            <Typography
              sx={{ color: "rgba(255,255,255,0.35)", fontSize: "0.78rem" }}
            >
              One data point so far — play again to see a trend.
            </Typography>
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
            >
              <defs>
                <linearGradient
                  id={`grad-${trend.perf}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={EMBER} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={EMBER} stopOpacity={0} />
                </linearGradient>
              </defs>
              {/* Axes are present for scale but recessive — the shape is the
                  message. The x axis MUST be a time scale: recharts defaults
                  `dataKey` to a CATEGORY axis, which spaces points evenly by
                  index. History is one point per day and the forecast is eight
                  points across months, so on a category axis a 7-month
                  projection rendered in about an eighth of the panel while two
                  months of history filled the rest — the forecast looked like a
                  last-minute flick instead of the bulk of the timeline. Every
                  unit test still passed; it is only wrong once you look. */}
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                hide
              />
              <YAxis domain={[lo, hi]} hide />
              <Tooltip
                cursor={{ stroke: EMBER_SOFT, strokeWidth: 1 }}
                contentStyle={{
                  background: "rgba(12,14,20,0.96)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 10,
                  fontSize: 12,
                }}
                labelFormatter={(t) => new Date(Number(t)).toLocaleDateString()}
                formatter={(v: number, name: string) => [
                  v,
                  name === "projected"
                    ? `${PERF_LABEL[trend.perf]} (projected)`
                    : PERF_LABEL[trend.perf],
                ]}
              />
              <Area
                type="monotone"
                dataKey="rating"
                stroke={EMBER}
                strokeWidth={2}
                fill={`url(#grad-${trend.perf})`}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: EMBER,
                  stroke: "#0C0E14",
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
              />
              {/* The forecast, DASHED and unfilled. A projection drawn with the
                  same weight as the measurement would claim the same standing
                  as something that actually happened. `connectNulls` is off on
                  purpose — it would bridge the gap by inventing a segment. */}
              {projectedEnd !== undefined && (
                <Area
                  type="monotone"
                  dataKey="projected"
                  stroke={EMBER}
                  strokeWidth={1.75}
                  strokeDasharray="4 4"
                  strokeOpacity={0.75}
                  fill="none"
                  dot={false}
                  activeDot={{
                    r: 3,
                    fill: "#0C0E14",
                    stroke: EMBER,
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              )}
              {/* Where the goal itself sits, so the panel answers "does this
                  control get there" rather than only "which way is it going". */}
              {goalOnThisPanel !== undefined && (
                <ReferenceLine
                  y={goalOnThisPanel}
                  stroke="rgba(255,255,255,0.28)"
                  strokeDasharray="2 4"
                  label={{
                    value: `goal ${goalOnThisPanel}`,
                    position: "insideTopLeft",
                    fill: "rgba(255,255,255,0.45)",
                    fontSize: 10,
                  }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Box>
  );
}

export default function RatingTrends({
  windowDays = 365,
  projection,
}: {
  windowDays?: number;
  /** Omit and the panels show measured history only. */
  projection?: TrendProjection;
}) {
  const { data, loading } = useRatingHistory(windowDays);

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          gap: 1.5,
          flexDirection: { xs: "column", sm: "row" },
        }}
      >
        {[0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            variant="rounded"
            height={148}
            sx={{
              flex: 1,
              bgcolor: "rgba(255,255,255,0.04)",
              borderRadius: "16px",
            }}
          />
        ))}
      </Box>
    );
  }

  // No linked account is not an error — it is a prompt with an obvious next step.
  if (!data || data.status === "no_username") {
    return (
      <Box
        sx={{
          p: 2,
          borderRadius: "16px",
          background: "rgba(255,255,255,0.03)",
          border: "1px dashed rgba(255,255,255,0.12)",
        }}
      >
        <Typography
          sx={{
            color: "rgba(255,255,255,0.7)",
            fontSize: "0.9rem",
            fontWeight: 600,
          }}
        >
          Track your rating over time
        </Typography>
        <Typography
          sx={{ color: "rgba(255,255,255,0.45)", fontSize: "0.82rem", mt: 0.5 }}
        >
          Add your Lichess or Chess.com username in Profile → Chess and your
          bullet, blitz and rapid trends appear here.
        </Typography>
      </Box>
    );
  }

  if (data.status === "unavailable") {
    return (
      <Typography sx={{ color: "rgba(255,255,255,0.45)", fontSize: "0.82rem" }}>
        {data.message}
      </Typography>
    );
  }

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 1.25 }}>
        <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: "1rem" }}>
          Your rating trend
        </Typography>
        <Typography
          sx={{ color: "rgba(255,255,255,0.4)", fontSize: "0.78rem" }}
        >
          last {Math.round(data.windowDays / 30)} months ·{" "}
          {data.platform === "lichess" ? "Lichess" : "Chess.com"}
        </Typography>
      </Box>

      {/* Says in words what the dashes mean. A forecast a reader mistakes for
          history is worse than no forecast, and dash-vs-solid alone does not
          survive a glance on a 72px panel. */}
      {projection && (
        <Typography
          sx={{
            color: "rgba(255,255,255,0.4)",
            fontSize: "0.76rem",
            mt: -0.5,
            mb: 1.25,
          }}
        >
          Dashed = where each control could reach by{" "}
          {formatTargetDate(projection.targetDateMs)} at your current schedule.
          An estimate from typical improvement rates, not a promise.
        </Typography>
      )}
      {/* Why there is no forecast. Without it the panels simply render less and
          look identical to a broken chart — the reader cannot tell "you have
          not set a goal" from "this feature is not working", and the one thing
          they could do about it goes unsaid.

          This lived inside <AreaChart> until it was looked at on a screen. A
          <p> nested in an <svg> is not rendered by any browser, so the line
          existed in the bundle, passed review, and was never once visible. */}
      {!projection && (
        <Typography
          sx={{
            color: "rgba(255,255,255,0.4)",
            fontSize: "0.76rem",
            mt: -0.5,
            mb: 1.25,
          }}
        >
          Set a goal above and these extend to your target date.
        </Typography>
      )}
      <Box
        sx={{
          display: "flex",
          gap: 1.5,
          flexDirection: { xs: "column", sm: "row" },
        }}
      >
        {data.trends.map((t) => (
          <TrendPanel key={t.perf} trend={t} projection={projection} />
        ))}
      </Box>
    </Box>
  );
}
