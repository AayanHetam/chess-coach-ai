/**
 * Daily spend fuse — the only brake that bounds the BILL rather than any one
 * caller.
 *
 * Why this exists and a quota does not: a per-user cap scales with users, so
 * it bounds fairness, not spend. On 2026-08-19 the Anthropic balance ran out
 * with nothing watching it; the coach was dark for a month, which cost far
 * more than the bill did. A ceiling that degrades loudly at a number YOU chose
 * is strictly better than a balance that hits zero at a number the month
 * chose for you.
 *
 * DEFAULT OFF. With `DAILY_AI_BUDGET_USD` unset there is no ceiling and this
 * module does nothing but keep a counter. That is deliberate: shipping the
 * mechanism dark means arming it later is an env change, not a deploy, and a
 * bug here cannot take the coach down before anyone has chosen a number.
 *
 * FAILS OPEN. If Firestore is slow or unreachable we log loudly and allow the
 * call. A cost fuse that fails closed turns a storage blip into an outage —
 * and we have direct evidence that an outage is the more expensive failure.
 * The fuse is a backstop against a runaway, not an accountant.
 *
 * ACCURACY. Spend is read through a short per-process cache and written
 * fire-and-forget, so on serverless the ceiling is approximate: several warm
 * instances each hold their own cached read, and the overshoot is bounded by
 * (instances x REFRESH_MS x burn rate). That is the right trade for a fuse —
 * a synchronous read-modify-write on every LLM call would put Firestore in
 * the latency path of every coach reply to make a backstop precise.
 */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/server/firebaseAdmin";
import { withFirestoreTimeout } from "@/lib/server/withFirestoreTimeout";
import { logger } from "@/lib/logging";
import { MODEL_PRICING } from "@/lib/llmPricing";

const log = logger.child({ module: "spend-fuse" });

const COLLECTION = "ai_spend";
/** Re-read the day's total at most this often, per process. */
const REFRESH_MS = 60_000;
/** Firestore must never sit in the latency path for long. */
const TIMEOUT_MS = 2_000;

interface CachedTotal {
  day: string;
  usd: number;
  readAtMs: number;
}

let cached: CachedTotal | null = null;
/** In-flight refresh, so a burst does not fan out N identical reads. */
let inFlight: Promise<void> | null = null;

/** UTC day key. UTC so the window does not move with the reader's timezone. */
export function spendDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The configured ceiling in USD, or null when the fuse is disarmed.
 * A non-positive or unparseable value disarms it rather than blocking
 * everything — a typo in an env var must not take the coach down.
 */
export function dailyBudgetUsd(): number | null {
  const raw = process.env.DAILY_AI_BUDGET_USD;
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    log.warn("DAILY_AI_BUDGET_USD is not a positive number — fuse disarmed", {
      raw,
    });
    return null;
  }
  return n;
}

/** USD for one call, from the same table /admin/cost renders. */
export function costOfCall(usage: {
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheCreationTokens?: number | null;
  cacheReadTokens?: number | null;
}): number {
  const p = MODEL_PRICING[usage.model];
  if (!p) return 0; // Unknown model: don't invent a number. See __tests__.
  const m = 1_000_000;
  return (
    ((usage.inputTokens ?? 0) * p.inputPerMillion +
      (usage.outputTokens ?? 0) * p.outputPerMillion +
      (usage.cacheCreationTokens ?? 0) * (p.cacheWritePerMillion ?? p.inputPerMillion) +
      (usage.cacheReadTokens ?? 0) * (p.cacheReadPerMillion ?? p.inputPerMillion)) /
    m
  );
}

async function refresh(day: string): Promise<void> {
  try {
    const db = await getAdminFirestore();
    const snap = await withFirestoreTimeout(
      db.collection(COLLECTION).doc(day).get(),
      `spendFuse.read(${day})`,
      TIMEOUT_MS,
    );
    const usd = Number(snap.data()?.usd ?? 0);
    cached = { day, usd: Number.isFinite(usd) ? usd : 0, readAtMs: Date.now() };
  } catch (err) {
    // Fail open, but say so — a silently broken fuse is worse than none.
    log.error("spend fuse could not read the day's total; allowing the call", {
      day,
      message: err instanceof Error ? err.message : String(err),
    });
    cached = { day, usd: 0, readAtMs: Date.now() };
  }
}

/**
 * True when today's recorded spend has reached the configured ceiling.
 * Always false when the fuse is disarmed, and false on any storage failure.
 */
export async function isOverDailyBudget(now: Date = new Date()): Promise<boolean> {
  const budget = dailyBudgetUsd();
  if (budget === null) return false;

  const day = spendDayKey(now);
  const stale =
    !cached || cached.day !== day || Date.now() - cached.readAtMs > REFRESH_MS;
  if (stale) {
    inFlight ??= refresh(day).finally(() => {
      inFlight = null;
    });
    await inFlight;
  }
  return (cached?.usd ?? 0) >= budget;
}

/**
 * Add one call's cost to today's total. Fire-and-forget by design: the caller
 * has already been served, and a failed write must never surface to a user.
 * The local cache is advanced immediately so a burst inside one refresh
 * window still trips the fuse.
 */
export function recordSpend(usd: number, now: Date = new Date()): void {
  if (usd <= 0) return;
  const day = spendDayKey(now);
  if (cached?.day === day) cached.usd += usd;

  // Only the durable write is conditional on the fuse being armed; the cache
  // above is cheap and keeps the number honest if it is armed mid-day.
  if (dailyBudgetUsd() === null) return;

  void (async () => {
    try {
      const db = await getAdminFirestore();
      await withFirestoreTimeout(
        db
          .collection(COLLECTION)
          .doc(day)
          .set(
            { usd: FieldValue.increment(usd), updatedAt: FieldValue.serverTimestamp() },
            { merge: true },
          ),
        `spendFuse.increment(${day})`,
        TIMEOUT_MS,
      );
    } catch (err) {
      log.error("spend fuse could not record a call", {
        day,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}

/** Test seam. */
export function __resetSpendFuseForTests(): void {
  cached = null;
  inFlight = null;
}
