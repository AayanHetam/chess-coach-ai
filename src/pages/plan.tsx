"use client";

import { useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Box, Button, Typography } from "@mui/material";
import { useAtomValue } from "jotai";
import {
  BookOpen,
  Check,
  ChevronRight,
  ExternalLink,
  Flame,
  Microscope,
  Play,
  RotateCcw,
  Target,
  Zap,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { MastiAvatar } from "@/components/masti";
import { useDueCourse } from "@/lib/learn/useDueCourse";
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
import { themeAccent, type Accent } from "@/components/ui/accents";
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
import { NavPill } from "@/components/ui/NavPill";
import RatingTrends from "@/components/plan/RatingTrends";
import { CHARTED_PERFS, type ChartedPerf } from "@/lib/rating/ratingHistory";
import GoalProgressCard from "@/components/plan/GoalProgressCard";
import EmailCard from "@/components/plan/EmailCard";
import { hasCompleteGoal } from "@/lib/curriculum/goalPatch";
import { formatTickerValue } from "@/components/ui/formatNumber";
import SessionRunner from "@/components/curriculum/SessionRunner";
import CurriculumMap from "@/components/curriculum/CurriculumMap";
import GoalsCard from "@/components/curriculum/GoalsCard";
import ConceptLessonCard from "@/components/curriculum/ConceptLessonCard";
import OpeningLineCard from "@/components/plan/OpeningLineCard";
import { useRepertoireHole } from "@/lib/learn/useRepertoireHole";
import { formatLine } from "@/lib/learn/repertoireHole";

/** Pretty-print a theme id (kebab) into a label, falling back to title-case. */
function themeLabel(id: string): string {
  const known = (FOCUS_THEME_LABELS as Record<string, string>)[id];
  if (known) return known;
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function PlanCard({
  children,
  highlight,
  onClick,
}: {
  children: React.ReactNode;
  /** The one card asking for the next step wears the accent's hairline. */
  highlight?: boolean;
  onClick?: () => void;
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        position: "relative",
        overflow: "hidden",
        p: { xs: 2.5, md: 3 },
        borderRadius: `${RADIUS.card}px`,
        background: SURFACE.raised,
        border: `1px solid ${highlight ? ACCENT.border : LINE.hairline}`,
        cursor: onClick ? "pointer" : "default",
        transition: `border-color ${MOTION.hover}, background-color ${MOTION.hover}`,
        ...(onClick
          ? {
              "&:hover": { borderColor: LINE.strong },
              "&:active": { background: SURFACE.raisedTertiary },
            }
          : {}),
      }}
    >
      {children}
    </Box>
  );
}

