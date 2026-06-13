"use client";

import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { hasFreshPendingFlush } from "@/components/onboarding/quizStorage";

/**
 * Mandatory-once onboarding. The instant a signed-in user has no
 * `onboardingCompletedAt`, send them to the questionnaire — so every new
 * account is personalized before they reach the app, no matter how they signed
 * up. Mounted app-wide in _app.tsx. Renders null.
 *
 * Skips when a pre-auth quiz answer is still flushing (the user already did the
 * quiz before signing up — let the flush set the flag instead of re-asking).
 */
const EXEMPT_PREFIXES = ["/onboarding", "/preview/onboarding"];

export default function OnboardingGate(): null {
  const router = useRouter();
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (loading || !user || !profile) return;
    if (profile.onboardingCompletedAt) return;
    if (hasFreshPendingFlush()) return; // a pre-auth quiz is being persisted
    const path = router.pathname;
    if (EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)))
      return;
    router.replace("/onboarding");
  }, [user, profile, loading, router]);

  return null;
}
