"use client";

import { useCallback, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Box, Button, Typography } from "@mui/material";
import { useAtomValue } from "jotai";
import {
  BookOpen,
  Check,
  Circle,
  ExternalLink,
  Flame,
  Microscope,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useEnsurePlatformRating } from "@/lib/rating/useEnsurePlatformRating";
import { puzzleStatsAtom } from "@/lib/puzzleRating";
import { streakAtom, dayKey } from "@/lib/curriculum/streak";
import { dailyLogAtom, puzzlesOn, trainedOn } from "@/lib/curriculum/dailyLog";
import { puzzleThemeSrsAtom, dueThemes } from "@/lib/curriculum/puzzleThemeSrs";
import {
  buildDailySession,
  type DailyTask,
  type TimeCommitment,
} from "@/lib/curriculum/dailyPlan";
import { buildWeekPlan, type DayPlan } from "@/lib/curriculum/weekPlan";
import { puzzleResumeAtom, isResumeFresh } from "@/lib/curriculum/resume";
import {
  bandLabel,
  minutesPerDayFor,
} from "@/components/onboarding/quizConfig";
import {
  projectToGoal,
  intensityTier,
} from "@/lib/curriculum/improvementModel";
import { resolveUserRating } from "@/lib/coach/userRating";
import { firstNameOf } from "@/lib/auth/displayIdentity";
import { FOCUS_THEME_LABELS } from "@/components/onboarding/quizThemes";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";
import RatingTrends from "@/components/plan/RatingTrends";
import { CHARTED_PERFS, type ChartedPerf } from "@/lib/rating/ratingHistory";
import GoalProgressCard from "@/components/plan/GoalProgressCard";
import GoalSetterCard from "@/components/plan/GoalSetterCard";
import HandleCard from "@/components/plan/HandleCard";
import EmailCard from "@/components/plan/EmailCard";
import { buildGoalPatch, hasCompleteGoal } from "@/lib/curriculum/goalPatch";
import { NumberTicker } from "@/components/ui/NumberTicker";
import SessionRunner from "@/components/curriculum/SessionRunner";
import CurriculumMap from "@/components/curriculum/CurriculumMap";
import GoalsCard from "@/components/curriculum/GoalsCard";
import ConceptLessonCard from "@/components/curriculum/ConceptLessonCard";
import OpeningLineCard from "@/components/plan/OpeningLineCard";
import { useRepertoireHole } from "@/lib/learn/useRepertoireHole";
import { formatLine } from "@/lib/learn/repertoireHole";

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
  const { user, profile, updateProfile, refresh } = useAuth();
  // Open when they ask to change an existing goal. A user with no goal at
  // all gets the setter unconditionally — see the mount below.
  const [editingGoal, setEditingGoal] = useState(false);

  // MUST match GoalProgressCard's own bail-out condition exactly. If this says
  // "has a goal" where the card says "not enough to render one", the user gets
  // neither the progress card nor the setter — a blank space with no way out.
  // Hence the shared predicate rather than two hand-written checks.
  const hasGoal = hasCompleteGoal(profile);

  const handleSaveGoal = useCallback(
    async (patch: ReturnType<typeof buildGoalPatch>) => {
      if (!patch) return;
      await updateProfile(patch);
      setEditingGoal(false);
    },
    [updateProfile]
  );
  // Without this the goal is scored against the puzzle rating's 1200 default
  // for anyone who never opened the profile dialog.
  useEnsurePlatformRating(profile, refresh);
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
   * The rating the GOAL is measured against.
   *
   * `stats.rating` is the PUZZLE rating and defaults to 1200 for anyone who has
   * not solved any — it is not the player's chess rating. Feeding it to the
   * goal cards compared a target anchored to a real 1650 against a puzzle 1200
   * and reported the user as hundreds of points behind on day one. The goal is
   * set from the platform rating, so it has to be judged against the same
   * scale; the puzzle rating is only the fallback when nothing better exists.
   */
  const goalCurrentRating =
    resolveUserRating(profile ?? undefined) ?? stats.rating;

  /**
   * What the trend panels extend toward. Undefined unless a goal AND the
   * schedule it was made against both exist — a forecast drawn to a target the
   * user never set, or at a cadence they never agreed to, is a number we made
   * up and drew a line to.
   */
  const trendProjection = useMemo(() => {
    const targetDateMs = profile?.goalTargetDate;
    const goalRating = profile?.goalRating;
    const minutesPerDay = minutesPerDayFor(
      profile?.dailyTimeCommitment as TimeCommitment | undefined
    );
    const daysPerWeek = profile?.practiceDaysPerWeek;
    if (!targetDateMs || !goalRating || !minutesPerDay || !daysPerWeek) {
      return undefined;
    }
    // A target date already in the past would draw a forecast backwards.
    if (targetDateMs <= nowMs) return undefined;
    // Which control the goal is about. `platformRatingPerf` can also be
    // `classical`, which has no panel — then no goal line is drawn anywhere,
    // which is the honest answer rather than putting it on all three.
    const perf = profile?.platformRatingPerf;
    const goalPerf = (CHARTED_PERFS as readonly string[]).includes(perf ?? "")
      ? (perf as ChartedPerf)
      : undefined;
    return { targetDateMs, goalRating, minutesPerDay, daysPerWeek, goalPerf };
  }, [profile, nowMs]);

  /**
   * How stretching the user's goal is for the schedule they signed up to.
   * Undefined goal or schedule resolves to "steady" — the plan never escalates
   * off the back of a number the user never gave us.
   */
  const goalIntensityTier = useMemo(() => {
    const goal = profile?.goalRating;
    const current = goalCurrentRating;
    const minutes = minutesPerDayFor(
      profile?.dailyTimeCommitment as TimeCommitment | undefined
    );
    const days = profile?.practiceDaysPerWeek;
    if (!goal || !minutes || !days) return "steady" as const;
    return intensityTier(
      projectToGoal({
        currentRating: current,
        goalRating: goal,
        minutesPerDay: minutes,
        daysPerWeek: days,
      }).intensity
    );
  }, [profile, goalCurrentRating]);

  // Which archive to read. chess.com first only because it is the account most
  // of these users link; either one answers the same question.
  const repertoireAccount = useMemo(() => {
    if (profile?.chesscomUsername)
      return { platform: "chess.com" as const, username: profile.chesscomUsername };
    if (profile?.lichessUsername)
      return { platform: "lichess" as const, username: profile.lichessUsername };
    return { platform: "chess.com" as const, username: null };
  }, [profile?.chesscomUsername, profile?.lichessUsername]);

  const repertoire = useRepertoireHole(repertoireAccount);

  // The daily planner is pure and cannot go and measure this itself, so the
  // measured line is handed to it. Undefined means "not measured yet", which is
  // not the same as "nothing wrong" — the planner keeps its generic task.
  const openingLine = useMemo(
    () =>
      repertoire.line
        ? {
            line: formatLine(repertoire.line.line, repertoire.line.color),
            score: repertoire.line.score,
            baseline: repertoire.line.baseline,
            games: repertoire.line.games,
            betterMove: repertoire.line.betterMove,
          }
        : undefined,
    [repertoire.line]
  );

  const plan = useMemo(
    () =>
      buildDailySession({
        dailyTimeCommitment: profile?.dailyTimeCommitment as
          | TimeCommitment
          | undefined,
        focusThemes: profile?.focusThemes,
        measuredWeaknesses: profile?.measuredWeaknesses,
        liveRating: stats.rating,
        stats,
        dueReviewThemes: dueThemes(srs, nowMs),
        // A goal further ahead than the stated schedule comfortably supports
        // turns the daily session up — within the 1.5x cap. No goal set means
        // "steady", never a silent escalation.
        intensityTier: goalIntensityTier,
        // Game review is only offered when we can actually reach their games.
        hasLinkedAccount: Boolean(
          profile?.lichessUsername || profile?.chesscomUsername
        ),
        wantsOpenings: profile?.studyGoals?.includes("openings"),
        // Their own worst line, when we have measured one.
        openingLine,
        // Day number, so the secondary task rotates rather than being the same
        // one every day at the budgets where only one fits.
        dayIndex: Math.floor(nowMs / 86_400_000),
      }),
    [profile, stats, srs, nowMs, goalIntensityTier, openingLine]
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
        nowMs
      ),
    [stats, srs, profile, nowMs]
  );

  const hasPlacement = typeof profile?.measuredRating === "number";
  // The handle wins here — it is the name they chose, and it is what the sign
  // -in form now accepts. `addressAs` owns that precedence for every surface.
  const firstName = firstNameOf(profile ?? undefined, "there");
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

      {/* Existing accounts predate handles and the quiz is one-time, so
          without this the feature would only ever reach new signups. */}
      {user && (
        <>
          <HandleCard currentHandle={profile?.handle} onClaimed={refresh} />

          {/* Above the goal card on purpose: an account you cannot recover is
              a worse problem than a goal you have not set. */}
          <EmailCard
            currentEmail={profile?.email}
            hasPassword={profile?.hasPassword ?? false}
            onSaved={refresh}
          />
        </>
      )}

      {/* The promise, and whether they're keeping to it — or the means to make
          one. A signed-in user with no goal gets the setter: the quiz is
          one-time by design and was the only place goals were collected, so
          without this every existing account is permanently unable to set one
          and the progress card can never appear for them. */}
      {user &&
        (hasGoal ? (
          <>
            <GoalProgressCard
              goalRating={profile?.goalRating}
              goalStartRating={profile?.goalStartRating}
              goalSetAt={profile?.goalSetAt}
              goalTargetDate={profile?.goalTargetDate}
              dailyTimeCommitment={
                profile?.dailyTimeCommitment as TimeCommitment | undefined
              }
              practiceDaysPerWeek={profile?.practiceDaysPerWeek}
              currentRating={goalCurrentRating}
            />
            {editingGoal ? (
              <GoalSetterCard
                currentRating={goalCurrentRating}
                initialTime={
                  profile?.dailyTimeCommitment as TimeCommitment | undefined
                }
                initialDaysPerWeek={profile?.practiceDaysPerWeek}
                onSave={handleSaveGoal}
                onCancel={() => setEditingGoal(false)}
              />
            ) : (
              <Box sx={{ mt: -1.5, mb: 2.5, textAlign: "right" }}>
                <Button
                  onClick={() => setEditingGoal(true)}
                  sx={{
                    textTransform: "none",
                    fontSize: "0.75rem",
                    color: "rgba(255,255,255,0.45)",
                  }}
                >
                  Change goal
                </Button>
              </Box>
            )}
          </>
        ) : (
          <GoalSetterCard
            currentRating={goalCurrentRating}
            initialTime={
              profile?.dailyTimeCommitment as TimeCommitment | undefined
            }
            initialDaysPerWeek={profile?.practiceDaysPerWeek}
            onSave={handleSaveGoal}
          />
        ))}

      {/* Bullet / blitz / rapid trends, read from the linked platform account.
          Self-gating: renders a prompt when no username is linked. */}
      <Box sx={{ mb: 2.5 }}>
        <RatingTrends projection={trendProjection} />
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

          {/* Analysis and theory. Rendered WITHOUT a completion circle: we do
              not observe whether they were done, and an unticked box the user
              can never tick reads as a chore they are failing. */}
          {plan.tasks
            .filter((t) => t.kind === "analyze" || t.kind === "theory")
            .map((t) => (
              <SecondaryTaskRow key={t.kind} task={t} />
            ))}
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
        <OpeningLineCard
          phase={repertoire.phase}
          label={repertoire.label}
          reports={repertoire.reports}
          line={repertoire.line}
          error={repertoire.error}
          cachedAt={repertoire.cachedAt}
          username={repertoireAccount.username}
          onRun={repertoire.run}
        />
      </GlassCard>

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