export default function PlanPage() {
  const router = useRouter();
  const { user, profile, refresh, loading: authLoading } = useAuth();

  // MUST match GoalProgressCard's own bail-out condition exactly. If this says
  // "has a goal" where the card says "not enough to render one", the user gets
  // neither the progress card nor the prompt that offers to set one — a blank
  // space with no way out. Hence the shared predicate rather than two
  // hand-written checks.
  const hasGoal = hasCompleteGoal(profile);
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
    // Control-by-control goals, raw numbers — each panel draws its own line.
    const stored = profile?.perfGoals;
    const perfGoals = stored
      ? Object.fromEntries(Object.entries(stored).map(([p, g]) => [p, g.goal]))
      : undefined;
    return {
      targetDateMs,
      goalRating,
      minutesPerDay,
      daysPerWeek,
      goalPerf,
      perfGoals,
    };
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
      return {
        platform: "chess.com" as const,
        username: profile.chesscomUsername,
      };
    if (profile?.lichessUsername)
      return {
        platform: "lichess" as const,
        username: profile.lichessUsername,
      };
    return { platform: "chess.com" as const, username: null };
  }, [profile?.chesscomUsername, profile?.lichessUsername]);

  const repertoire = useRepertoireHole(repertoireAccount);

  // What their courses owe them. Keyed by uid, like the chapter store is — a
  // platform handle would key it to the account they LINKED rather than the
  // one they are signed in as, and a player who links chess.com mid-way would
  // appear to have no reviews at all.
  const dueCourse = useDueCourse(user?.uid ?? "", nowMs);

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
        // What they have already been asked and already got wrong. Outranks
        // the measured line: one is a fact about them, the other a hypothesis.
        dueCourse,
        // Day number, so the secondary task rotates rather than being the same
        // one every day at the budgets where only one fits.
        dayIndex: Math.floor(nowMs / 86_400_000),
      }),
    [profile, stats, srs, nowMs, goalIntensityTier, openingLine, dueCourse]
  );

  // Today's plan as discrete, tickable rows. A theme counts as done once ANY
  // puzzle of that theme has been graded today — on /puzzles as much as in the
  // session runner — so the plan reflects training wherever it happened.
  const todayTasks = useMemo(() => {
    const seen = new Set<string>();
    const rows: {
      key: string;
      label: string;
      done: boolean;
      theme: string;
      kind: "new" | "review";
    }[] = [];
    for (const t of plan.newThemes) {
      if (seen.has(t)) continue;
      seen.add(t);
      rows.push({
        key: `new-${t}`,
        label: `Learn ${themeLabel(t)}`,
        done: themesToday.includes(t),
        theme: t,
        kind: "new",
      });
    }
    for (const t of plan.reviewThemes) {
      if (seen.has(t)) continue;
      seen.add(t);
      rows.push({
        key: `rev-${t}`,
        label: `Review ${themeLabel(t)}`,
        done: themesToday.includes(t),
        theme: t,
        kind: "review",
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
  // No placement and no puzzle attempted: the 1200 in the stats atom is the
  // store's default, not a measurement, and a new account was reading it as
  // "Rating 1200 · Intermediate" before it had solved anything.
  const isUnrated = !hasPlacement && stats.totalAttempts === 0;
  // The handle wins here — it is the name they chose, and it is what the sign
  // -in form now accepts. `addressAs` owns that precedence for every surface.
  // Blank while auth resolves: "there" is the last resort for an account with
  // no handle, name or email, and it was flashing for every account until the
  // profile arrived.
  const firstName = authLoading
    ? ""
    : firstNameOf(profile ?? undefined, "there");
  const canResume = isResumeFresh(resume, nowMs);

  // Anonymous visitor — point them into the funnel.
  if (!user) {
    return (
      <PlanShell>
        <PlanCard>
          <Typography sx={{ ...TYPE.h3, color: TEXT.primary, mb: 1 }}>
            Your free chess plan
          </Typography>
          <Typography sx={{ color: TEXT.secondary, mb: 2.5 }}>
            A placement test, a daily calendar, and a coach that adapts to you.
          </Typography>
          <PrimaryButton onClick={() => router.push("/onboarding")}>
            Build my plan
          </PrimaryButton>
        </PlanCard>
      </PlanShell>
    );
  }

  if (inSession) {
    return (
      <PlanShell>
        <PlanCard>
          <SessionRunner onExit={() => setInSession(false)} />
        </PlanCard>
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
        <Box sx={{ minHeight: 56 }}>
          {firstName && (
            <>
              <Typography sx={{ color: TEXT.secondary, fontSize: "0.85rem" }}>
                Welcome back,
              </Typography>
              <Typography sx={{ ...TYPE.h2, color: TEXT.primary }}>
                {firstName}
              </Typography>
            </>
          )}
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "stretch" }}>
          <StatTile
            label="Rating"
            sub={isUnrated ? "Unrated" : bandLabel(stats.rating)}
          >
            {isUnrated ? "–" : formatTickerValue(stats.rating)}
          </StatTile>
          <StatTile label="Streak" sub={`best ${streak.best}`}>
            <Box
              sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
            >
              {streak.current}
              <Flame size={18} color={ACCENT.hover} fill={ACCENT.hover} />
            </Box>
          </StatTile>
        </Box>
      </Box>

      {/* An account you cannot recover is a worse problem than a goal you have
          not set, so this one prompt stays on the daily page. */}
      {user && (
        <EmailCard
          currentEmail={profile?.email}
          hasPassword={profile?.hasPassword ?? false}
          onSaved={refresh}
        />
      )}

      {/* The promise, and whether they're keeping to it.
          SETTING the goal is not done here. The quiz asks at signup and
          /profile is where it is changed afterwards — a settings form sitting
          between the user and their daily plan, on every visit, is a page that
          asks you to configure it before it will help you. What stays is the
          progress card, which is plan content: "am I on pace today". The link
          below is the way back to the form for anyone who has no goal yet. */}
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
              perfGoals={profile?.perfGoals}
            />
            <Box sx={{ mt: -1.5, mb: 2.5, textAlign: "right" }}>
              <Button
                variant="text"
                size="small"
                onClick={() => router.push("/profile#goals")}
                sx={{ color: TEXT.secondary }}
              >
                Change goal
              </Button>
            </Box>
          </>
        ) : (
          <Box sx={{ mb: 2.5 }}>
            <PlanCard onClick={() => router.push("/profile#goals")}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 2,
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Target size={20} strokeWidth={1.75} color={ACCENT.main} />
                  <Box>
                    <Typography sx={{ color: TEXT.primary, fontWeight: 600 }}>
                      Set a rating goal
                    </Typography>
                    <Typography
                      sx={{ color: TEXT.secondary, fontSize: "0.82rem" }}
                    >
                      Pick a target for bullet, blitz or rapid. We&apos;ll work
                      out the date and turn the daily session up to match.
                    </Typography>
                  </Box>
                </Box>
                <ChevronRight
                  size={18}
                  strokeWidth={1.75}
                  color={TEXT.secondary}
                />
              </Box>
            </PlanCard>
          </Box>
        ))}

      {/* Bullet / blitz / rapid trends, read from the linked platform account.
          Self-gating: renders a prompt when no username is linked. */}
      <Box sx={{ mb: 2.5 }}>
        <RatingTrends projection={trendProjection} />
      </Box>

      {canResume && (
        <PlanCard onClick={() => router.push("/puzzles")}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <RotateCcw size={20} strokeWidth={1.75} color={ACCENT.main} />
              <Box>
                <Typography sx={{ color: TEXT.primary, fontWeight: 600 }}>
                  Continue where you left off
                </Typography>
                <Typography sx={{ color: TEXT.secondary, fontSize: "0.82rem" }}>
                  Puzzle #{resume?.puzzle.id}
                  {resume?.puzzle.rating ? ` · ${resume.puzzle.rating}` : ""}
                </Typography>
              </Box>
            </Box>
            <Play size={18} strokeWidth={1.75} color={TEXT.secondary} />
          </Box>
        </PlanCard>
      )}

      {/* Day-1 placement step */}
      {!hasPlacement && (
        <PlanCard highlight>
          <Typography sx={{ ...TYPE.h4, color: TEXT.primary, mb: 0.5 }}>
            Step 1: take your placement test
          </Typography>
          <Typography sx={{ color: TEXT.secondary, fontSize: "0.9rem", mb: 2 }}>
            20 quick puzzles set your starting rating and tune every puzzle and
            coaching tip after.
          </Typography>
          <PrimaryButton onClick={() => router.push("/placement")}>
            Start placement (20 puzzles)
          </PrimaryButton>
        </PlanCard>
      )}

      {/* 7-day calendar */}
      <Box>
        <SectionLabel>Your week</SectionLabel>
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
      <PlanCard>
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
          <Typography sx={{ ...TYPE.h4, color: TEXT.primary }}>
            Today&apos;s training
          </Typography>
          <Typography
            sx={{
              color: goalMet ? STATUS.success : TEXT.secondary,
              fontWeight: 600,
              fontSize: "0.85rem",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {puzzlesToday} of {dailyGoal} puzzles
          </Typography>
        </Box>

        <Box sx={{ mb: 2 }}>
          {todayTasks.length === 0 ? (
            <Typography sx={{ color: TEXT.secondary, fontSize: "0.9rem" }}>
              <MastiAvatar
                mood="wave"
                size={22}
                ring={false}
                style={{ verticalAlign: "middle", marginRight: 8 }}
              />
              Nothing scheduled. Open the puzzle trainer whenever you like.
            </Typography>
          ) : (
            todayTasks.map((task) => (
              <TaskRow
                key={task.key}
                label={task.label}
                done={task.done}
                accent={themeAccent(task.theme)}
                kind={task.kind}
              />
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
      </PlanCard>

      {hasPlacement && (
        <PlanCard>
          <ConceptLessonCard />
        </PlanCard>
      )}

      <PlanCard>
        <OpeningLineCard
          phase={repertoire.phase}
          label={repertoire.label}
          reports={repertoire.reports}
          line={repertoire.line}
          error={repertoire.error}
          cachedAt={repertoire.cachedAt}
          username={repertoireAccount.username}
          accountId={
            repertoireAccount.username
              ? `${repertoireAccount.platform}:${repertoireAccount.username}`
              : null
          }
          onRun={repertoire.run}
        />
      </PlanCard>

      <PlanCard>
        <GoalsCard />
      </PlanCard>

      <PlanCard>
        <CurriculumMap />
      </PlanCard>
    </PlanShell>
  );
}

/** Page chrome: nav + centered column. */
function PlanShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Head>
        <title key="title">Your plan · Chess Masti AI</title>
      </Head>
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
        borderBottom: `1px solid ${LINE.separator}`,
        "&:last-of-type": { borderBottom: "none" },
        "&:hover .task-label": { color: TEXT.primary },
      }}
    >
      <Box
        sx={{
          mt: "3px",
          flexShrink: 0,
          width: 24,
          display: "flex",
          justifyContent: "center",
          color: TEXT.secondary,
        }}
      >
        <Icon size={18} strokeWidth={1.75} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Typography
            className="task-label"
            sx={{
              color: TEXT.primary,
              fontSize: "0.92rem",
              fontWeight: 600,
            }}
          >
            {task.label}
          </Typography>
          <Typography sx={{ color: TEXT.secondary, fontSize: "0.75rem" }}>
            ~{task.minutes} min
          </Typography>
          {task.external && <ExternalLink size={12} color={TEXT.tertiary} />}
        </Box>
        <Typography
          sx={{ color: TEXT.secondary, fontSize: "0.78rem", mt: 0.25 }}
        >
          {task.detail}
        </Typography>
      </Box>
    </Box>
  );
}

function TaskRow({
  label,
  done,
  accent,
  kind,
}: {
  label: string;
  done: boolean;
  /** The theme's own colour — stable per theme, so a fork is always gold. */
  accent: Accent;
  kind: "new" | "review";
}) {
  const Icon = kind === "review" ? RotateCcw : Zap;
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        py: 0.85,
        borderBottom: `1px solid ${LINE.separator}`,
        "&:last-of-type": { borderBottom: "none" },
      }}
    >
      <Box
        sx={{
          width: 24,
          flexShrink: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        {done ? (
          <Check size={18} color={STATUS.success} strokeWidth={1.75} />
        ) : (
          <Icon size={18} color={accent.bright} strokeWidth={1.75} />
        )}
      </Box>
      <Typography
        sx={{
          fontSize: "0.92rem",
          fontWeight: done ? 500 : 600,
          color: done ? TEXT.secondary : TEXT.primary,
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
  // A future day that has SRS reviews genuinely falling due wears the cyan of
  // the review identity, so the week strip shows WHERE the review load lands
  // rather than reading as six identical grey boxes.
  const hasReviews = !day.isToday && !done && day.reviewThemes.length > 0;
  return (
    <Box
      onClick={day.isToday ? onStart : undefined}
      sx={{
        p: 1.25,
        borderRadius: `${RADIUS.control}px`,
        minHeight: 104,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        cursor: day.isToday ? "pointer" : "default",
        // A trained day reads green whether or not it is today: the grid's
        // whole job is showing what you have actually done, which it could
        // never do before completion was recorded. Status tints only; the
        // accent marks today, the one cell that is also a button.
        background: done
          ? STATUS.successTint
          : day.isToday
            ? ACCENT.tint
            : hasReviews
              ? STATUS.infoTint
              : SURFACE.raised,
        border: `1px solid ${day.isToday ? ACCENT.border : LINE.hairline}`,
        transition: `border-color ${MOTION.hover}, background-color ${MOTION.hover}`,
        ...(day.isToday
          ? {
              "&:hover": { borderColor: ACCENT.main },
              "&:active": { background: SURFACE.raisedTertiary },
            }
          : {}),
      }}
    >
      <Typography
        sx={{
          ...TYPE.label,
          color: done
            ? STATUS.success
            : day.isToday
              ? ACCENT.hover
              : hasReviews
                ? STATUS.info
                : TEXT.secondary,
          display: "flex",
          alignItems: "center",
          gap: 0.5,
        }}
      >
        {done && <Check size={12} strokeWidth={2} />}
        {day.isToday ? "Today" : day.weekdayLabel}
      </Typography>
      <Typography
        sx={{
          color: TEXT.primary,
          fontWeight: 700,
          fontSize: "1.15rem",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {day.totalPuzzles}
      </Typography>
      <Typography sx={{ color: TEXT.secondary, fontSize: "0.75rem" }}>
        puzzles
      </Typography>
      <Box sx={{ flex: 1 }} />
      <Typography sx={{ color: TEXT.secondary, fontSize: "0.75rem" }}>
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
        borderRadius: `${RADIUS.control}px`,
        background: SURFACE.raised,
        border: `1px solid ${LINE.hairline}`,
      }}
    >
      <Typography sx={{ ...TYPE.label, color: TEXT.secondary }}>
        {label}
      </Typography>
      <Typography
        sx={{
          color: TEXT.primary,
          fontWeight: 700,
          fontSize: "1.4rem",
          lineHeight: 1.15,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {children}
      </Typography>
      <Typography sx={{ color: TEXT.secondary, fontSize: "0.75rem" }}>
        {sub}
      </Typography>
    </Box>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ ...TYPE.label, color: TEXT.secondary, mb: 1, ml: 0.5 }}>
      {children}
    </Typography>
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
    <Button variant="contained" onClick={onClick} disabled={disabled}>
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
    <Button variant="outlined" onClick={onClick}>
      {children}
    </Button>
  );
}
