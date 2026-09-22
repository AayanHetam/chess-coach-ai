import { describe, it, expect } from "vitest";
import { isDragLost, LOST_DRAG_SETTLE_MS } from "@/hooks/useLostDragRecovery";

/**
 * The window listeners are covered end-to-end in
 * tests/e2e/local/board-lost-drag.spec.ts, against a real Chromium drag.
 * This pins the decision itself, which is the part a refactor can silently
 * invert: a mouse event during a live drag must never end it.
 */
describe("isDragLost", () => {
  it("says no when no drag is in flight", () => {
    // Every mousemove on a page with a board hits this branch, so a false
    // here would fire `dragend` at the browser continuously.
    expect(isDragLost(null, 1_000_000)).toBe(false);
  });

  it("says no for a mouse event that arrives with the drag", () => {
    // A move queued just before `dragstart` can still be delivered right
    // after it; the drag is alive and must not be cut short.
    const start = 1_000_000;
    expect(isDragLost(start, start)).toBe(false);
    expect(isDragLost(start, start + LOST_DRAG_SETTLE_MS - 1)).toBe(false);
  });

  it("says yes once a mouse event lands past the settle window", () => {
    // The browser sends no mouse events between dragstart and dragend, so
    // this one proves the drag is over and its dragend was lost.
    const start = 1_000_000;
    expect(isDragLost(start, start + LOST_DRAG_SETTLE_MS)).toBe(true);
    expect(isDragLost(start, start + 5_000)).toBe(true);
  });

  it("keeps the settle window short enough to be imperceptible", () => {
    // Recovery waits out this window before it can heal the board, so it
    // buys ambiguity-proofing at the cost of how fast the piece comes back.
    expect(LOST_DRAG_SETTLE_MS).toBeGreaterThan(0);
    expect(LOST_DRAG_SETTLE_MS).toBeLessThanOrEqual(300);
  });
});
