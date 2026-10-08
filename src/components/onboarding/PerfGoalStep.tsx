"use client";

import { useEffect, useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { AlertTriangle, CalendarDays } from "lucide-react";
import PerfGoalFields from "@/components/goals/PerfGoalFields";
import {
  buildPerfGoalPatch,
  GOAL_PERFS,
  type GoalPerf,
} from "@/lib/curriculum/goalPatch";
import {
  anyPerfGoalSet,
  pacePerfGoals,
  parsePerfDrafts,
  perfDraftErrors,
  practiceMinutesLabel,
  type PerfDraftFields,
  type PerfDrafts,
} from "@/lib/curriculum/perfGoalDrafts";
import { formatTargetDate } from "@/lib/curriculum/improvementModel";
import type { TimeCommitment } from "@/lib/curriculum/timeCommitment";
import type { Platform } from "@/lib/rating/platformRatings";
import type { QuizRating } from "./useQuizCurrentRating";

/**
 * "Where do you want each time control to be?" — the goal question for a
 * player whose ratings we can actually read.
 *
 * It is the same form /profile offers, over the same rules
 * (lib/curriculum/perfGoalDrafts.ts) and the same builder, because it is the
 * same question: asking it once at signup and never again was the gap that
 * left every account setting goals from a prompt bolted onto the daily plan.
 *
 * The currents are PREFILLED from the platform lookup the username step
 * already ran, and only for controls with real games behind them — a rapid box
 * seeded from a control the player has never touched would be a number we
 * invented and then attributed to their account.
 */

const EMBER_BRIGHT = "#FB923C";

interface PerfGoalStepProps {
  drafts: PerfDrafts;
  rating: QuizRating;
  time?: TimeCommitment;
  daysPerWeek?: number;
  onChange: (
    perf: GoalPerf,
    field: keyof PerfDraftFields,
    value: string
  ) => void;
  onSeedCurrents: (
    currents: Partial<Record<GoalPerf, number | undefined>>
  ) => void;
}

export default function PerfGoalStep({
  drafts,
  rating,
  time,
  daysPerWeek,
  onChange,
  onSeedCurrents,
}: PerfGoalStepProps) {
  // Only the three charted controls; classical and daily have no goal card and
  // are not something this product plans around.
  const currents = useMemo(() => {
    const out: Partial<Record<GoalPerf, number>> = {};
    for (const entry of rating.perfs ?? []) {
      if ((GOAL_PERFS as readonly string[]).includes(entry.perf)) {
        out[entry.perf as GoalPerf] = entry.rating;
      }
    }
    return out;
  }, [rating.perfs]);

  useEffect(() => {
    if (Object.keys(currents).length === 0) return;
    onSeedCurrents(currents);
  }, [currents, onSeedCurrents]);

  const errors = useMemo(() => perfDraftErrors(drafts), [drafts]);
  const platform = rating.platform as Platform | undefined;

  const patch = useMemo(
    () =>
      buildPerfGoalPatch({
        drafts: parsePerfDrafts(drafts),
        platform,
        anchorPerf: rating.perf,
        time,
        daysPerWeek,
      }),
    [drafts, platform, rating.perf, time, daysPerWeek]
  );

  const pace = useMemo(
    () => pacePerfGoals({ drafts, platform, time, daysPerWeek }),
    [drafts, platform, time, daysPerWeek]
  );
  const minutesLabel = practiceMinutesLabel(time);

  return (
    <Box>
      {rating.status === "loading" && <Hint>Reading your ratings…</Hint>}
      {/* Absence stays absence: say the lookup came back empty rather than
          leaving three blank boxes that look like our mistake. They can still
          type their own numbers. */}
      {rating.status !== "loading" && Object.keys(currents).length === 0 && (
        <Hint>
          {rating.status === "not_found"
            ? "We couldn't find that account, so fill in your current ratings yourself."
            : rating.status === "no_established_rating"
              ? "No established ratings on that account yet — type in whatever you play at."
              : "We couldn't read your ratings just now. Type them in and we'll take it from there."}
        </Hint>
      )}

      <PerfGoalFields drafts={drafts} errors={errors} onChange={onChange} />

      {/* The promise, computed from the schedule they just gave us. A target
          they could not have earned at their stated pace is exactly the
          promise this product refuses to print. */}
      {patch && (
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            flexWrap: "wrap",
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
              ? `That's a long way at ${minutesLabel} a day, ${daysPerWeek} days a week — we'd rather not promise a date we can't stand behind. Pick a nearer milestone, or carry on and we'll set one as you go.`
              : `Ambitious for ${minutesLabel} a day, ${daysPerWeek} days a week — your sessions will run at the hardest sensible intensity.`}
          </Typography>
        </Box>
      )}

      {!anyPerfGoalSet(drafts) && (
        <Typography
          sx={{ color: "rgba(255,255,255,0.4)", fontSize: "0.78rem", mt: 1.5 }}
        >
          Not sure yet? Skip it — you can set goals any time from your profile.
        </Typography>
      )}
    </Box>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.85rem", mb: 1.5 }}
    >
      {children}
    </Typography>
  );
}
