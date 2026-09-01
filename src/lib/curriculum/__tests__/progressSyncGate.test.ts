// Pushing before hydrating overwrites a user's real best scores with the
// zeros a fresh browser starts on — silently, because the server takes the
// client's snapshot as final. It is the bug that flattened the live Puzzle
// Rush leaderboard to a column of zeros. These pin the ordering.

import { describe, expect, it } from "vitest";
import { ProgressSyncGate } from "../progressSyncGate";

describe("ProgressSyncGate", () => {
  it("refuses to push before anything has been hydrated", () => {
    const gate = new ProgressSyncGate();
    expect(gate.canPush("u1")).toBe(false);
  });

  it("still refuses while the hydrating fetch is in flight", () => {
    const gate = new ProgressSyncGate();
    expect(gate.claimHydrate("u1")).toBe(true);
    // The 2.5s push debounce can elapse right here, on a cold serverless GET.
    expect(gate.canPush("u1")).toBe(false);
  });

  it("allows the push once hydration has completed", () => {
    const gate = new ProgressSyncGate();
    gate.claimHydrate("u1");
    gate.completeHydrate("u1");
    expect(gate.canPush("u1")).toBe(true);
  });

  it("allows the push after a FAILED hydrate, so an offline device can still save", () => {
    const gate = new ProgressSyncGate();
    gate.claimHydrate("u1");
    gate.completeHydrate("u1"); // called from `finally`, not the success path
    expect(gate.canPush("u1")).toBe(true);
  });

  it("hydrates once per user, not once per effect run", () => {
    const gate = new ProgressSyncGate();
    expect(gate.claimHydrate("u1")).toBe(true);
    expect(gate.claimHydrate("u1")).toBe(false);
    gate.completeHydrate("u1");
    expect(gate.claimHydrate("u1")).toBe(false);
  });

  it("will not let one user's hydration authorise another's push", () => {
    const gate = new ProgressSyncGate();
    gate.claimHydrate("u1");
    gate.completeHydrate("u1");
    expect(gate.canPush("u2")).toBe(false);
    expect(gate.claimHydrate("u2")).toBe(true);
  });

  it("makes the next sign-in hydrate again before it may push", () => {
    const gate = new ProgressSyncGate();
    gate.claimHydrate("u1");
    gate.completeHydrate("u1");
    gate.reset();
    expect(gate.canPush("u1")).toBe(false);
    expect(gate.claimHydrate("u1")).toBe(true);
    expect(gate.canPush("u1")).toBe(false);
  });
});

describe("ProgressSyncGate — an abandoned hydration", () => {
  it("can be retried after an unmount, instead of wedging the device", () => {
    const gate = new ProgressSyncGate();
    expect(gate.claimHydrate("u1")).toBe(true);
    // StrictMode's double-mount, or `user` changing identity: the effect is
    // torn down with the fetch still in flight.
    gate.abandonHydrate("u1");
    expect(gate.claimHydrate("u1")).toBe(true);
    gate.completeHydrate("u1");
    expect(gate.canPush("u1")).toBe(true);
  });

  it("does not revoke a hydration that had already completed", () => {
    const gate = new ProgressSyncGate();
    gate.claimHydrate("u1");
    gate.completeHydrate("u1"); // settled before the unmount
    gate.abandonHydrate("u1");
    expect(gate.canPush("u1")).toBe(true);
    expect(gate.claimHydrate("u1")).toBe(false);
  });
});
