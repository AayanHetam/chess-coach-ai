import { useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Box, Button, Typography } from "@mui/material";
import { useAtomValue } from "jotai";
import { useAuth } from "@/contexts/AuthContext";
import { puzzleStatsAtom } from "@/lib/puzzleRating";
import { streakAtom } from "@/lib/curriculum/streak";
import { puzzleThemeSrsAtom, dueThemes } from "@/lib/curriculum/puzzleThemeSrs";
import {
  buildDailySession,
  type TimeCommitment,
} from "@/lib/curriculum/dailyPlan";
import { bandLabel } from "@/components/onboarding/quizConfig";
import SessionRunner from "@/components/curriculum/SessionRunner";
import CurriculumMap from "@/components/curriculum/CurriculumMap";
import GoalsCard from "@/components/curriculum/GoalsCard";

const ORANGE = "linear-gradient(135deg, #F97316 0%, #EA580C 100%)";
const ORANGE_HOVER = "linear-gradient(135deg, #FB923C 0%, #F97316 100%)";

const TIME_LABEL: Record<string, string> = {
  "under-10": "under 10 min",
  "10-30": "10–30 min",
  "30-plus": "30+ min",
};

function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        p: { xs: 2.5, md: 3 },
        borderRadius: "20px",
        background:
          "linear-gradient(180deg, rgba(20,22,28,0.92) 0%, rgba(12,14,20,0.92) 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {children}
    </Box>
  );
}

export default function LearnPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const stats = useAtomValue(puzzleStatsAtom);
  const streak = useAtomValue(streakAtom);
  const srs = useAtomValue(puzzleThemeSrsAtom);
  const [inSession, setInSession] = useState(false);

  const plan = useMemo(
    () =>
      buildDailySession({
        dailyTimeCommitment: profile?.dailyTimeCommitment as
          | TimeCommitment
          | undefined,
        focusThemes: profile?.focusThemes,
        liveRating: stats.rating,
        stats,
        dueReviewThemes: dueThemes(srs, Date.now()),
      }),
    [profile, stats, srs]
  );

  const hasPlacement = typeof profile?.measuredRating === "number";
  const firstName = profile?.displayName?.split(" ")[0] || "there";

  return (
    <>
      <Head>
        <title key="title">Your training — Chess Masti AI</title>
      </Head>
      <Box
        sx={{
          minHeight: "100vh",
          width: "100%",
          background:
            "radial-gradient(1000px 500px at 50% -10%, rgba(249,115,22,0.1), transparent 60%), linear-gradient(180deg, #0A0B0F 0%, #0E1016 100%)",
          py: { xs: 3, md: 5 },
          px: 2,
        }}
      >
        <Box
          sx={{
            maxWidth: 720,
            mx: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 2.5,
          }}
        >
          {!user ? (
            <GlassCard>
              <Typography
                sx={{
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "1.3rem",
                  mb: 1,
                }}
              >
                Sign in to start training
              </Typography>
              <Typography sx={{ color: "rgba(255,255,255,0.6)", mb: 2 }}>
                Your personalized chess curriculum lives here.
              </Typography>
              <Button
                onClick={() => router.push("/onboarding")}
                sx={{
                  py: 1.2,
                  px: 3,
                  borderRadius: "12px",
                  textTransform: "none",
                  fontWeight: 700,
                  color: "#fff",
                  background: ORANGE,
                  "&:hover": { background: ORANGE_HOVER },
                }}
              >
                Get started
              </Button>
            </GlassCard>
          ) : inSession ? (
            <GlassCard>
              <SessionRunner onExit={() => setInSession(false)} />
            </GlassCard>
          ) : (
            <>
              {/* Header */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  flexWrap: "wrap",
                  gap: 1,
                }}
              >
                <Box>
                  <Typography
                    sx={{
                      color: "rgba(255,255,255,0.55)",
                      fontSize: "0.85rem",
                    }}
                  >
                    Welcome back,
                  </Typography>
                  <Typography
                    sx={{
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: "1.6rem",
                      lineHeight: 1.1,
                    }}
                  >
                    {firstName}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 1.5 }}>
                  <Stat
                    label="Rating"
                    value={String(stats.rating)}
                    sub={bandLabel(stats.rating)}
                  />
                  <Stat
                    label="Streak"
                    value={`${streak.current}🔥`}
                    sub={`best ${streak.best}`}
                  />
                </Box>
              </Box>

              {/* Placement CTA */}
              {!hasPlacement && (
                <GlassCard>
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
                    First step
                  </Typography>
                  <Typography
                    sx={{
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: "1.2rem",
                      mb: 0.5,
                    }}
                  >
                    Find your rating
                  </Typography>
                  <Typography
                    sx={{
                      color: "rgba(255,255,255,0.6)",
                      fontSize: "0.9rem",
                      mb: 2,
                    }}
                  >
                    A quick 20-puzzle test calibrates your coach and your
                    training plan.
                  </Typography>
                  <Button
                    onClick={() => router.push("/placement")}
                    sx={{
                      py: 1.2,
                      px: 3,
                      borderRadius: "12px",
                      textTransform: "none",
                      fontWeight: 700,
                      color: "#fff",
                      background: ORANGE,
                      "&:hover": { background: ORANGE_HOVER },
                    }}
                  >
                    Take the placement test
                  </Button>
                </GlassCard>
              )}

              {/* Today's training */}
              <GlassCard>
                <Typography
                  sx={{
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "1.2rem",
                    mb: 0.5,
                  }}
                >
                  Today&apos;s training
                </Typography>
                <Typography
                  sx={{
                    color: "rgba(255,255,255,0.6)",
                    fontSize: "0.9rem",
                    mb: 2,
                  }}
                >
                  {plan.totalPuzzles} puzzles · ~
                  {TIME_LABEL[profile?.dailyTimeCommitment ?? "10-30"]}
                  {plan.reviewThemes.length > 0
                    ? ` · includes ${plan.reviewThemes.length} reviews`
                    : ""}
                </Typography>
                <Button
                  onClick={() => setInSession(true)}
                  disabled={plan.totalPuzzles === 0}
                  sx={{
                    py: 1.3,
                    px: 4,
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
                  Start session
                </Button>
              </GlassCard>

              <GlassCard>
                <GoalsCard />
              </GlassCard>

              <GlassCard>
                <CurriculumMap />
              </GlassCard>
            </>
          )}
        </Box>
      </Box>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Box sx={{ textAlign: "center", minWidth: 72 }}>
      <Typography
        sx={{
          color: "rgba(255,255,255,0.45)",
          fontSize: "0.68rem",
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
          lineHeight: 1.1,
        }}
      >
        {value}
      </Typography>
      <Typography sx={{ color: "rgba(255,255,255,0.4)", fontSize: "0.72rem" }}>
        {sub}
      </Typography>
    </Box>
  );
}
