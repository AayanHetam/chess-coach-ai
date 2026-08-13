"use client";

import { useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Box, Button, Typography } from "@mui/material";
import { useAtomValue } from "jotai";
import { Check, Circle, Flame, Play, RotateCcw, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { puzzleStatsAtom } from "@/lib/puzzleRating";
import { streakAtom, dayKey } from "@/lib/curriculum/streak";
import { dailyLogAtom, puzzlesOn, trainedOn } from "@/lib/curriculum/dailyLog";
import { puzzleThemeSrsAtom, dueThemes } from "@/lib/curriculum/puzzleThemeSrs";
import {
  buildDailySession,
  type TimeCommitment,
} from "@/lib/curriculum/dailyPlan";
import { buildWeekPlan, type DayPlan } from "@/lib/curriculum/weekPlan";
import { puzzleResumeAtom, isResumeFresh } from "@/lib/curriculum/resume";
import { bandLabel, minutesPerDayFor } from "@/components/onboarding/quizConfig";
import { projectToGoal, intensityTier } from "@/lib/curriculum/improvementModel";
import { resolveUserRating } from "@/lib/coach/userRating";
import { FOCUS_THEME_LABELS } from "@/components/onboarding/quizThemes";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";
import RatingTrends from "@/components/plan/RatingTrends";
import { NumberTicker } from "@/components/ui/NumberTicker";
import SessionRunner from "@/components/curriculum/SessionRunner";
import CurriculumMap from "@/components/curriculum/CurriculumMap";
import GoalsCard from "@/components/curriculum/GoalsCard";
import ConceptLessonCard from "@/components/curriculum/ConceptLessonCard";

const ORANGE = "linear-gradient(135deg, #F97316 0%, #EA580C 100%)";
const ORANGE_HOVER = "linear-gradient(135deg, #FB923C 0%, #F97316 100%)";

/** Pretty-print a theme id (kebab) into a label, falling back to title-case. */
function themeLabel(id: string): string {
  const known = (FOCUS_THEME_LABELS as Record<string, string>)[id];
  if (known) return known;
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function GlassCard({
  children,
  highlight,
  onClick,
}: {
  children: React.ReactNode;
  highlight?: boolean;
  onClick?: () => void;
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        p: { xs: 2.5, md: 3 },
        borderRadius: "20px",
        background:
          "linear-gradient(180deg, rgba(20,22,28,0.92) 0%, rgba(12,14,20,0.92) 100%)",
        border: highlight
          ? "1px solid rgba(249,115,22,0.5)"
          : "1px solid rgba(255,255,255,0.08)",
        boxShadow: highlight
          ? "0 0 0 1px rgba(249,115,22,0.15), 0 20px 48px -24px rgba(249,115,22,0.4)"
          : "none",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 180ms ease, box-shadow 180ms ease",
      }}
    >
      {children}
    </Box>
  );
}

