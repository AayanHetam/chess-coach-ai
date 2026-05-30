import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withTimeout } from "../withTimeout";

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves to the underlying value when it beats the timeout", async () => {
    const p = Promise.resolve("ok");
    const result = await withTimeout(p, 1_000);
    expect(result).toBe("ok");
  });

  it("resolves to null when the timeout fires before the promise resolves", async () => {
    let resolveFn: (v: string) => void = () => undefined;
    const slow = new Promise<string>((resolve) => {
      resolveFn = resolve;
    });
    const racePromise = withTimeout(slow, 1_000);
    // Push past the timeout.
    await vi.advanceTimersByTimeAsync(1_001);
    expect(await racePromise).toBeNull();
    // Late resolution from the underlying promise is harmless.
    resolveFn("late");
  });

  it("resolves to null and warns when the underlying promise rejects", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failing = Promise.reject(new Error("boom"));
    const result = await withTimeout(failing, 1_000);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("clears the timeout when the underlying promise resolves first", async () => {
    // If the timeout were not cleared, a stale setTimeout would still
    // fire after the test runs. Use the fake-timers handle count to
    // verify nothing is pending after the race settles.
    const fast = Promise.resolve(42);
    await withTimeout(fast, 60_000);
    // No timers should remain queued.
    expect(vi.getTimerCount()).toBe(0);
  });
});
