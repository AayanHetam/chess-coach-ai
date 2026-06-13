import { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Box } from "@mui/material";
import AuthDialog from "@/components/auth/AuthDialog";
import OnboardingQuiz from "@/components/onboarding/OnboardingQuiz";
import { useAuth } from "@/contexts/AuthContext";
import { buildPayload, QuizAnswers } from "@/components/onboarding/quizConfig";
import {
  writeFlushPayload,
  clearAllQuizStorage,
  hasFreshPendingFlush,
} from "@/components/onboarding/quizStorage";

const PAGE_TITLE = "Get your free chess profile — Chess Masti AI";
const PAGE_DESC =
  "Answer a few questions and get a personalized chess training plan: your level, your weaknesses, and your first puzzles — calibrated by an AI coach. Free.";

/**
 * Pre-auth onboarding quiz funnel. The quiz is completable without an account;
 * answers are held client-side and written to the profile once after signup
 * (see QuizPersistenceFlush). After auth, the user lands on /learn where the
 * quiz-seeded "Recommended for you" feed pays off.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { user, updateProfile } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleUnlock = useCallback(
    async (answers: QuizAnswers) => {
      const payload = buildPayload(answers);

      if (user) {
        // Already signed in (e.g. an existing user retaking the quiz): persist
        // directly and skip the signup gate — the app-wide flush only fires on
        // a null→non-null transition, which won't happen here.
        setSubmitting(true);
        try {
          await updateProfile(payload);
        } catch (err) {
          console.error("Onboarding direct save failed:", err);
        } finally {
          clearAllQuizStorage();
          setSubmitting(false);
          router.push("/learn");
        }
        return;
      }

      // Pre-auth: stash the payload for the redirect-proof flush, then open the
      // signup gate (email/password or Google OAuth).
      writeFlushPayload(payload);
      setAuthOpen(true);
    },
    [user, updateProfile, router]
  );

  const handleAuthClose = useCallback(() => {
    setAuthOpen(false);
    // Email path: the dialog closes after signup completes, so `user` is set —
    // head to the payoff. If they closed without signing up, `user` is null and
    // we stay on the result screen.
    if (user) router.replace("/learn");
  }, [user, router]);

  // Google path (and any post-signup landing): the OAuth redirect returns the
  // user here already authenticated with a pending flush and no dialog open.
  // Send them to the seeded practice feed. Gated on freshness so a stale key
  // from a long-ago abandoned quiz doesn't bounce a returning user.
  useEffect(() => {
    if (!user || authOpen) return;
    if (hasFreshPendingFlush()) router.replace("/learn");
  }, [user, authOpen, router]);

  return (
    <>
      <Head>
        <title key="title">{PAGE_TITLE}</title>
        <meta key="description" name="description" content={PAGE_DESC} />
        <link
          key="canonical"
          rel="canonical"
          href="https://chessmasti.com/onboarding"
        />
        <meta key="og:title" property="og:title" content={PAGE_TITLE} />
        <meta
          key="og:description"
          property="og:description"
          content={PAGE_DESC}
        />
        <meta
          key="og:url"
          property="og:url"
          content="https://chessmasti.com/onboarding"
        />
      </Head>

      <Box
        sx={{
          minHeight: "100vh",
          width: "100%",
          background:
            "radial-gradient(1200px 600px at 50% -10%, rgba(249,115,22,0.12), transparent 60%), linear-gradient(180deg, #0A0B0F 0%, #0E1016 100%)",
        }}
      >
        <OnboardingQuiz onUnlock={handleUnlock} submitting={submitting} />
      </Box>

      <AuthDialog open={authOpen} onClose={handleAuthClose} />
    </>
  );
}
