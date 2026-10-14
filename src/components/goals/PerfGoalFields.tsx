"use client";

import { Box, Typography } from "@mui/material";
import { GOAL_PERFS, type GoalPerf } from "@/lib/curriculum/goalPatch";
import {
  PERF_LABEL,
  parseRatingField,
  sanitizeRatingInput,
  type PerfDraftFields,
  type PerfDrafts,
} from "@/lib/curriculum/perfGoalDrafts";
import {
  ACCENT,
  LINE,
  MOTION,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

/**
 * "Your current and goal ratings" — bullet, blitz and rapid, each as a
 * current/goal pair with the gain as a chip and a bar that shows the distance.
 *
 * Shared by the onboarding quiz (where new accounts set their goals) and the
 * /profile goal setter (where every account changes them afterwards). It was
 * one screen's private markup until onboarding needed the same question; the
 * rules behind it live in lib/curriculum/perfGoalDrafts.ts so both callers
 * validate identically.
 *
 * Modelled on the study-plan setters test-prep products use — a current/goal
 * pair per section — because "where are you, where do you want to be" per
 * control is a clearer promise than one abstract number.
 */

const EMBER = ACCENT.main;
const EMBER_BRIGHT = ACCENT.hover;

interface PerfGoalFieldsProps {
  drafts: PerfDrafts;
  errors: Partial<Record<GoalPerf, string>>;
  onChange: (
    perf: GoalPerf,
    field: keyof PerfDraftFields,
    value: string
  ) => void;
}

export default function PerfGoalFields({
  drafts,
  errors,
  onChange,
}: PerfGoalFieldsProps) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
      {GOAL_PERFS.map((perf) => (
        <PerfGoalRow
          key={perf}
          perf={perf}
          draft={drafts[perf]}
          error={errors[perf]}
          onChange={(field, value) =>
            onChange(perf, field, sanitizeRatingInput(value))
          }
        />
      ))}
    </Box>
  );
}

// ─── One control's row ──────────────────────────────────────────────────────
// A nested block on whichever card hosts the fields (the quiz card, the
// profile goal setter): one filled level, never a second card.

function PerfGoalRow({
  perf,
  draft,
  error,
  onChange,
}: {
  perf: GoalPerf;
  draft: PerfDraftFields;
  error?: string;
  onChange: (field: keyof PerfDraftFields, value: string) => void;
}) {
  const start = parseRatingField(draft.start);
  const goal = parseRatingField(draft.goal);
  const gain =
    start !== undefined &&
    goal !== undefined &&
    Number.isFinite(start) &&
    Number.isFinite(goal) &&
    goal > start
      ? goal - start
      : undefined;

  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: `${RADIUS.control}px`,
        background: SURFACE.raisedSecondary,
        border: error
          ? `1px solid ${STATUS.error}`
          : `1px solid ${LINE.hairline}`,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Typography sx={{ ...TYPE.label, color: TEXT.secondary }}>
          {PERF_LABEL[perf]}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {gain !== undefined && (
          <Typography
            sx={{
              px: 1,
              py: 0.25,
              minHeight: 24,
              display: "inline-flex",
              alignItems: "center",
              borderRadius: `${RADIUS.small}px`,
              ...TYPE.caption,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              color: EMBER_BRIGHT,
              background: ACCENT.tint,
              border: `1px solid ${ACCENT.border}`,
            }}
          >
            +{gain} pts
          </Typography>
        )}
      </Box>

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <RatingField
          label="Current"
          ariaLabel={`${PERF_LABEL[perf]} current rating`}
          value={draft.start}
          onChange={(v) => onChange("start", v)}
        />
        <RatingField
          label="Goal"
          ariaLabel={`${PERF_LABEL[perf]} goal rating`}
          value={draft.goal}
          onChange={(v) => onChange("goal", v)}
          emphasis
        />
      </Box>

      <JourneyBar start={start} goal={goal} />

      {error && (
        <Typography
          role="alert"
          sx={{ ...TYPE.caption, color: STATUS.error, mt: 0.75 }}
        >
          {error}
        </Typography>
      )}
    </Box>
  );
}

