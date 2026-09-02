import type { NextResponse } from "next/server";
import {
  aiBudgetResponse,
  aiDisabledResponse,
  isAiDisabled,
} from "@/lib/coach/aiAvailability";
import { isOverDailyBudget } from "@/lib/coach/spendFuse";
import { logger } from "@/lib/logging";

/**
 * The single refusal gate every LLM-spending route runs first.
 *
 * SEPARATE FROM `aiAvailability` ON PURPOSE, and the separation is load-bearing
 * rather than stylistic: `aiAvailability` is imported by CLIENT components
 * (`PuzzleCoachPanel`, `AnalysisImpl`) for `isAiDisabledPublic()`. Putting this
 * check there pulled `spendFuse` → `firebase-admin` into the browser bundle and
 * the production build failed on `Can't resolve 'fs' / 'http2' / 'net'` — with
 * a perfectly clean `tsc`, which is precisely why the build gate exists.
 *
 * So: `aiAvailability` holds the client-safe predicates and response shapes,
 * and this module — imported ONLY by route handlers — composes them with the
 * Firestore-backed fuse. Import it from a component and `npm run build` fails
 * the same way it did for me; that is the guard, since `server-only` is not a
 * dependency of this project.
 *
 * Order matters: the deliberate pause is checked first and costs nothing, so a
 * paused coach never touches Firestore.
 */

const log = logger.child({ module: "ai-gate" });

/** Returns a refusal response, or null when the call may proceed. */
export async function aiRefusal(): Promise<NextResponse | null> {
  if (isAiDisabled()) return aiDisabledResponse();
  if (await isOverDailyBudget()) {
    log.warn("daily AI budget reached — refusing before spend");
    return aiBudgetResponse();
  }
  return null;
}