function SecondaryTaskRow({ task }: { task: DailyTask }) {
  const Icon = task.kind === "analyze" ? Microscope : BookOpen;
  return (
    <Box
      component="a"
      href={task.href}
      {...(task.external
        ? // noopener/noreferrer because target=_blank otherwise hands the
          // opened page a reference back to ours via window.opener.
          { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 1.25,
        py: 0.85,
        textDecoration: "none",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        "&:last-of-type": { borderBottom: "none" },
        "&:hover .task-label": { color: "#fff" },
      }}
    >
      <Box sx={{ mt: "2px", flexShrink: 0 }}>
        <Icon size={18} color="#FB923C" strokeWidth={2} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Typography
            className="task-label"
            sx={{
              color: "rgba(255,255,255,0.85)",
              fontSize: "0.92rem",
              fontWeight: 600,
            }}
          >
            {task.label}
          </Typography>
          <Typography
            sx={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem" }}
          >
            ~{task.minutes} min
          </Typography>
          {task.external && (
            <ExternalLink size={12} color="rgba(255,255,255,0.35)" />
          )}
        </Box>
        <Typography
          sx={{
            color: "rgba(255,255,255,0.45)",
            fontSize: "0.78rem",
            mt: 0.25,
          }}
        >
          {task.detail}
        </Typography>
      </Box>
    </Box>
  );
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
      <Typography sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.66rem" }}>
        puzzles
      </Typography>
      <Box sx={{ flex: 1 }} />
      <Typography sx={{ color: "rgba(255,255,255,0.42)", fontSize: "0.66rem" }}>
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
    <Box
      sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1, ml: 0.5 }}
    >
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