function RatingField({
  label,
  ariaLabel,
  value,
  onChange,
  emphasis,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  emphasis?: boolean;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        flex: "1 1 130px",
        px: 1.25,
        py: 0.75,
        borderRadius: `${RADIUS.control}px`,
        // The row is the filled level; the field is a hairline on it.
        background: "transparent",
        // Ember as a hairline, never a fill: the goal field carries the accent.
        border: emphasis
          ? `1px solid ${ACCENT.border}`
          : `1px solid ${LINE.hairline}`,
        transition: `border-color ${MOTION.hover}`,
        // The input is `all: unset`, so the field shows focus: a white ring,
        // like every other focusable control.
        "&:focus-within": {
          borderColor: emphasis ? EMBER_BRIGHT : LINE.strong,
          outline: "2px solid #FFFFFF",
          outlineOffset: 2,
        },
      }}
    >
      <Typography
        sx={{
          ...TYPE.caption,
          fontWeight: 600,
          color: emphasis ? EMBER_BRIGHT : TEXT.secondary,
        }}
      >
        {label}
      </Typography>
      <Box
        component="input"
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value)
        }
        sx={{
          all: "unset",
          width: "100%",
          minWidth: "3.5ch",
          color: TEXT.primary,
          fontWeight: 600,
          fontSize: TYPE.h4.fontSize,
          lineHeight: 1.2,
          fontVariantNumeric: "tabular-nums",
          textAlign: "right",
        }}
      />
    </Box>
  );
}

/**
 * Current → goal as distance on the rating line — the point of the whole
 * layout: the gain is a stretch of road, not an abstract delta. The window is
 * anchored to the numbers on the card so 1200→1400 does not vanish into an
 * 800-wide fixed scale.
 */
function JourneyBar({ start, goal }: { start?: number; goal?: number }) {
  const values = [start, goal].filter(
    (v): v is number => v !== undefined && Number.isFinite(v) && v > 0
  );
  if (values.length === 0) return null;

  const lo = Math.max(0, Math.floor((Math.min(...values) - 150) / 100) * 100);
  const hi = Math.ceil((Math.max(...values) + 150) / 100) * 100;
  const span = hi - lo || 1;
  const pct = (v: number) =>
    Math.min(100, Math.max(0, ((v - lo) / span) * 100));

  const startPct = start !== undefined ? pct(start) : undefined;
  const goalPct =
    goal !== undefined && Number.isFinite(goal) ? pct(goal) : undefined;
  const showBoth =
    startPct !== undefined &&
    goalPct !== undefined &&
    Math.abs(goalPct - startPct) > 14;

  return (
    <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, mt: 1.25 }}>
      <Typography sx={axisLabelSx}>{lo}</Typography>
      <Box sx={{ flex: 1, position: "relative", height: 26 }}>
        {/* marker labels */}
        {startPct !== undefined && (showBoth || goalPct === undefined) && (
          <MarkerLabel pct={startPct} muted>
            Current
          </MarkerLabel>
        )}
        {goalPct !== undefined && <MarkerLabel pct={goalPct}>Goal</MarkerLabel>}

        {/* track */}
        <Box
          sx={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 6,
            height: 5,
            borderRadius: 3,
            background: "rgba(255,255,255,0.08)",
          }}
        />
        {/* the journey: ember from current to goal */}
        {startPct !== undefined &&
          goalPct !== undefined &&
          goalPct > startPct && (
            <Box
              sx={{
                position: "absolute",
                left: `${startPct}%`,
                width: `${goalPct - startPct}%`,
                bottom: 6,
                height: 5,
                borderRadius: 3,
                background: EMBER,
              }}
            />
          )}
        {/* current tick */}
        {startPct !== undefined && (
          <Box
            sx={{
              position: "absolute",
              left: `${startPct}%`,
              bottom: 3,
              transform: "translateX(-50%)",
              width: 2,
              height: 11,
              borderRadius: 1,
              background: "rgba(255,255,255,0.55)",
            }}
          />
        )}
        {/* goal dot */}
        {goalPct !== undefined && (
          <Box
            sx={{
              position: "absolute",
              left: `${goalPct}%`,
              bottom: 2,
              transform: "translateX(-50%)",
              width: 13,
              height: 13,
              borderRadius: "50%",
              background: EMBER_BRIGHT,
            }}
          />
        )}
      </Box>
      <Typography sx={axisLabelSx}>{hi}</Typography>
    </Box>
  );
}

// The bar's end labels: the 12px floor, readable, numbers aligned.
const axisLabelSx = {
  fontSize: "0.75rem",
  lineHeight: 1.4,
  color: TEXT.secondary,
  fontVariantNumeric: "tabular-nums",
} as const;

function MarkerLabel({
  pct,
  muted,
  children,
}: {
  pct: number;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Typography
      sx={{
        position: "absolute",
        top: 0,
        left: `${pct}%`,
        // Clamp at the edges so the label never escapes the card.
        transform:
          pct < 8
            ? "translateX(0)"
            : pct > 92
              ? "translateX(-100%)"
              : "translateX(-50%)",
        fontSize: "0.75rem",
        lineHeight: 1.4,
        fontWeight: 600,
        color: muted ? TEXT.secondary : EMBER_BRIGHT,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Typography>
  );
}