export default function PlanPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const stats = useAtomValue(puzzleStatsAtom);
  const streak = useAtomValue(streakAtom);
  const srs = useAtomValue(puzzleThemeSrsAtom);
  const dailyLog = useAtomValue(dailyLogAtom);

  const todayKey = dayKey(new Date());
  const puzzlesToday = puzzlesOn(dailyLog, todayKey);
  const themesToday = dailyLog[todayKey]?.themes ?? [];
  const resume = useAtomValue(puzzleResumeAtom);
  const [inSession, setInSession] = useState(false);

  const nowMs = Date.now();

  /**
   * How stretching the user's goal is for the schedule they signed up to.
   * Undefined goal or schedule resolves to "steady" — the plan never escalates
   * off the back of a number the user never gave us.
   */
  const goalIntensityTier = useMemo(() => {
    const goal = profile?.goalRating;
    const current = resolveUserRating(profile ?? undefined) ?? stats.rating;
    const minutes = minutesPerDayFor(
      profile?.dailyTimeCommitment as TimeCommitment | undefined,
    );
    const days = profile?.practiceDaysPerWeek;
    if (!goal || !minutes || !days) return "steady" as const;
    return intensityTier(
      projectToGoal({
        currentRating: current,
        goalRating: goal,
        minutesPerDay: minutes,
        daysPerWeek: days,
      }).intensity,
    );
  }, [profile, stats.rating]);

  const plan = useMemo(
    () =>
      buildDailySession({
        dailyTimeCommitment: profile?.dailyTimeCommitment as
          | TimeCommitment
          | undefined,
        focusThemes: profile?.focusThemes,
        liveRating: stats.rating,
        stats,
        dueReviewThemes: dueThemes(srs, nowMs),
        // A goal further ahead than the stated schedule comfortably supports
        // turns the daily session up — within the 1.5x cap. No goal set means
        // "steady", never a silent escalation.
        intensityTier: goalIntensityTier,
      }),
    [profile, stats, srs, nowMs, goalIntensityTier],
  );

  // Today's plan as discrete, tickable rows. A theme counts as done once ANY
  // puzzle of that theme has been graded today — on /puzzles as much as in the
  // session runner — so the plan reflects training wherever it happened.
  const todayTasks = useMemo(() => {
    const seen = new Set<string>();
    const rows: { key: string; label: string; done: boolean }[] = [];
    for (const t of plan.newThemes) {
      if (seen.has(t)) continue;
      seen.add(t);
      rows.push({
        key: `new-${t}`,
        label: `Learn ${themeLabel(t)}`,
        done: themesToday.includes(t),
      });
    }
    for (const t of plan.reviewThemes) {
      if (seen.has(t)) continue;
      seen.add(t);
      rows.push({
        key: `rev-${t}`,
        label: `Review ${themeLabel(t)}`,
        done: themesToday.includes(t),
      });
    }
    return rows;
  }, [plan.newThemes, plan.reviewThemes, themesToday]);

  // Falls back to the session size when no explicit goal is set, so the
  // counter always has a meaningful denominator rather than showing "of 0".
  const dailyGoal = profile?.goals?.puzzlesPerDay ?? plan.totalPuzzles ?? 0;
  const goalMet = dailyGoal > 0 && puzzlesToday >= dailyGoal;

  const week = useMemo(
    () =>
      buildWeekPlan(
        {
          stats,
          srs,
          dailyTimeCommitment: profile?.dailyTimeCommitment as
            | TimeCommitment
            | undefined,
          focusThemes: profile?.focusThemes,
          liveRating: stats.rating,
        },
        nowMs,
      ),
    [stats, srs, profile, nowMs],
  );

  const hasPlacement = typeof profile?.measuredRating === "number";
  const firstName = profile?.displayName?.split(" ")[0] || "there";
  const canResume = isResumeFresh(resume, nowMs);

  // Anonymous visitor — point them into the funnel.
  if (!user) {
    return (
      <PlanShell>
        <GlassCard>
          <Typography
            sx={{ color: "#fff", fontWeight: 800, fontSize: "1.5rem", mb: 1 }}
          >
            Your free chess plan
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.6)", mb: 2.5 }}>
            A placement test, a daily calendar, and a coach that adapts to you.
          </Typography>
          <PrimaryButton onClick={() => router.push("/onboarding")}>
            Get started
          </PrimaryButton>
        </GlassCard>
      </PlanShell>
    );
  }

  if (inSession) {
    return (
      <PlanShell>
        <GlassCard>
          <SessionRunner onExit={() => setInSession(false)} />
        </GlassCard>
      </PlanShell>
    );
  }

  return (
    <PlanShell>
      {/* Header — rating + streak + resume */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: 1.5,
        }}
      >
        <Box>
          <Typography
            sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.85rem" }}
          >
            Welcome back,
          </Typography>
          <Typography
            sx={{
              color: "#fff",
              fontWeight: 800,
              fontSize: "1.7rem",
              lineHeight: 1.1,
            }}
          >
            {firstName}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "stretch" }}>
          <StatTile label="Rating" sub={bandLabel(stats.rating)}>
            <NumberTicker value={stats.rating} />
          </StatTile>
          <StatTile label="Streak" sub={`best ${streak.best}`}>
            <Box
              sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
            >
              {streak.current}
              <Flame size={18} color="#FB923C" fill="#FB923C" />
            </Box>
          </StatTile>
        </Box>
      </Box>

      {/* Bullet / blitz / rapid trends, read from the linked platform account.
          Self-gating: renders a prompt when no username is linked. */}
      <Box sx={{ mb: 2.5 }}>
        <RatingTrends />
      </Box>

      {canResume && (
        <GlassCard highlight onClick={() => router.push("/puzzles")}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <RotateCcw size={20} color="#FB923C" />
              <Box>
                <Typography sx={{ color: "#fff", fontWeight: 700 }}>
                  Continue where you left off
                </Typography>
                <Typography
                  sx={{
                    color: "rgba(255,255,255,0.55)",
                    fontSize: "0.82rem",
                  }}
                >
                  Puzzle #{resume?.puzzle.id}
                  {resume?.puzzle.rating ? ` · ${resume.puzzle.rating}` : ""}
                </Typography>
              </Box>
            </Box>
            <Play size={18} color="#FB923C" />
          </Box>
        </GlassCard>
      )}

      {/* Day-1 placement step */}
      {!hasPlacement && (
        <GlassCard highlight>
          <Typography
            sx={{
              color: "#FB923C",
              fontWeight: 700,
              fontSize: "0.75rem",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              mb: 0.5,
            }}
          >
            Step 1
          </Typography>
          <Typography
            sx={{ color: "#fff", fontWeight: 700, fontSize: "1.2rem", mb: 0.5 }}
          >
            Take your placement test
          </Typography>
          <Typography
            sx={{
              color: "rgba(255,255,255,0.6)",
              fontSize: "0.9rem",
              mb: 2,
            }}
          >
            20 quick puzzles set your starting rating and tune every puzzle and
            coaching tip after.
          </Typography>
          <PrimaryButton onClick={() => router.push("/placement")}>
            Start placement (20 puzzles)
          </PrimaryButton>
        </GlassCard>
      )}

      {/* 7-day calendar */}
      <Box>
        <SectionLabel icon={<Sparkles size={13} color="#FFD1A8" />}>
          Your week
        </SectionLabel>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(7, 1fr)" },
            gap: 1,
          }}
        >
          {week.map((day) => (
            <DayCell
              key={day.dayIndex}
              day={day}
              done={trainedOn(dailyLog, dayKeyForIndex(day.dayIndex))}
              onStart={() => setInSession(true)}
            />
          ))}
        </Box>
      </Box>

      {/* Today's training — a task list, not a sentence. Rows tick themselves
          off as the themes get trained on ANY surface, so /puzzles counts
          toward the plan rather than running beside it. */}
      <GlassCard highlight>
        <Box
          sx={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 1,
            mb: 1.5,
            flexWrap: "wrap",
          }}
        >
          <Typography
            sx={{ color: "#fff", fontWeight: 700, fontSize: "1.2rem" }}
          >
            Today&apos;s training
          </Typography>
          <Typography
            sx={{
              color: goalMet ? "#4ade80" : "rgba(255,255,255,0.55)",
              fontWeight: 700,
              fontSize: "0.85rem",
            }}
          >
            {puzzlesToday} of {dailyGoal} puzzles
          </Typography>
        </Box>

        <Box sx={{ mb: 2 }}>
          {todayTasks.length === 0 ? (
            <Typography
              sx={{ color: "rgba(255,255,255,0.55)", fontSize: "0.9rem" }}
            >
              Nothing scheduled — open the puzzle trainer whenever you like.
            </Typography>
          ) : (
            todayTasks.map((task) => (
              <TaskRow key={task.key} label={task.label} done={task.done} />
            ))
          )}
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <PrimaryButton
            onClick={() => setInSession(true)}
            disabled={plan.totalPuzzles === 0}
          >
            Start today&apos;s session
          </PrimaryButton>
          <SecondaryButton onClick={() => router.push("/puzzles")}>
            Open puzzle trainer
          </SecondaryButton>
        </Box>
      </GlassCard>

      {hasPlacement && (
        <GlassCard>
          <ConceptLessonCard />
        </GlassCard>
      )}

      <GlassCard>
        <GoalsCard />
      </GlassCard>

      <GlassCard>
        <CurriculumMap />
      </GlassCard>
    </PlanShell>
  );
}

