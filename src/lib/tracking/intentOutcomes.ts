import { createHash } from "node:crypto";
import { after } from "next/server";
import { getTrackingEnv } from "@/env";
import { logger } from "@/lib/logging";
import { INTENT_CALIBRATION } from "@/lib/intent/intentFacts";
import { episodeCountsByFamily } from "@/lib/intent/episodes";
import type { IntentSummary } from "@/lib/contract/types";
import { getTrackingSupabase } from "./supabase";
import { currentAppVersion } from "./track";

/**
 * Intent-shadow persistence (intent workstream, stage I-1).
 *
 * With INTENT_FACTS_ENABLED on, the contract carries `intent` — what each
 * carded move was FOR — but serializeForVerbalizer strips it, so nothing the
 * user sees changes. Until this writer existed, arming the flag was
 * UNOBSERVABLE: the facts were computed, attached, and discarded when the
 * request ended. One content-free `intent_outcomes` row per reviewed game is
 * the bridge that makes the shadow measurable.
 *
 * The write point is the CONTRACT BUILD, which both serving branches share —
 * so this writer is immune by construction to the CI-6 failure ("arming
 * enforcement silently switched off the telemetry"), which was only possible
 * because referee capture lived per-branch.
 *
 * Same hard rules as every other tracking writer:
 *  1. Gated on TRACKING_ENABLED (getTrackingEnv) — off ⇒ no client, no write.
 *  2. Consent required and fail-closed: no cm_consent=accepted ⇒ no row.
 *  3. Never throws or rejects into the caller; scheduled via after() so it
 *     can never add latency to — or fail — a user's stream.
 *
 * PRIVACY. Aggregate counts and versions ONLY. IntentSummary rows carry SANs,
 * FENs and engine lines from the user's game; NONE of that reaches this
 * table — no move text, no positions, no scores. Counts, tiers, purposes,
 * timings, fingerprints.
 */

const log = logger.child({ module: "tracking-intent" });

function safeAfter(fn: () => Promise<void> | void): void {
  // Mirrors refereeOutcomes.safeAfter: after() throws outside a request
  // scope (unit tests, scripts) — fall back to a detached promise.
  try {
    after(fn);
  } catch {
    void Promise.resolve()
      .then(fn)
      .catch(() => undefined);
  }
}

export interface IntentOutcomeContext {
  /**
   * Consent for THIS request (hasTrackingConsent(request)). Required, not
   * optional-defaulting-true: forgetting it must fail closed, not open.
   */
  consent: boolean;
  isIntern?: boolean;
  requestId?: string | null;
  contractVersion?: string | null;
  appVersion?: string | null;
}

export interface IntentOutcomeInput {
  intent: IntentSummary[];
  contractId: string;
  correlationId: string;
  /** contract.buildMs — the CPU cost the intent computation is part of. */
  buildMs: number | null;
  ctx: IntentOutcomeContext;
}

let cachedFingerprint: string | undefined;

/**
 * Short digest of the calibration table in force at write time. The
 * thresholds were set against founder rulings; a retune must not silently
 * mix its population with the old one (same discipline as armingFingerprint).
 */
export function intentFingerprint(): string {
  if (cachedFingerprint) return cachedFingerprint;
  const canonical = JSON.stringify(
    Object.entries(INTENT_CALIBRATION).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    ),
  );
  cachedFingerprint = createHash("sha256")
    .update(canonical)
    .digest("hex")
    .slice(0, 12);
  return cachedFingerprint;
}

/**
 * Insert one intent_outcomes row. No-ops when TRACKING_ENABLED is off or
 * consent is absent. Never throws — exported so it can be unit-tested
 * directly (captureIntentOutcome just schedules it).
 */
export async function recordIntentOutcome(
  input: IntentOutcomeInput,
): Promise<void> {
  if (!getTrackingEnv().enabled) return;
  const { intent, contractId, correlationId, buildMs, ctx } = input;
  if (!ctx.consent) return;
  try {
    // Per-ply fact counts and the episode collapse of the same rows. Quoting
    // per-ply numbers alone overstates (25 of 34 "surviving mates" were one
    // lost ending); storing both lets every query pick the honest one.
    const plyCounts: Record<string, number> = {};
    const purposeCounts: Record<string, number> = {};
    const tierCounts: Record<string, number> = { tier0: 0, tier1: 0 };
    let quiet = 0;
    for (const row of intent) {
      tierCounts[row.tier] = (tierCounts[row.tier] ?? 0) + 1;
      purposeCounts[row.facts.purpose] =
        (purposeCounts[row.facts.purpose] ?? 0) + 1;
      if (row.facts.quiet) quiet += 1;
      for (const family of [
        "mate",
        "material",
        "trap",
        "escape",
        "prophylaxis",
        "unaddressedThreat",
        "cost",
      ] as const) {
        if (row.facts[family]) {
          plyCounts[family] = (plyCounts[family] ?? 0) + 1;
        }
      }
    }
    const byPlayer = {
      w: intent.filter((r) => r.mover === "w").length,
      b: intent.filter((r) => r.mover === "b").length,
    };

    const supabase = await getTrackingSupabase();
    const { error } = await supabase.from("intent_outcomes").insert({
      is_intern: ctx.isIntern ?? false,
      request_id: ctx.requestId ?? null,
      contract_id: contractId,
      correlation_id: correlationId,
      contract_version: ctx.contractVersion ?? null,
      intent_fingerprint: intentFingerprint(),
      app_version: ctx.appVersion ?? currentAppVersion(),
      plies_analysed: intent.length,
      mover_counts: byPlayer,
      tier_counts: tierCounts,
      ply_counts: plyCounts,
      episode_counts: episodeCountsByFamily(intent),
      purpose_counts: purposeCounts,
      quiet_plies: quiet,
      build_ms: buildMs,
    });
    if (error) {
      log.warn("intent_outcomes insert failed", {
        contractId,
        error: error.message,
      });
    }
  } catch (err) {
    log.warn(
      "recordIntentOutcome threw (swallowed — telemetry must not break the stream)",
      {
        contractId,
        error: err instanceof Error ? err.message : String(err),
      },
    );
  }
}

/**
 * Fire-and-forget scheduler, safe on the request hot path: returns
 * immediately, never throws, insert finishes after the response.
 */
export function captureIntentOutcome(input: IntentOutcomeInput): void {
  try {
    safeAfter(() => recordIntentOutcome(input));
  } catch {
    // safeAfter already guards; belt-and-suspenders (mirrors captureRefereeOutcome).
  }
}

/** Test-only seam — the fingerprint memo survives module reuse across tests. */
export function __resetIntentFingerprintForTests(): void {
  cachedFingerprint = undefined;
}
