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

// ─────────────────────────────────────────────────────────────────────────────
// ENFORCED-PATH OUTCOMES (CI-6)
//
// THE GAP THIS CLOSES. Everything above was built for SHADOW mode: the gate in
// `maybeCreateShadowRefereeGate` grades prose the user is already being served
// and records what the referee WOULD have caught. When CONTRACT_CATEGORIES was
// set to arm game_review for everyone (2026-08-11), armed requests stopped
// taking that branch — `serveContractAnalysis` returns and closes the stream
// before the shadow gate is ever constructed.
//
// Net effect: arming enforcement silently switched OFF the telemetry that was
// supposed to prove enforcement works. `referee_outcomes` would have stayed at
// zero rows no matter how much real traffic arrived, and the natural reading of
// that ("no traffic yet") is wrong in a way that looks like patience.
//
// Same failure shape as the llm_calls consent gap: verify the path you are
// thinking about, assume the sibling path behaves the same.
//
// WHAT AN ENFORCED ROW MEANS DIFFERENTLY. In shadow rows, referee_* is the
// referee's own severity and armed_* is what the CURRENT table would enforce —
// two different numbers. On the enforced path the referee already ran WITH the
// arming table applied, so the fires counted ARE the enforced ones and the two
// pairs are equal by construction. `branch` is the discriminator; always group
// by it before comparing populations, or a shadow row and an enforced row get
// averaged as though they measured the same thing.
// ─────────────────────────────────────────────────────────────────────────────

/** The subset of EnforcedStreamSummary this writer needs (keeps the import graph thin). */
export interface EnforcedRefereeSummaryLike {
  cards: Array<{
    factIdPrefix: string;
    stage: string;
    errorsInitial: number;
    warnsInitial: number;
    findings: Array<{ check: string; category: string; span: string }>;
    relationalParsesUsed: number;
  }>;
  errorsInitialTotal: number;
  warnsInitialTotal: number;
  unanchoredBlocks: number;
  sentinelCardsRefused: number;
}

export interface EnforcedRefereeOutcomeInput {
  summary: EnforcedRefereeSummaryLike;
  contractId: string;
  correlationId: string;
  ctx: RefereeOutcomeContext;
}

/** Cap mirrors the shadow writer: a review must not write an unbounded row. */
const MAX_SPANS = 40;

/** Map an enforced-serving summary onto the shared referee_outcomes shape. */
export async function recordEnforcedRefereeOutcome(
  input: EnforcedRefereeOutcomeInput,
): Promise<void> {
  if (!getTrackingEnv().enabled) return;
  const { summary, contractId, correlationId, ctx } = input;
  // Coach prose about the user's game — consent-gated, fail closed. Same rule
  // as every other writer here; see the module header.
  if (!ctx.consent) return;
  try {
    const checkCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};
    const spans: Array<Record<string, unknown>> = [];
    let relationalLaunched = 0;

    for (const card of summary.cards) {
      relationalLaunched += card.relationalParsesUsed;
      for (const f of card.findings) {
        checkCounts[f.check] = (checkCounts[f.check] ?? 0) + 1;
        categoryCounts[f.category] = (categoryCounts[f.category] ?? 0) + 1;
        if (spans.length < MAX_SPANS) {
          spans.push({
            check: f.check,
            category: f.category,
            span: f.span,
            factIdPrefix: card.factIdPrefix,
            // Enforced-only, and the reason this data is worth more than the
            // shadow equivalent: not just what the referee caught, but what
            // the ladder DID about it (dropped / edited / regenerated /
            // templated) before the user saw anything.
            stage: card.stage,
            severity: "error",
            armed: true,
          });
        }
      }
    }

    const supabase = await getTrackingSupabase();
    const { error } = await supabase.from("referee_outcomes").insert({
      uid: ctx.uid ?? null,
      anon_id: ctx.anonId ?? null,
      is_intern: ctx.isIntern ?? false,
      request_id: ctx.requestId ?? null,
      contract_id: contractId,
      correlation_id: correlationId,
      // Discriminates enforced rows from the shadow population — see header.
      branch: "contract-enforced",
      category: ctx.category ?? null,
      model: ctx.model ?? null,
      prompt_version: ctx.promptVersion ?? null,
      verbalizer_version: ctx.verbalizerPromptVersion ?? null,
      contract_version: ctx.contractVersion ?? null,
      arming_fingerprint: armingFingerprint(),
      app_version: ctx.appVersion ?? currentAppVersion(),
      // A card IS an anchored block; unanchored blocks were never graded.
      blocks_seen: summary.cards.length + summary.unanchoredBlocks,
      matched: summary.cards.length,
      unmatched: summary.unanchoredBlocks,
      // Header malformation is resolved upstream by the block gate on this
      // path, so it is structurally zero rather than unmeasured.
      malformed_headers: 0,
      referee_errors: summary.errorsInitialTotal,
      referee_warns: summary.warnsInitialTotal,
      // Equal by construction on this path — see the header note.
      armed_errors: summary.errorsInitialTotal,
      armed_warns: summary.warnsInitialTotal,
      check_counts: checkCounts,
      category_counts: categoryCounts,
      // Block-gate hold timings are a shadow-path measurement; this path
      // pipelines per card and does not produce them. Left at the column
      // default rather than filled with a plausible-looking zero-as-fact.
      relational_launched: relationalLaunched,
      spans,
    });
    if (error) {
      log.warn("referee_outcomes (enforced) insert failed", {
        contractId,
        error: error.message,
      });
    }
  } catch (err) {
    log.warn("recordEnforcedRefereeOutcome threw (swallowed — telemetry must not break the stream)", {
      contractId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Fire-and-forget scheduler, mirroring captureRefereeOutcome. */
export function captureEnforcedRefereeOutcome(input: EnforcedRefereeOutcomeInput): void {
  try {
    safeAfter(() => recordEnforcedRefereeOutcome(input));
  } catch {
    // safeAfter already guards; belt-and-suspenders.
  }
}
