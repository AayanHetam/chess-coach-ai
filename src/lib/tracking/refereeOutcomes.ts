import { createHash } from "node:crypto";
import { getTrackingEnv } from "@/env";
import { logger } from "@/lib/logging";
import { DEFAULT_ARMING_TABLE } from "@/lib/contract/armingConfig";
import type { ShadowRefereeReview } from "@/lib/contract/shadowReferee";
import { getTrackingSupabase } from "./supabase";
import { safeAfter } from "./llmCapture";
import { currentAppVersion } from "./track";

/**
 * Referee-outcome persistence (CI-5 Stage A).
 *
 * With CONTRACT_REFEREE_SHADOW on, the referee grades every real user's coach
 * review and logs what it WOULD have caught — into Vercel's ephemeral log
 * stream, where it cannot be aggregated. This is the bridge to the tracking
 * warehouse: one `referee_outcomes` row per shadow-refereed review, joinable
 * to `llm_calls` / `events` on request_id.
 *
 * Same hard rules as every other tracking writer:
 *  1. Gated on TRACKING_ENABLED (getTrackingEnv) — off ⇒ no client, no write.
 *  2. Never throws or rejects into the caller. A DB outage is invisible.
 *  3. Fire-and-forget via after() (safeAfter) so the insert can never add
 *     latency to — or fail — a user's stream.
 *
 * PRIVACY. The persisted spans are coach-generated PROSE ABOUT THE USER'S
 * GAME, i.e. AI-conversation content. That is covered by the live privacy
 * policy's consent-gated section, so this writer takes an explicit per-request
 * `consent` decision (hasTrackingConsent: `cm_consent=accepted` and no
 * `Sec-GPC: 1`) and drops the row without it. Note: llmCapture gated on
 * TRACKING_ENABLED alone until 2026-08-11 — a live privacy
 * gap this work surfaced, closed in PR #263; both writers now consent-gate,
 * since neither passes through the /api/track* boundary that enforces it.
 * Identifiers are the existing uid/anon_id convention and nothing more: no
 * IP, no user agent, no session id.
 */

const log = logger.child({ module: "tracking-referee" });

/** Per-request context the route supplies; merged with the review by the writer. */
export interface RefereeOutcomeContext {
  /**
   * Consent for THIS request (hasTrackingConsent(request)). Required, not
   * optional-defaulting-true: forgetting it must fail closed, not open.
   */
  consent: boolean;
  uid?: string | null;
  anonId?: string | null;
  isIntern?: boolean;
  requestId?: string | null;
  /** Classified request category ("game_review" | "opening_analysis" | ...). */
  category?: string | null;
  /** Model that generated the reviewed prose. */
  model?: string | null;
  promptVersion?: string | null;
  verbalizerPromptVersion?: string | null;
  contractVersion?: string | null;
  appVersion?: string | null;
}

export interface RefereeOutcomeInput {
  review: ShadowRefereeReview;
  ctx: RefereeOutcomeContext;
}

let cachedFingerprint: string | undefined;

/**
 * Short digest of the arming table in force at write time. Arming decisions
 * are the whole point of this data, so a row must say which table produced
 * its armed_* counts — otherwise a re-arming silently mixes two populations.
 */
export function armingFingerprint(): string {
  if (cachedFingerprint) return cachedFingerprint;
  const canonical = JSON.stringify(
    Object.entries(DEFAULT_ARMING_TABLE).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  cachedFingerprint = createHash("sha256").update(canonical).digest("hex").slice(0, 12);
  return cachedFingerprint;
}

/**
 * Insert one referee_outcomes row. No-ops when TRACKING_ENABLED is off or
 * consent is absent. Never throws — exported so it can be unit-tested
 * directly (captureRefereeOutcome just schedules it).
 */
export async function recordRefereeOutcome(input: RefereeOutcomeInput): Promise<void> {
  if (!getTrackingEnv().enabled) return;
  const { review, ctx } = input;
  if (!ctx.consent) return;
  try {
    const supabase = await getTrackingSupabase();
    const { error } = await supabase.from("referee_outcomes").insert({
      uid: ctx.uid ?? null,
      anon_id: ctx.anonId ?? null,
      is_intern: ctx.isIntern ?? false,
      request_id: ctx.requestId ?? null,
      contract_id: review.contractId,
      correlation_id: review.correlationId,
      branch: review.branch,
      category: ctx.category ?? null,
      model: ctx.model ?? null,
      prompt_version: ctx.promptVersion ?? null,
      verbalizer_version: ctx.verbalizerPromptVersion ?? null,
      contract_version: ctx.contractVersion ?? null,
      arming_fingerprint: armingFingerprint(),
      app_version: ctx.appVersion ?? currentAppVersion(),
      blocks_seen: review.blocksSeen,
      matched: review.matched,
      unmatched: review.unmatched,
      malformed_headers: review.malformedHeaders,
      referee_errors: review.refereeErrors,
      referee_warns: review.refereeWarns,
      armed_errors: review.armedErrors,
      armed_warns: review.armedWarns,
      check_counts: review.checkCounts,
      category_counts: review.categoryCounts,
      max_hold_ms: review.maxHoldMs,
      p95_hold_ms: review.p95HoldMs,
      relational_launched: review.relationalLaunched,
      spans: review.spans,
    });
    if (error) {
      log.warn("referee_outcomes insert failed", {
        contractId: review.contractId,
        error: error.message,
      });
    }
  } catch (err) {
    log.warn("recordRefereeOutcome threw (swallowed — telemetry must not break the stream)", {
      contractId: review.contractId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Schedule a referee-outcome write. Safe to call synchronously from the
 * shadow gate's end() on the streaming hot path: returns immediately, never
 * throws, and the insert finishes after the response via safeAfter().
 */
export function captureRefereeOutcome(input: RefereeOutcomeInput): void {
  try {
    safeAfter(() => recordRefereeOutcome(input));
  } catch {
    // safeAfter already guards; belt-and-suspenders (mirrors captureLLMCall).
  }
}
