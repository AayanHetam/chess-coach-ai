"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  readFlushPayload,
  clearAllQuizStorage,
} from "@/components/onboarding/quizStorage";

/**
 * Redirect-proof onboarding flush.
 *
 * The onboarding quiz is completed pre-auth and stashes a single profile patch
 * in localStorage. The signup that follows may be email/password (in-page) OR
 * Google OAuth (a FULL-PAGE REDIRECT that destroys all in-memory React state).
 * So persistence cannot hang off an AuthDialog callback — it keys off the
 * `user` null→non-null transition instead, which fires for both methods (Google
 * lands back on the page, _app remounts, /api/auth/me populates `user`).
 *
 * Mounted once app-wide in _app.tsx because the OAuth callback can return the
 * user to any `returnTo` path, not just /onboarding.
 */
export function useQuizPersistence(): void {
  const { user, updateProfile } = useAuth();
  // The uid we've already flushed for this mount. A ref (not state) so the
  // guard is set synchronously and survives the re-render that updateProfile
  // triggers when it refreshes `user`/`profile`.
  const flushedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (flushedRef.current === user.uid) return;

    const env = readFlushPayload();
    if (!env) return;

    // Mark BEFORE the await so an effect re-run during the in-flight PATCH
    // bails on the guard and we never write twice.
    flushedRef.current = user.uid;

    (async () => {
      try {
        await updateProfile({
          ...env.payload,
          onboardingCompletedAt: Date.now(),
        });
        clearAllQuizStorage();

        // The quiz collected a username instead of asking for a rating, so the
        // profile has no rating until this runs. Fire it here — the user is
        // mid-redirect to /plan and the number should be waiting when they
        // arrive. Deliberately NOT awaited into the guard above: a platform
        // outage must not make the profile write look like it failed and
        // trigger the retry path.
        if (env.payload.lichessUsername || env.payload.chesscomUsername) {
          void fetch("/api/ratings/lookup", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ force: true }),
          }).catch((err) => {
            // Non-fatal by design: the coach simply has no rating yet, which
            // resolveUserRating already treats as "not provided" rather than
            // substituting one. Profile → Chess can retry on demand.
            console.warn("Post-signup rating lookup failed:", err);
          });
        }
      } catch (err) {
        // Leave the key in place and allow one retry on the next user tick.
        flushedRef.current = null;
        console.error("Onboarding quiz flush failed:", err);
      }
    })();
  }, [user, updateProfile]);
}

/** Renders nothing; exists solely to run the flush effect app-wide. */
export default function QuizPersistenceFlush(): null {
  useQuizPersistence();
  return null;
}
