/**
 * Stage C user-history cache fallback.
 *
 * Bridges the synthetic-tester sweep's pre-populated user-history cache
 * (scripts/synthetic-tester/fixtures/user_history_cache/<username>.json)
 * into the route's flag-on userHistory fetch path. Used by
 * wireValidators.ts to return cached games instead of hitting Firestore
 * when (a) we're in the Vercel preview environment and (b) the request's
 * resolved username matches one of the four test users.
 *
 * Two strict gates, in order:
 *   1. process.env.VERCEL_ENV === "preview" — production traffic is
 *      completely unaffected. Local dev (VERCEL_ENV undefined) also
 *      bypasses, except where tests explicitly stub the env.
 *   2. The username is one of the four cached test users (case-
 *      insensitive match): Lazer_Wizard, JSNoverPuka, Chilllychess,
 *      gothamchess.
 *
 * When both gates pass, returns the cached games array. Otherwise null
 * — caller proceeds with the real Firestore read.
 *
 * Real users with real Firestore data are unaffected; the fallback fires
 * only for sweep traffic. See CATEGORY_GENERATOR_DESIGN.md O2 and
 * 1.C.B.5 follow-up directives for the rationale.
 */

import type { UserHistoryGame } from "./userHistoryAggregates";
import lazerWizard from "../../../scripts/synthetic-tester/fixtures/user_history_cache/Lazer_Wizard.json";
import jsnoverPuka from "../../../scripts/synthetic-tester/fixtures/user_history_cache/JSNoverPuka.json";
import chilllychess from "../../../scripts/synthetic-tester/fixtures/user_history_cache/Chilllychess.json";
import gothamchess from "../../../scripts/synthetic-tester/fixtures/user_history_cache/gothamchess.json";

interface CachedFile {
  username: string;
  platform: string;
  games: UserHistoryGame[];
  loadFailed?: boolean;
}

const CACHE_BY_USERNAME_LOWER: Record<string, CachedFile> = {
  "lazer_wizard": lazerWizard as unknown as CachedFile,
  "jsnoverpuka": jsnoverPuka as unknown as CachedFile,
  "chilllychess": chilllychess as unknown as CachedFile,
  "gothamchess": gothamchess as unknown as CachedFile,
};

export function tryReadStageCUserHistoryCache(
  userName: string,
): UserHistoryGame[] | null {
  // Gate 1: only fire in Vercel Preview environment.
  if (process.env.VERCEL_ENV !== "preview") return null;
  // Gate 2: only fire for the four cached test users (case-insensitive).
  const cache = CACHE_BY_USERNAME_LOWER[userName.toLowerCase()];
  if (!cache || cache.loadFailed) return null;
  return cache.games;
}

/** Test seam: list the cached usernames so unit tests can iterate. */
export const STAGE_C_CACHED_USERNAMES = [
  "Lazer_Wizard",
  "JSNoverPuka",
  "Chilllychess",
  "gothamchess",
] as const;
