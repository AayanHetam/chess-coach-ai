import { describe, it, expect } from "vitest";
import {
  track,
  flushTrackingQueue,
  trackPuzzleAttempt,
  trackAnalysisSession,
} from "../client";

/**
 * The repo has no jsdom/happy-dom, so the DOM batching/sendBeacon behavior is
 * exercised against the real /api/track contract (covered in TRK-1), not here.
 * These tests pin the one node-observable guarantee that matters: the SDK is
 * SSR-safe — off-browser (window === undefined) every entry point is an inert,
 * non-throwing no-op, so importing it into a server component can't blow up.
 */
describe("client SDK: SSR safety (no window)", () => {
  it("track() is a no-op and does not throw", () => {
    expect(() => track("page.view", { path: "/x" })).not.toThrow();
  });

  it("flushTrackingQueue() is a no-op and does not throw", () => {
    expect(() => flushTrackingQueue(true)).not.toThrow();
  });

  it("trackPuzzleAttempt() is a no-op and does not throw", () => {
    expect(() => trackPuzzleAttempt({ puzzleId: "p1", correct: true })).not.toThrow();
  });

  it("trackAnalysisSession() is a no-op and does not throw", () => {
    expect(() => trackAnalysisSession({ status: "completed" })).not.toThrow();
  });
});
