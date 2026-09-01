"use client";

import { useEffect, useRef } from "react";
import { useAtom } from "jotai";
import { useAuth } from "@/contexts/AuthContext";
import { puzzleStatsAtom, puzzleRushScoresAtom } from "@/lib/puzzleRating";
import { puzzleThemeSrsAtom } from "@/lib/curriculum/puzzleThemeSrs";
import { streakAtom } from "@/lib/curriculum/streak";
import { dailyLogAtom } from "@/lib/curriculum/dailyLog";
import { coordinateTrainerBestAtom } from "@/lib/coordinateTrainer";
import { mergeProgress, type StoredProgress } from "./progressMerge";

/**
 * Keeps training progress durable: hydrate from the server once per sign-in,
 * then push a debounced snapshot whenever it changes.
 *
 * Before this, streak / SRS cards / puzzle stats lived only in localStorage —
 * so clearing your cache erased the programme and signing in on a second
 * device showed a brand-new user. Tolerable for a coach you drop into;
 * indefensible for a plan the product asks you to follow for thirty days.
 *
 * Deliberate shape:
 *   - **localStorage stays the working copy.** The server is a replica. Signed-
 *     out users and offline sessions keep working exactly as before; nothing
 *     about training blocks on a network call.
 *   - **Hydration merges, never overwrites** (`mergeProgress`), so puzzles
 *     solved on this device before signing in survive the sync instead of
 *     being clobbered by the server copy.
 *   - **One hydration per user**, tracked by uid. Re-hydrating mid-session
 *     would fight the user's live state.
 */

const PUSH_DEBOUNCE_MS = 2500;

export function useProgressSync(): void {
  const { user } = useAuth();
  const [streak, setStreak] = useAtom(streakAtom);
  const [stats, setStats] = useAtom(puzzleStatsAtom);
  const [srs, setSrs] = useAtom(puzzleThemeSrsAtom);
  const [daily, setDaily] = useAtom(dailyLogAtom);
  const [rush, setRush] = useAtom(puzzleRushScoresAtom);
  const [coordinate, setCoordinate] = useAtom(coordinateTrainerBestAtom);

  const hydratedFor = useRef<string | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Live mirror so the debounced push always sends current state rather than
  // whatever was captured when the timer was armed.
  const latest = useRef({ streak, stats, srs, daily, rush, coordinate });
  latest.current = { streak, stats, srs, daily, rush, coordinate };

  // ── Hydrate: merge the server copy into local, once per signed-in user ──
  useEffect(() => {
    if (!user) {
      // Signing out clears the guard so the next sign-in re-hydrates. Local
      // state is intentionally left alone — it's still this device's progress.
      hydratedFor.current = null;
      return;
    }
    if (hydratedFor.current === user.uid) return;
    hydratedFor.current = user.uid;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/progress", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { progress: StoredProgress | null };
        if (cancelled || !data.progress) return;

        const merged = mergeProgress(
          {
            streak: latest.current.streak,
            stats: latest.current.stats,
            srs: latest.current.srs,
            daily: latest.current.daily,
            rush: latest.current.rush,
            coordinate: latest.current.coordinate,
            updatedAt: Date.now(),
          },
          data.progress,
        );
        setStreak(merged.streak);
        setStats(merged.stats);
        setSrs(merged.srs);
        setDaily(merged.daily ?? {});
        if (merged.rush) setRush(merged.rush);
        if (merged.coordinate) setCoordinate(merged.coordinate);
      } catch {
        // Offline or server down — the local copy is still authoritative for
        // this session, so training continues uninterrupted.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, setStreak, setStats, setSrs, setDaily, setRush, setCoordinate]);

  // ── Push: debounced snapshot on change ──
  useEffect(() => {
    if (!user || hydratedFor.current !== user.uid) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      const body: StoredProgress = {
        streak: latest.current.streak,
        stats: latest.current.stats,
        srs: latest.current.srs,
        daily: latest.current.daily,
        rush: latest.current.rush,
        coordinate: latest.current.coordinate,
        updatedAt: Date.now(),
      };
      void fetch("/api/progress", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {
        // Best-effort replica. A failed push must never surface to someone
        // mid-puzzle; the next change re-arms the timer and tries again.
      });
    }, PUSH_DEBOUNCE_MS);

    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [user, streak, stats, srs, daily, rush, coordinate]);
}
