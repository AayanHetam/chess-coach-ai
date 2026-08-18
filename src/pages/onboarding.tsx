import { useCallback, useEffect, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Box } from "@mui/material";
import OnboardingQuiz from "@/components/onboarding/OnboardingQuiz";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthDialog } from "@/contexts/AuthDialogContext";
import { buildPayload, QuizAnswers } from "@/components/onboarding/quizConfig";
import {
  writeFlushPayload,
  clearAllQuizStorage,
  hasFreshPendingFlush,
} from "@/components/onboarding/quizStorage";
import { shouldSkipQuiz } from "@/lib/onboarding/quizGate";
import { NavPill } from "@/components/ui/NavPill";

const PAGE_TITLE = "Get your free chess profile — Chess Masti AI";
const PAGE_DESC =
  "Answer a few questions and get a personalized chess training plan: your level, your weaknesses, and your first puzzles — calibrated by an AI coach. Free.";

/**
 * Pre-auth onboarding quiz funnel. The quiz is completable without an account;
 * answers are held client-side and written to the profile once after signup
 * (see QuizPersistenceFlush). After auth, the user lands on /plan where the
 * quiz-seeded calendar + placement step pay off.
 *
 * ONE-TIME BY CONSTRUCTION: anyone whose profile already carries
 * `onboardingCompletedAt` is bounced to /plan before the quiz can render.
 * There is deliberately no bypass — retaking was removed from /profile in the
 * same change, so a completed user cannot reach these questions at all, by
 * link, by bookmark, or by typing the URL.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { user, profile, loading, updateProfile } = useAuth();
  const { openAuthDialog, isAuthDialogOpen } = useAuthDialog();
  const [submitting, setSubmitting] = useState(false);

  const alreadyOnboarded = shouldSkipQuiz(
    {
      loading,
      hasUser: !!user,
      onboardingCompletedAt: profile?.onboardingCompletedAt,
    },
    { submitting }
  );

  // The post-signup redirect runs from the dialog's onClose callback, which is
  // captured when the dialog opens (user still null). Read the latest user via
  // a ref so the callback sees the freshly-authenticated user at close time.
  const userRef = useRef(user);
  userRef.current = user;

  const handleUnlock = useCallback(
    async (answers: QuizAnswers, currentRating?: number) => {
      const payload = buildPayload(answers, currentRating);

      if (user) {
        // Signed in but not yet onboarded (e.g. a Google signup who arrived
        // via the /profile "Start personalization test" button): persist
        // directly and skip the signup gate — the app-wide flush only fires on
        // a null→non-null transition, which won't happen here.
        setSubmitting(true);
        try {
          await updateProfile({
            ...payload,
            onboardingCompletedAt: Date.now(),
          });
        } catch (err) {
          console.error("Onboarding direct save failed:", err);
        } finally {
          clearAllQuizStorage();
          setSubmitting(false);
          router.push("/plan");
        }
        return;
      }

      // Pre-auth: stash the payload for the redirect-proof flush, then open the
      // signup gate (email/password or Google OAuth). The email path closes the
      // dialog once signup completes, so `user` is set — head to the payoff.
      // If they close without signing up, `user` is null and we stay put.
      writeFlushPayload(payload);
      openAuthDialog({
        onClose: () => {
          if (userRef.current) router.replace("/plan");
        },
      });
    },
    [user, updateProfile, router, openAuthDialog]
  );

  // Google path (and any post-signup landing): the OAuth redirect returns the
  // user here already authenticated with a pending flush and no dialog open.
  // Send them to the seeded practice feed. Gated on freshness so a stale key
  // from a long-ago abandoned quiz doesn't bounce a returning user.
  useEffect(() => {
    if (!user || isAuthDialogOpen) return;
    if (hasFreshPendingFlush()) router.replace("/plan");
  }, [user, isAuthDialogOpen, router]);

  // Completed-quiz gate. `replace` (not `push`) so Back doesn't bounce them
  // straight back into the quiz they were just redirected out of.
  useEffect(() => {
    if (alreadyOnboarded) router.replace("/plan");
  }, [alreadyOnboarded, router]);

  // Render nothing while the gate resolves — otherwise a returning user sees a
  // flash of question 1 before the redirect lands, which is the exact
  // experience this change exists to remove.
  if (alreadyOnboarded) return null;

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
          pt: 2,
          px: { xs: 2, md: 3 },
          background:
            "radial-gradient(1200px 600px at 50% -10%, rgba(249,115,22,0.12), transparent 60%), linear-gradient(180deg, #0A0B0F 0%, #0E1016 100%)",
        }}
      >
        {/* Mounted inside the page's own gradient rather than by Layout, so
            the pill sits ON the funnel background instead of on a seam
            between two near-black surfaces. */}
        <NavPill />

        <OnboardingQuiz
          onUnlock={handleUnlock}
          submitting={submitting}
          authed={!!user}
        />
      </Box>
    </>
  );
}
