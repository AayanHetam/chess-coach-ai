"use client";

import { useEffect, useRef } from "react";
import { shouldRefreshPlatformRating } from "./staleRating";

/**
 * Make sure the signed-in user's real chess rating has actually been fetched.
 *
 * /plan measures goal progress against `resolveUserRating`, whose first real
 * source is `platformRating` — and that field is only ever written by
 * /api/ratings/lookup. Until this ran, the ONLY trigger was mounting the
 * profile dialog, so anyone who linked an account and went straight to /plan
 * had the goal scored against the puzzle rating's 1200 default while the trend
 * graphs, reading the username directly, showed their real number just below.
 *
 * Non-forced: the server's 7-day TTL is the real gate, so this is a no-op
 * request at worst and silent when nothing is linked.
 */
export function useEnsurePlatformRating(
  profile: Parameters<typeof shouldRefreshPlatformRating>[0],
  refresh: () => Promise<unknown> | unknown
) {
  const ranRef = useRef(false);
  useEffect(() => {
    if (ranRef.current) return;
    if (!shouldRefreshPlatformRating(profile)) return;
    ranRef.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/ratings/lookup", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: false }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { status?: string };
        // Only re-read the profile when something actually changed. A failed
        // or empty lookup must not clear a rating the user already had.
        if (data.status === "ok") await refresh();
      } catch {
        // Silent: a rating we could not refresh is not an error the user needs
        // to action, and the page has plenty to show without it.
      }
    })();
  }, [profile, refresh]);
}
