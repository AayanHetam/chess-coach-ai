"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { AlertTriangle, CalendarDays, Target } from "lucide-react";
import {
  FREQUENCY_OPTIONS,
  TIME_OPTIONS,
  minutesPerDayFor,
  type TimeCommitment,
} from "@/components/onboarding/quizConfig";
import {
  GOAL_PERFS,
  MAX_PERF_GOAL,
  MAX_PERF_START,
  MIN_PERF_GOAL,
  buildPerfGoalPatch,
  type GoalPatch,
  type GoalPerf,
  type PerfGoals,
} from "@/lib/curriculum/goalPatch";
import {
  formatTargetDate,
  intensityTier,
  projectToGoal,
} from "@/lib/curriculum/improvementModel";
import { normalizeRating, type Platform } from "@/lib/rating/platformRatings";
import { useRatingHistory } from "@/lib/rating/useRatingHistory";

/**
 * Setting a goal from /plan — control by control.
 *
 * The quiz is deliberately one-time (Aayan, 2026-08-14: retaking "shouldn't
 * even be an option") and asks for ONE number. This is the fuller door: your
 * current and goal rating for each of bullet, blitz and rapid, in the
 * platform's own numbers, with the current side prefilled from the linked
 * account. Modelled on the study-plan setters test-prep products use — a
 * current/goal pair per section, the gain as a chip, and a bar that shows the
 * distance — because "where are you, where do you want to be" per control is
 * a clearer promise than one abstract number.
 *
 * It writes through buildPerfGoalPatch → buildGoalPatch, the same builder the
 * quiz uses. Two hand-rolled copies of that arithmetic is exactly what
 * produced the bug the goal cards exist to make visible.
 */

const EMBER = "#F97316";
const EMBER_BRIGHT = "#FB923C";

const PERF_LABEL: Record<GoalPerf, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
};

interface DraftField {
  start: string;
  goal: string;
}

type Drafts = Record<GoalPerf, DraftField>;

function emptyDrafts(): Drafts {
  return {
    bullet: { start: "", goal: "" },
    blitz: { start: "", goal: "" },
    rapid: { start: "", goal: "" },
  };
}

/** "" → undefined; anything non-numeric → NaN, which the builder refuses. */
function parseField(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return Number(trimmed);
}

/** The inline complaint for one card, or null when the card is fine. */
function cardError(draft: DraftField): string | null {
  const start = parseField(draft.start);
  const goal = parseField(draft.goal);
  if (goal === undefined) return null; // not participating — never an error
  if (start === undefined)
    return "Add your current rating to anchor this goal.";
  if (!Number.isFinite(start) || !Number.isFinite(goal))
    return "Ratings are plain numbers, like 1500.";
  if (start < MIN_PERF_GOAL || start > MAX_PERF_START)
    return `Current rating should be between ${MIN_PERF_GOAL} and ${MAX_PERF_START}.`;
  if (goal < MIN_PERF_GOAL || goal > MAX_PERF_GOAL)
    return `Goals go up to ${MAX_PERF_GOAL} here.`;
  if (goal <= start) return `Set a goal above ${start} to aim upward.`;
  return null;
}

interface GoalSetterCardProps {
  /** The control the stored platform rating came from (may be "classical"). */
  anchorPerf?: string;
  /** Scale of the numbers when nothing fresher is known from the history. */
  platform?: Platform;
  /** Existing per-control goals, seeded when changing a goal. */
  initialPerfGoals?: PerfGoals;
  initialTime?: TimeCommitment;
  initialDaysPerWeek?: number;
  onSave: (patch: GoalPatch | null) => Promise<void> | void;
  onCancel?: () => void;
}

