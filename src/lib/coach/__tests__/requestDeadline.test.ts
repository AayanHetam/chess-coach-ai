import { describe, expect, it } from "vitest";
import {
  createRequestDeadline,
  REQUEST_DEADLINE_BUDGET_MS,
} from "../requestDeadline";

/**
 * T1 (SILENT_SUBSTITUTION_HANDOFF §4) — there was no request-level deadline
 * anywhere. Every timeout in the pipeline was a COMPONENT timeout, so each
 * stage could be inside its own budget while their sum blew the platform's
 * 60s ceiling.
 *
 * A clock injected through `now` keeps these tests instant and deterministic —
 * no fake timers, no waiting 55 seconds to assert an expiry.
 */

function at(times: number[]) {
  let i = 0;
  // Holds the last value once exhausted, so extra internal reads are harmless.
  return () => times[Math.min(i++, times.length - 1)];
}

describe("createRequestDeadline", () => {
  it("reports the full budget at the start of a request", () => {
    const d = createRequestDeadline({ startMs: 0, budgetMs: 55_000, now: () => 0 });
    expect(d.remainingMs()).toBe(55_000);
    expect(d.isExpired()).toBe(false);
    d.dispose();
  });

  it("counts down as the request burns wall-clock", () => {
    const now = at([0, 0, 20_000, 50_000]);
    const d = createRequestDeadline({ startMs: 0, budgetMs: 55_000, now });
    expect(d.remainingMs()).toBe(35_000);
    expect(d.remainingMs()).toBe(5_000);
    d.dispose();
  });

  it("clamps to zero rather than reporting negative time", () => {
    // A negative remaining would silently pass `hasBudgetFor` comparisons in
    // any caller that did its own arithmetic.
    const d = createRequestDeadline({ startMs: 0, budgetMs: 55_000, now: at([0, 90_000]) });
    expect(d.remainingMs()).toBe(0);
    d.dispose();
  });

  it("expires once the budget is gone", () => {
    const d = createRequestDeadline({ startMs: 0, budgetMs: 1_000, now: at([0, 5_000]) });
    expect(d.isExpired()).toBe(true);
    d.dispose();
  });

  it("refuses an optional stage that would not finish in time", () => {
    // The point: ask BEFORE starting, so the stage is skipped rather than
    // started and then killed halfway with nothing to show for it.
    const d = createRequestDeadline({ startMs: 0, budgetMs: 55_000, now: at([0, 50_000, 50_000]) });
    expect(d.hasBudgetFor(8_000)).toBe(false);
    expect(d.hasBudgetFor(1_000)).toBe(true);
    d.dispose();
  });

  it("treats an exact-fit stage as unaffordable", () => {
    // Exactly the cost remaining means finishing at the instant the platform
    // kills the function — no room to emit anything afterwards.
    const d = createRequestDeadline({ startMs: 0, budgetMs: 10_000, now: at([0, 0]) });
    expect(d.hasBudgetFor(10_000)).toBe(false);
    d.dispose();
  });

  it("exposes a signal that is not aborted while budget remains", () => {
    const d = createRequestDeadline({ startMs: 0, budgetMs: 55_000, now: () => 0 });
    expect(d.signal.aborted).toBe(false);
    d.dispose();
  });

  it("hands back an already-aborted signal when the budget is gone on arrival", () => {
    // Guards the boundary case: a caller must never start a billed flagship
    // stream on a request that is already out of time.
    const d = createRequestDeadline({ startMs: 0, budgetMs: 1_000, now: at([5_000, 5_000]) });
    expect(d.signal.aborted).toBe(true);
    d.dispose();
  });

  it("aborts the signal when the deadline actually elapses", async () => {
    // Real timer, tiny budget — proves the wiring, not just the arithmetic.
    const d = createRequestDeadline({ budgetMs: 15 });
    expect(d.signal.aborted).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(d.signal.aborted).toBe(true);
    d.dispose();
  });

  it("dispose is idempotent", () => {
    const d = createRequestDeadline({ budgetMs: 55_000 });
    d.dispose();
    expect(() => d.dispose()).not.toThrow();
  });

  it("leaves headroom under the platform ceiling", () => {
    // vercel.json caps API routes at maxDuration 60. A budget at or above the
    // ceiling would defeat the entire purpose.
    expect(REQUEST_DEADLINE_BUDGET_MS).toBeLessThan(60_000);
    expect(REQUEST_DEADLINE_BUDGET_MS).toBeGreaterThanOrEqual(45_000);
  });
});
