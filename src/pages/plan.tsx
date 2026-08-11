"use client";

import { useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Box, Button, Typography } from "@mui/material";
import { useAtomValue } from "jotai";
import { Flame, Play, RotateCcw, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { puzzleStatsAtom } from "@/lib/puzzleRating";
import { streakAtom } from "@/lib/curriculum/streak";
import { puzzleThemeSrsAtom, dueThemes } from "@/lib/curriculum/puzzleThemeSrs";
import {
  buildDailySession,
  type TimeCommitment,
} from "@/lib/curriculum/dailyPlan";
import { buildWeekPlan, type DayPlan } from "@/lib/curriculum/weekPlan";
import { puzzleResumeAtom, isResumeFresh } from "@/lib/curriculum/resume";
import { bandLabel } from "@/components/onboarding/quizConfig";
import { FOCUS_THEME_LABELS } from "@/components/onboarding/quizThemes";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";
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
  const resume = useAtomValue(puzzleResumeAtom);
  const [inSession, setInSession] = useState(false);

  const nowMs = Date.now();

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
      }),
    [profile, stats, srs, nowMs],
  );

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
              onStart={() => setInSession(true)}
            />
          ))}
        </Box>
      </Box>

      {/* Today's training */}
      <GlassCard highlight>
        <Typography
          sx={{ color: "#fff", fontWeight: 700, fontSize: "1.2rem", mb: 0.5 }}
        >
          Today&apos;s training
        </Typography>
        <Typography
          sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.9rem", mb: 2 }}
        >
          {plan.totalPuzzles} puzzles
          {plan.newThemes.length > 0
            ? ` · ${Array.from(new Set(plan.newThemes)).map(themeLabel).join(", ")}`
            : ""}
          {plan.reviewThemes.length > 0
            ? ` · ${plan.reviewThemes.length} reviews`
            : ""}
        </Typography>
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

function DayCell({ day, onStart }: { day: DayPlan; onStart: () => void }) {
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
        background: day.isToday
          ? "linear-gradient(180deg, rgba(249,115,22,0.16), rgba(249,115,22,0.04))"
          : "rgba(255,255,255,0.03)",
        border: day.isToday
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
          color: day.isToday ? "#FFD1A8" : "rgba(255,255,255,0.45)",
        }}
      >
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