export default function GoalSetterCard({
  anchorPerf,
  platform,
  initialPerfGoals,
  initialTime,
  initialDaysPerWeek,
  onSave,
  onCancel,
}: GoalSetterCardProps) {
  const [drafts, setDrafts] = useState<Drafts>(() => {
    const d = emptyDrafts();
    for (const perf of GOAL_PERFS) {
      const existing = initialPerfGoals?.[perf];
      if (existing) {
        d[perf] = { start: String(existing.start), goal: String(existing.goal) };
      }
    }
    return d;
  });
  const [time, setTime] = useState<TimeCommitment | undefined>(initialTime);
  const [daysPerWeek, setDaysPerWeek] = useState<number | undefined>(
    initialDaysPerWeek
  );
  const [saving, setSaving] = useState(false);

  // Live per-control ratings from the linked account — the same response the
  // trend panels below render, deduped to one request by useRatingHistory.
  const { data: history } = useRatingHistory(365);

  // Prefill the CURRENT side from the platform once it arrives — but never
  // over a number the user (or the stored goal) already put there. The current
  // rating is theirs to correct; we only save them the typing.
  useEffect(() => {
    if (history?.status !== "ok") return;
    setDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const trend of history.trends) {
        const perf = trend.perf as GoalPerf;
        if (trend.current === undefined) continue;
        if (next[perf].start !== "") continue;
        next[perf] = { ...next[perf], start: String(trend.current) };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [history]);

  const livePlatform: Platform | undefined =
    history?.status === "ok"
      ? (history.platform as Platform)
      : platform;

  const parsedDrafts = useMemo(() => {
    const out: Partial<Record<GoalPerf, { start?: number; goal?: number }>> =
      {};
    for (const perf of GOAL_PERFS) {
      out[perf] = {
        start: parseField(drafts[perf].start),
        goal: parseField(drafts[perf].goal),
      };
    }
    return out;
  }, [drafts]);

  const patch = useMemo(
    () =>
      buildPerfGoalPatch({
        drafts: parsedDrafts,
        platform: livePlatform,
        anchorPerf,
        time,
        daysPerWeek,
      }),
    [parsedDrafts, livePlatform, anchorPerf, time, daysPerWeek]
  );

  const errors = useMemo(() => {
    const out: Partial<Record<GoalPerf, string>> = {};
    for (const perf of GOAL_PERFS) {
      const e = cardError(drafts[perf]);
      if (e) out[perf] = e;
    }
    return out;
  }, [drafts]);

  const anyParticipating = GOAL_PERFS.some(
    (p) => parseField(drafts[p].goal) !== undefined
  );
  const cardsClean = Object.keys(errors).length === 0;

  /**
   * Pace check per participating control, on the calibration scale. Shown as
   * the amber banner; when the hardest control is flat-out unreachable the
   * builder already refused the patch, so the banner also explains the
   * disabled button rather than leaving it a mystery.
   */
  const pace = useMemo(() => {
    if (!time || !daysPerWeek || !cardsClean || !anyParticipating) return null;
    const minutes = minutesPerDayFor(time);
    if (!minutes) return null;
    const scale = livePlatform ?? "chesscom";
    let unreachable = false;
    let hard = false;
    for (const perf of GOAL_PERFS) {
      const d = parsedDrafts[perf];
      if (d?.goal === undefined || d.start === undefined) continue;
      const projection = projectToGoal({
        currentRating: normalizeRating(d.start, scale),
        goalRating: normalizeRating(d.goal, scale),
        minutesPerDay: minutes,
        daysPerWeek,
      });
      if (projection.status !== "ok") unreachable = true;
      else if (intensityTier(projection.intensity) === "hard") hard = true;
    }
    if (unreachable) return "unreachable" as const;
    if (hard) return "hard" as const;
    return "ok" as const;
  }, [
    time,
    daysPerWeek,
    cardsClean,
    anyParticipating,
    parsedDrafts,
    livePlatform,
  ]);

  // "an hour" reads as the promise the option made; "60 min" reads like a
  // rounding artefact.
  const minutes = time ? minutesPerDayFor(time) : undefined;
  const minutesLabel =
    minutes === undefined
      ? undefined
      : minutes >= 60
      ? "an hour"
      : `${minutes} min`;

  const handleSave = useCallback(async () => {
    if (!patch || saving) return;
    setSaving(true);
    try {
      await onSave(patch);
    } finally {
      setSaving(false);
    }
  }, [patch, saving, onSave]);

  const setField = useCallback(
    (perf: GoalPerf, field: keyof DraftField, value: string) => {
      // Digits only — this is a rating, not free text.
      const clean = value.replace(/[^\d]/g, "").slice(0, 4);
      setDrafts((prev) => ({
        ...prev,
        [perf]: { ...prev[perf], [field]: clean },
      }));
    },
    []
  );

  return (
    <Box
      sx={{
        p: { xs: 2, sm: 2.5 },
        mb: 2.5,
        borderRadius: "16px",
        background: "rgba(249,115,22,0.06)",
        border: "1px solid rgba(249,115,22,0.22)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.25 }}>
        <Target size={16} color={EMBER_BRIGHT} />
        <Typography sx={{ color: "#fff", fontWeight: 800, fontSize: "1.05rem" }}>
          Your rating goals
        </Typography>
      </Box>
      <Typography
        sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.82rem", mb: 1.5 }}
      >
        Where do you want each time control to be? Set a goal on the ones you
        play — leave the rest blank.
      </Typography>

      <FieldLabel>How often can you practise?</FieldLabel>
      <ChoiceRow
        options={FREQUENCY_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
        value={daysPerWeek}
        onPick={(v) => setDaysPerWeek(v as number)}
      />

      <FieldLabel>How long each time?</FieldLabel>
      <ChoiceRow
        options={TIME_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
        value={time}
        onPick={(v) => setTime(v as TimeCommitment)}
      />

      <FieldLabel>Your current and goal ratings</FieldLabel>
      {history?.status === "no_username" && (
        <Typography
          sx={{ color: "rgba(255,255,255,0.45)", fontSize: "0.78rem", mb: 1 }}
        >
          Link a Lichess or Chess.com account above and your current ratings
          fill in by themselves.
        </Typography>
      )}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
        {GOAL_PERFS.map((perf) => (
          <PerfGoalRow
            key={perf}
            perf={perf}
            draft={drafts[perf]}
            error={errors[perf]}
            onChange={(field, value) => setField(perf, field, value)}
          />
        ))}
      </Box>

      {/* The promise, or why there is none yet. The date is COMPUTED from the
          schedule — a target you could not have earned at your stated pace is
          exactly the promise this product refuses to print. */}
      {patch && (
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.75,
            mt: 1.75,
            px: 1.5,
            py: 0.75,
            borderRadius: "999px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <CalendarDays size={14} color={EMBER_BRIGHT} />
          <Typography sx={{ color: "rgba(255,255,255,0.85)", fontSize: "0.82rem", fontWeight: 600 }}>
            Aiming for {formatTargetDate(patch.goalTargetDate)} at this pace
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.4)", fontSize: "0.72rem" }}>
            — an estimate, not a promise
          </Typography>
        </Box>
      )}

      {(pace === "unreachable" || pace === "hard") && (
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 1,
            mt: 1.5,
            p: 1.5,
            borderRadius: "12px",
            background: "rgba(251,191,36,0.08)",
            border: "1px solid rgba(251,191,36,0.3)",
          }}
        >
          <AlertTriangle
            size={16}
            color="#FBBF24"
            style={{ flexShrink: 0, marginTop: 2 }}
          />
          <Typography sx={{ color: "rgba(255,255,255,0.8)", fontSize: "0.8rem" }}>
            {pace === "unreachable"
              ? `This goal might be hard to reach at your pace — your plan is ${minutesLabel} a day, ${daysPerWeek} days a week. Pick a nearer milestone or add practice time.`
              : `This is an ambitious goal for ${minutesLabel} a day, ${daysPerWeek} days a week — your sessions will run at the hardest sensible intensity.`}
          </Typography>
        </Box>
      )}

      <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
        <Button
          variant="contained"
          disabled={!patch || saving}
          onClick={handleSave}
          sx={{
            textTransform: "none",
            fontWeight: 700,
            borderRadius: "12px",
            background: EMBER,
            "&:hover": { background: "#EA580C" },
            "&.Mui-disabled": {
              background: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.35)",
            },
          }}
        >
          {saving ? "Saving…" : "Commit to my goal"}
        </Button>
        {onCancel && (
          <Button
            onClick={onCancel}
            sx={{
              textTransform: "none",
              color: "rgba(255,255,255,0.6)",
              borderRadius: "12px",
            }}
          >
            Cancel
          </Button>
        )}
      </Box>
    </Box>
  );
}

// ─── One control's card ─────────────────────────────────────────────────────

function PerfGoalRow({
  perf,
  draft,
  error,
  onChange,
}: {
  perf: GoalPerf;
  draft: DraftField;
  error?: string;
  onChange: (field: "start" | "goal", value: string) => void;
}) {
  const start = parseField(draft.start);
  const goal = parseField(draft.goal);
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
        borderRadius: "14px",
        background: "rgba(255,255,255,0.03)",
        border: error
          ? "1px solid rgba(251,191,36,0.45)"
          : "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Typography
          sx={{
            color: "rgba(255,255,255,0.65)",
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {PERF_LABEL[perf]}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {gain !== undefined && (
          <Typography
            sx={{
              px: 1,
              py: 0.2,
              borderRadius: "999px",
              fontSize: "0.72rem",
              fontWeight: 700,
              color: EMBER_BRIGHT,
              background: "rgba(249,115,22,0.14)",
              border: "1px solid rgba(249,115,22,0.4)",
            }}
          >
            +{gain} pts
          </Typography>
        )}
      </Box>

      <Box
        sx={{
          display: "flex",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
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
        <Typography sx={{ color: "#FBBF24", fontSize: "0.75rem", mt: 0.75 }}>
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
        borderRadius: "12px",
        background: "rgba(255,255,255,0.04)",
        // Ember as glow, never fill — the goal field carries the accent.
        border: emphasis
          ? "1px solid rgba(249,115,22,0.5)"
          : "1px solid rgba(255,255,255,0.1)",
        boxShadow: emphasis ? "0 0 0 3px rgba(249,115,22,0.10)" : "none",
        transition: "border-color 180ms ease, box-shadow 180ms ease",
        "&:focus-within": {
          borderColor: emphasis ? EMBER_BRIGHT : "rgba(255,255,255,0.3)",
        },
      }}
    >
      <Typography
        sx={{
          color: emphasis ? EMBER_BRIGHT : "rgba(255,255,255,0.55)",
          fontSize: "0.75rem",
          fontWeight: 700,
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
        placeholder="—"
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value)
        }
        sx={{
          all: "unset",
          width: "100%",
          minWidth: "3.5ch",
          color: "#fff",
          fontWeight: 800,
          fontSize: "1.25rem",
          lineHeight: 1.2,
          textAlign: "right",
          "&::placeholder": { color: "rgba(255,255,255,0.25)" },
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
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - lo) / span) * 100));

  const startPct = start !== undefined ? pct(start) : undefined;
  const goalPct =
    goal !== undefined && Number.isFinite(goal) ? pct(goal) : undefined;
  const showBoth =
    startPct !== undefined &&
    goalPct !== undefined &&
    Math.abs(goalPct - startPct) > 14;

  return (
    <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, mt: 1.25 }}>
      <Typography sx={{ color: "rgba(255,255,255,0.35)", fontSize: "0.7rem" }}>
        {lo}
      </Typography>
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
        {/* the journey: hatched ember from current to goal */}
        {startPct !== undefined && goalPct !== undefined && goalPct > startPct && (
          <Box
            sx={{
              position: "absolute",
              left: `${startPct}%`,
              width: `${goalPct - startPct}%`,
              bottom: 6,
              height: 5,
              borderRadius: 3,
              background: `repeating-linear-gradient(45deg, ${EMBER} 0 5px, rgba(249,115,22,0.35) 5px 10px)`,
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
        {/* goal dot, glowing */}
        {goalPct !== undefined && (
          <Box
            sx={{
              position: "absolute",
              left: `${goalPct}%`,
              bottom: 2,
              transform: "translateX(-50%)",
              width: 13,
              height: 13,
              borderRadius: "999px",
              background: EMBER_BRIGHT,
              boxShadow: "0 0 0 4px rgba(249,115,22,0.22)",
            }}
          />
        )}
      </Box>
      <Typography sx={{ color: "rgba(255,255,255,0.35)", fontSize: "0.7rem" }}>
        {hi}
      </Typography>
    </Box>
  );
}

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
        fontSize: "0.66rem",
        fontWeight: 700,
        color: muted ? "rgba(255,255,255,0.45)" : EMBER_BRIGHT,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Typography>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        color: "rgba(255,255,255,0.75)",
        fontSize: "0.8rem",
        fontWeight: 700,
        mt: 1.25,
        mb: 0.75,
      }}
    >
      {children}
    </Typography>
  );
}

function ChoiceRow({
  options,
  value,
  onPick,
}: {
  options: { key: string | number; label: string }[];
  value: string | number | undefined;
  onPick: (v: string | number) => void;
}) {
  return (
    <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Button
            key={String(o.key)}
            onClick={() => onPick(o.key)}
            sx={{
              textTransform: "none",
              fontSize: "0.8rem",
              fontWeight: 600,
              px: 1.5,
              py: 0.5,
              borderRadius: "10px",
              color: active ? "#fff" : "rgba(255,255,255,0.65)",
              background: active
                ? "rgba(249,115,22,0.22)"
                : "rgba(255,255,255,0.05)",
              border: `1px solid ${active ? "rgba(249,115,22,0.5)" : "rgba(255,255,255,0.10)"}`,
              "&:hover": {
                background: active
                  ? "rgba(249,115,22,0.28)"
                  : "rgba(255,255,255,0.09)",
              },
            }}
          >
            {o.label}
          </Button>
        );
      })}
    </Box>
  );
}
