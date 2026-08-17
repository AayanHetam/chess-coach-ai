"use client";

import { useCallback, useMemo, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { Target } from "lucide-react";
import GoalRatingPicker from "@/components/onboarding/GoalRatingPicker";
import {
  FREQUENCY_OPTIONS,
  TIME_OPTIONS,
  minutesPerDayFor,
  type TimeCommitment,
} from "@/components/onboarding/quizConfig";
import { buildGoalPatch } from "@/lib/curriculum/goalPatch";

/**
 * Setting a goal from /plan, for everyone the quiz can no longer reach.
 *
 * The quiz is deliberately one-time (Aayan, 2026-08-14: retaking "shouldn't
 * even be an option"), and it was the only place a goal was ever collected. So
 * every account created before the goal step shipped — which is all of them —
 * could never acquire one, and GoalProgressCard correctly rendered nothing
 * forever. This is the other door: it edits one setting rather than replaying
 * eight questions, so the one-time rule stands.
 *
 * It writes through buildGoalPatch, the same builder the quiz uses. Two
 * hand-rolled copies of that arithmetic is exactly what produced the bug this
 * card exists to make visible.
 */

interface GoalSetterCardProps {
  currentRating?: number;
  /** Seeded from the profile when changing an existing goal. */
  initialTime?: TimeCommitment;
  initialDaysPerWeek?: number;
  onSave: (patch: ReturnType<typeof buildGoalPatch>) => Promise<void> | void;
  onCancel?: () => void;
}

export default function GoalSetterCard({
  currentRating,
  initialTime,
  initialDaysPerWeek,
  onSave,
  onCancel,
}: GoalSetterCardProps) {
  const [goalRating, setGoalRating] = useState<number | undefined>(undefined);
  const [time, setTime] = useState<TimeCommitment | undefined>(initialTime);
  const [daysPerWeek, setDaysPerWeek] = useState<number | undefined>(
    initialDaysPerWeek
  );
  const [saving, setSaving] = useState(false);

  const patch = useMemo(
    () => buildGoalPatch({ currentRating, goalRating, time, daysPerWeek }),
    [currentRating, goalRating, time, daysPerWeek]
  );

  const handleSave = useCallback(async () => {
    if (!patch || saving) return;
    setSaving(true);
    try {
      await onSave(patch);
    } finally {
      setSaving(false);
    }
  }, [patch, saving, onSave]);

  return (
    <Box
      sx={{
        p: 2,
        mb: 2.5,
        borderRadius: "16px",
        background: "rgba(249,115,22,0.06)",
        border: "1px solid rgba(249,115,22,0.22)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.25 }}>
        <Target size={16} color="#FB923C" />
        <Typography
          sx={{ color: "#fff", fontWeight: 800, fontSize: "1.05rem" }}
        >
          Set a goal
        </Typography>
      </Box>
      <Typography
        sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.82rem", mb: 1.5 }}
      >
        {currentRating
          ? `You're around ${currentRating} today. Where do you want to be?`
          : "Link a Lichess or Chess.com account above and we can map the route from where you actually are."}
      </Typography>

      {currentRating !== undefined && (
        <>
          <FieldLabel>How often can you practise?</FieldLabel>
          <ChoiceRow
            options={FREQUENCY_OPTIONS.map((o) => ({
              key: o.key,
              label: o.label,
            }))}
            value={daysPerWeek}
            onPick={(v) => setDaysPerWeek(v as number)}
          />

          <FieldLabel>How long each time?</FieldLabel>
          <ChoiceRow
            options={TIME_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
            value={time}
            onPick={(v) => setTime(v as TimeCommitment)}
          />

          {/* The picker draws the projection itself once a schedule exists.
              Asking for the schedule BEFORE the goal is deliberate and matches
              the quiz: a projection shown before we know the cadence has to
              assume one, and the number it invented read as a promise. */}
          {time && daysPerWeek ? (
            <Box sx={{ mt: 1.5 }}>
              <GoalRatingPicker
                currentRating={currentRating}
                value={goalRating}
                onChange={setGoalRating}
                minutesPerDay={minutesPerDayFor(time)}
                daysPerWeek={daysPerWeek}
                ratingStatus="ok"
              />
            </Box>
          ) : (
            <Typography
              sx={{
                color: "rgba(255,255,255,0.4)",
                fontSize: "0.78rem",
                mt: 1.5,
              }}
            >
              Pick a cadence and we&apos;ll plot the route.
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
                background: "#F97316",
                "&:hover": { background: "#EA580C" },
                "&.Mui-disabled": {
                  background: "rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.35)",
                },
              }}
            >
              {saving ? "Saving…" : "Set goal"}
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
        </>
      )}
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
