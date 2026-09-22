"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { AlertTriangle, CalendarDays, Target } from "lucide-react";
import {
  FREQUENCY_OPTIONS,
  TIME_OPTIONS,
  type TimeCommitment,
} from "@/components/onboarding/quizConfig";
import PerfGoalFields from "@/components/goals/PerfGoalFields";
import {
  anyPerfGoalSet,
  emptyPerfDrafts,
  pacePerfGoals,
  parsePerfDrafts,
  perfDraftErrors,
  perfDraftsFromGoals,
  practiceMinutesLabel,
  prefillCurrents,
  type PerfDraftFields,
  type PerfDrafts,
} from "@/lib/curriculum/perfGoalDrafts";
import {
  buildPerfGoalPatch,
  type GoalPatch,
  type GoalPerf,
  type PerfGoals,
} from "@/lib/curriculum/goalPatch";
import { formatTargetDate } from "@/lib/curriculum/improvementModel";
import type { Platform } from "@/lib/rating/platformRatings";
import { useRatingHistory } from "@/lib/rating/useRatingHistory";

/**
 * Setting a goal from /profile — control by control.
 *
 * The onboarding quiz asks these questions once, at signup. This is the door
 * back in: /profile is where an account changes its goals afterwards, and
 * where the accounts that predate the question set one for the first time.
 * It lived on /plan until 2026-09-22; /plan is the daily session, not the
 * settings screen, and the setter sat between the user and their plan every
 * visit. GoalProgressCard stayed there — "are you on pace" is plan content,
 * "what is the pace" is profile content.
 *
 * It writes through buildPerfGoalPatch → buildGoalPatch, the same builder the
 * quiz uses, over the same draft rules in lib/curriculum/perfGoalDrafts.ts.
 * Two hand-rolled copies of that arithmetic is exactly what produced the bug
 * the goal cards exist to make visible.
 */

const EMBER = "#F97316";
const EMBER_BRIGHT = "#FB923C";

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
  /** Label for the commit button — "Update" once a goal already exists. */
  saveLabel?: string;
}

export default function GoalSetterCard({
  anchorPerf,
  platform,
  initialPerfGoals,
  initialTime,
  initialDaysPerWeek,
  onSave,
  onCancel,
  saveLabel = "Commit to my goal",
}: GoalSetterCardProps) {
  const [drafts, setDrafts] = useState<PerfDrafts>(() =>
    initialPerfGoals ? perfDraftsFromGoals(initialPerfGoals) : emptyPerfDrafts()
  );
  const [time, setTime] = useState<TimeCommitment | undefined>(initialTime);
  const [daysPerWeek, setDaysPerWeek] = useState<number | undefined>(
    initialDaysPerWeek
  );
  const [saving, setSaving] = useState(false);

  // Live per-control ratings from the linked account — the same response the
  // trend panels render, deduped to one request by useRatingHistory.
  const { data: history } = useRatingHistory(365);

  // Prefill the CURRENT side from the platform once it arrives — but never
  // over a number the user (or the stored goal) already put there.
  useEffect(() => {
    if (history?.status !== "ok") return;
    const currents: Partial<Record<GoalPerf, number | undefined>> = {};
    for (const trend of history.trends) {
      currents[trend.perf as GoalPerf] = trend.current;
    }
    setDrafts((prev) => prefillCurrents(prev, currents));
  }, [history]);

  const livePlatform: Platform | undefined =
    history?.status === "ok" ? (history.platform as Platform) : platform;

  const patch = useMemo(
    () =>
      buildPerfGoalPatch({
        drafts: parsePerfDrafts(drafts),
        platform: livePlatform,
        anchorPerf,
        time,
        daysPerWeek,
      }),
    [drafts, livePlatform, anchorPerf, time, daysPerWeek]
  );

  const errors = useMemo(() => perfDraftErrors(drafts), [drafts]);

  /**
   * Pace check per participating control, on the calibration scale. Shown as
   * the amber banner; when the hardest control is flat-out unreachable the
   * builder already refused the patch, so the banner also explains the
   * disabled button rather than leaving it a mystery.
   */
  const pace = useMemo(
    () => pacePerfGoals({ drafts, platform: livePlatform, time, daysPerWeek }),
    [drafts, livePlatform, time, daysPerWeek]
  );
  const minutesLabel = practiceMinutesLabel(time);

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
    (perf: GoalPerf, field: keyof PerfDraftFields, value: string) => {
      setDrafts((prev) => ({
        ...prev,
        [perf]: { ...prev[perf], [field]: value },
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
        <Typography
          sx={{ color: "#fff", fontWeight: 800, fontSize: "1.05rem" }}
        >
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
          Link a Lichess or Chess.com account in Settings → Chess and your
          current ratings fill in by themselves.
        </Typography>
      )}
      <PerfGoalFields drafts={drafts} errors={errors} onChange={setField} />

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
          <Typography
            sx={{
              color: "rgba(255,255,255,0.85)",
              fontSize: "0.82rem",
              fontWeight: 600,
            }}
          >
            Aiming for {formatTargetDate(patch.goalTargetDate)} at this pace
          </Typography>
          <Typography
            sx={{ color: "rgba(255,255,255,0.4)", fontSize: "0.72rem" }}
          >
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
          <Typography
            sx={{ color: "rgba(255,255,255,0.8)", fontSize: "0.8rem" }}
          >
            {pace === "unreachable"
              ? `This goal might be hard to reach at your pace — your plan is ${minutesLabel} a day, ${daysPerWeek} days a week. Pick a nearer milestone or add practice time.`
              : `This is an ambitious goal for ${minutesLabel} a day, ${daysPerWeek} days a week — your sessions will run at the hardest sensible intensity.`}
          </Typography>
        </Box>
      )}

      {/* A goal typed with no schedule behind it builds no patch and no date,
          so the button is dead with nothing on screen to say why. */}
      {!patch && anyPerfGoalSet(drafts) && (!time || !daysPerWeek) && (
        <Typography
          sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.78rem", mt: 1.5 }}
        >
          Pick how often and how long you practise — the date is worked out from
          your schedule, so there is nothing to promise without it.
        </Typography>
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
          {saving ? "Saving…" : saveLabel}
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
