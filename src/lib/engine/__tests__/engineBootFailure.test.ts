import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * T7 (SILENT_SUBSTITUTION_HANDOFF §4) — the engine boot HANG.
 *
 * `new Worker(url)` does not throw when the script is missing or blocked; it
 * fires an `error` event asynchronously. Nothing listened for that, so the
 * `uci` handshake in `addNewWorker` waited for a `uciok` that was never
 * coming — and `UciEngine.create()` neither resolved nor rejected. Forever.
 *
 * That hang is what made T7 invisible. `useEngine` held `engine === null`, the
 * coach's composer gate read that as "not analyzing" and unlocked, and the
 * user got a confident answer with the engine sections silently absent. A
 * rejection would have been reportable; a hang is indistinguishable from the
 * slow boot that is completely normal on the devices this happens to.
 *
 * These tests pin both escapes: the worker reporting an error, and a worker
 * that loads but never speaks.
 */

const { mockGetEngineWorker } = vi.hoisted(() => ({
  mockGetEngineWorker: vi.fn(),
}));

vi.mock("../worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../worker")>();
  return { ...actual, getEngineWorker: mockGetEngineWorker };
});

import { UciEngine } from "../uciEngine";
import { EngineName } from "@/types/enums";

/** A worker that accepts commands and never answers any of them. */
function makeSilentWorker(errored: Promise<Error>) {
  return {
    isReady: false,
    uci: () => {},
    listen: () => {},
    terminate: vi.fn(),
    errored,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("UciEngine.create — a worker that cannot load", () => {
  it("rejects instead of hanging when the worker reports an error", async () => {
    // The `/engines/*` request blocked by a network filter.
    const worker = makeSilentWorker(
      Promise.resolve(new Error("engine worker failed to load (/engines/x.js): 404")),
    );
    mockGetEngineWorker.mockReturnValue(worker);

    await expect(
      UciEngine.create(EngineName.Stockfish17Lite, "engines/x.js"),
    ).rejects.toThrow(/failed to load/);
  });

  it("terminates the dead worker rather than leaking it", async () => {
    const worker = makeSilentWorker(Promise.resolve(new Error("boom")));
    mockGetEngineWorker.mockReturnValue(worker);

    await expect(
      UciEngine.create(EngineName.Stockfish17Lite, "engines/x.js"),
    ).rejects.toThrow();
    expect(worker.terminate).toHaveBeenCalled();
  });

  it("rejects a worker that loads but never speaks UCI", async () => {
    // No error event ever fires — the script is there, the engine just never
    // answers. Without the boot deadline this is the forever-hang.
    const worker = makeSilentWorker(new Promise<Error>(() => {}));
    mockGetEngineWorker.mockReturnValue(worker);

    const created = UciEngine.create(EngineName.Stockfish17Lite, "engines/x.js");
    const assertion = expect(created).rejects.toThrow(/boot exceeded/);
    await vi.advanceTimersByTimeAsync(95_000);
    await assertion;
  });

  it("does not give up while a slow device is still legitimately booting", async () => {
    // 7.16 MB, single-threaded, cold cache on a mid-range Android is a real
    // case. The deadline is there to catch "never", not to hurry "slow".
    const worker = makeSilentWorker(new Promise<Error>(() => {}));
    mockGetEngineWorker.mockReturnValue(worker);

    const created = UciEngine.create(EngineName.Stockfish17Lite, "engines/x.js");
    let settled = false;
    created.then(
      () => (settled = true),
      () => (settled = true),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe(false);

    // Drain the eventual rejection so it isn't an unhandled promise.
    await vi.advanceTimersByTimeAsync(35_000);
    await expect(created).rejects.toThrow();
  });
});
