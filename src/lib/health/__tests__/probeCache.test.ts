import { describe, expect, it, beforeEach, vi } from "vitest";
import { cachedProbe, __resetProbeCache, PROBE_TTL_MS } from "../probeCache";

/**
 * `/api/health/llm` and `/api/health/anthropic` make a REAL billed LLM call per
 * request, with no auth and no rate limit. A human checking once is fine; a
 * public endpoint anyone can loop is not — it bills the account and can hit
 * provider rate limits that then affect real users.
 *
 * The assertions that matter are the ones counting how many times the probe
 * function actually ran, because that count IS the bill.
 */

beforeEach(() => __resetProbeCache());

describe("cachedProbe — repeat callers must not each bill", () => {
  it("runs the probe on a cold cache", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true });
    const r = await cachedProbe("k", fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(r.cached).toBe(false);
    expect(r.value).toEqual({ ok: true });
  });

  it("serves repeat callers from cache without billing again", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true });
    await cachedProbe("k", fn);
    for (let i = 0; i < 50; i++) await cachedProbe("k", fn);
    // 50 extra requests, still ONE billed call.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("marks a cached answer as cached, with its age", async () => {
    // A human debugging an outage must never be shown a stale verdict as if it
    // were live — that is the whole failure mode this codebase just spent a
    // day removing elsewhere.
    let t = 1_000_000;
    const now = () => t;
    const fn = vi.fn().mockResolvedValue({ ok: true });
    await cachedProbe("k", fn, PROBE_TTL_MS, now);
    t += 5_000;
    const r = await cachedProbe("k", fn, PROBE_TTL_MS, now);
    expect(r.cached).toBe(true);
    expect(r.ageMs).toBe(5_000);
  });

  it("probes again once the window expires, so monitoring stays live", async () => {
    let t = 1_000_000;
    const now = () => t;
    const fn = vi.fn().mockResolvedValue({ ok: true });
    await cachedProbe("k", fn, 60_000, now);
    t += 60_001;
    const r = await cachedProbe("k", fn, 60_000, now);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(r.cached).toBe(false);
  });

  it("collapses a concurrent burst into ONE probe (single-flight)", async () => {
    // Without single-flight, a burst arriving in the same tick all miss the
    // cache together and every one of them bills.
    let release: (v: unknown) => void = () => {};
    const gate = new Promise((r) => (release = r));
    const fn = vi.fn().mockImplementation(async () => {
      await gate;
      return { ok: true };
    });

    const all = Promise.all(
      Array.from({ length: 25 }, () => cachedProbe("k", fn)),
    );
    release({});
    const results = await all;

    expect(fn).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(25);
    expect(results.every((r) => r.value)).toBe(true);
  });

  it("keeps separate keys separate", async () => {
    const a = vi.fn().mockResolvedValue("a");
    const b = vi.fn().mockResolvedValue("b");
    expect((await cachedProbe("a", a)).value).toBe("a");
    expect((await cachedProbe("b", b)).value).toBe("b");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("caches a FAILED probe too, so an outage isn't hammered", async () => {
    // The probe function returns a failure verdict rather than throwing (both
    // routes catch internally), so this is the shape production produces.
    const fn = vi.fn().mockResolvedValue({ ok: false, error: "503" });
    await cachedProbe("k", fn);
    await cachedProbe("k", fn);
    await cachedProbe("k", fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not poison the cache when the probe throws", async () => {
    // A thrown error must not be stored as a verdict — the next caller should
    // get a real attempt rather than a cached exception.
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({ ok: true });
    await expect(cachedProbe("k", fn)).rejects.toThrow("boom");
    const r = await cachedProbe("k", fn);
    expect(r.value).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("uses a window short enough that a 5-minute monitor always probes live", () => {
    expect(PROBE_TTL_MS).toBeLessThan(5 * 60_000);
  });
});