/** Page chrome: backdrop + nav + centered column. */
function PlanShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Head>
        <title key="title">Your plan — Chess Masti AI</title>
      </Head>
      <GradientBackdrop />
      <Box sx={{ minHeight: "100vh", pt: 2, pb: 6, px: { xs: 2, md: 3 } }}>
        <NavPill active="plan" />
        <Box
          sx={{
            maxWidth: 760,
            mx: "auto",
            mt: 3,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {children}
        </Box>
      </Box>
    </>
  );
}

/** weekPlan day indices are relative to today (0 = today). */
function dayKeyForIndex(dayIndex: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayIndex);
  return dayKey(d);
}

function TaskRow({ label, done }: { label: string; done: boolean }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        py: 0.85,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        "&:last-of-type": { borderBottom: "none" },
      }}
    >
      {done ? (
        <Box
          sx={{
            width: 20,
            height: 20,
            borderRadius: "999px",
            background: "#4ade80",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <Check size={12} color="#0A0907" strokeWidth={3.5} />
        </Box>
      ) : (
        <Circle size={20} color="rgba(255,255,255,0.28)" strokeWidth={2} />
      )}
      <Typography
        sx={{
          fontSize: "0.92rem",
          fontWeight: done ? 500 : 600,
          color: done ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.9)",
          textDecoration: done ? "line-through" : "none",
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

function DayCell({
  day,
  done,
  onStart,
}: {
  day: DayPlan;
  done: boolean;
  onStart: () => void;
}) {
  return (
    <Box
      onClick={day.isToday ? onStart : undefined}
      sx={{
        p: 1.25,
        borderRadius: "14px",
        minHeight: 104,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        cursor: day.isToday ? "pointer" : "default",
        // A trained day reads green whether or not it is today — the grid's
        // whole job is showing what you have actually done, which it could
        // never do before completion was recorded.
        background: done
          ? "linear-gradient(180deg, rgba(74,222,128,0.14), rgba(74,222,128,0.03))"
          : day.isToday
          ? "linear-gradient(180deg, rgba(249,115,22,0.16), rgba(249,115,22,0.04))"
          : "rgba(255,255,255,0.03)",
        border: done
          ? "1px solid rgba(74,222,128,0.45)"
          : day.isToday
          ? "1px solid rgba(249,115,22,0.5)"
          : "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <Typography
        sx={{
          fontSize: "0.68rem",
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: done
            ? "#86efac"
            : day.isToday
            ? "#FFD1A8"
            : "rgba(255,255,255,0.45)",
          display: "flex",
          alignItems: "center",
          gap: 0.5,
        }}
      >
        {done && <Check size={11} strokeWidth={3.5} />}
        {day.isToday ? "Today" : day.weekdayLabel}
      </Typography>
      <Typography sx={{ color: "#fff", fontWeight: 800, fontSize: "1.15rem" }}>
        {day.totalPuzzles}
      </Typography>
      <Typography
        sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.66rem" }}
      >
        puzzles
      </Typography>
      <Box sx={{ flex: 1 }} />
      <Typography
        sx={{ color: "rgba(255,255,255,0.42)", fontSize: "0.66rem" }}
      >
        {day.reviewThemes.length > 0
          ? `${day.reviewThemes.length} review${
              day.reviewThemes.length > 1 ? "s" : ""
            } · ~${day.estMinutes}m`
          : `~${day.estMinutes}m`}
      </Typography>
    </Box>
  );
}

function StatTile({
  label,
  sub,
  children,
}: {
  label: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        textAlign: "center",
        minWidth: 84,
        px: 1.5,
        py: 1,
        borderRadius: "14px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <Typography
        sx={{
          color: "rgba(255,255,255,0.45)",
          fontSize: "0.66rem",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          color: "#fff",
          fontWeight: 800,
          fontSize: "1.4rem",
          lineHeight: 1.15,
        }}
      >
        {children}
      </Typography>
      <Typography sx={{ color: "rgba(255,255,255,0.4)", fontSize: "0.7rem" }}>
        {sub}
      </Typography>
    </Box>
  );
}

function SectionLabel({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1, ml: 0.5 }}>
      {icon}
      <Typography
        sx={{
          fontSize: "0.7rem",
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "rgba(255,240,224,0.6)",
        }}
      >
        {children}
      </Typography>
    </Box>
  );
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      sx={{
        py: 1.3,
        px: 3.5,
        borderRadius: "12px",
        textTransform: "none",
        fontWeight: 700,
        fontSize: "1rem",
        color: "#fff",
        background: ORANGE,
        "&:hover": { background: ORANGE_HOVER },
        "&.Mui-disabled": {
          color: "rgba(255,255,255,0.4)",
          background: "rgba(255,255,255,0.06)",
        },
      }}
    >
      {children}
    </Button>
  );
}

function SecondaryButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      onClick={onClick}
      sx={{
        py: 1.3,
        px: 3,
        borderRadius: "12px",
        textTransform: "none",
        fontWeight: 700,
        fontSize: "0.95rem",
        color: "rgba(255,255,255,0.85)",
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
        "&:hover": {
          background: "rgba(255,255,255,0.09)",
          borderColor: "rgba(249,115,22,0.4)",
        },
      }}
    >
      {children}
    </Button>
  );
}
