import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  withFirestoreTimeout,
  FirestoreTimeoutError,
} from "../withFirestoreTimeout";

describe("withFirestoreTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the underlying value when it beats the deadline", async () => {
    const p = Promise.resolve({ id: "u1" });
    await expect(withFirestoreTimeout(p, "users.get", 1_000)).resolves.toEqual({
      id: "u1",
    });
  });

  it("throws FirestoreTimeoutError when the underlying never resolves", async () => {
    const slow = new Promise(() => {
      /* never resolves */
    });
    // Attach .catch before advancing timers so the rejection always has a
    // handler attached when it fires — otherwise vitest flags it as an
    // unhandled rejection between the timer firing and our awaiting it.
    const captured = withFirestoreTimeout(slow, "users.get", 1_000).catch(
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(1_001);
    const err = await captured;
    expect(err).toBeInstanceOf(FirestoreTimeoutError);
  });

  it("error carries the op label and the deadline value", async () => {
    const slow = new Promise(() => undefined);
    const captured = withFirestoreTimeout(
      slow,
      "users.getUserById(uX)",
      500,
    ).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(501);
    const err = (await captured) as FirestoreTimeoutError;
    expect(err).toBeInstanceOf(FirestoreTimeoutError);
    expect(err.op).toBe("users.getUserById(uX)");
    expect(err.timeoutMs).toBe(500);
    expect(err.message).toContain("500ms");
  });

  it("clears the timer when the underlying promise wins", async () => {
    await withFirestoreTimeout(Promise.resolve(42), "x", 60_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates underlying rejections instead of stalling the deadline", async () => {
    const failing = Promise.reject(new Error("firestore network error"));
    await expect(
      withFirestoreTimeout(failing, "users.get", 1_000),
    ).rejects.toThrow("firestore network error");
  });
});
