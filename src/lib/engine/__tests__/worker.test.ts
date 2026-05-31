import { describe, it, expect } from "vitest";
import { sendCommandsToWorker, WorkerSupersededError } from "../worker";
import type { EngineWorker } from "@/types/engine";

/**
 * Build a fake EngineWorker whose `uci()` just records what was sent and
 * whose `listen` is the function under test (sendCommandsToWorker
 * installs it). Tests then call `worker.listen(fakeData)` to simulate a
 * Stockfish reply arriving over postMessage.
 */
function makeFakeWorker(): EngineWorker {
  return {
    isReady: true,
    uci: () => {
      /* no-op for these tests */
    },
    listen: () => {
      /* will be replaced by sendCommandsToWorker */
    },
    terminate: () => {
      /* no-op */
    },
  };
}

describe("sendCommandsToWorker — supersede semantics", () => {
  it("resolves with collected messages when the finalMessage arrives", async () => {
    const w = makeFakeWorker();
    const p = sendCommandsToWorker(w, ["uci"], "uciok");
    w.listen("id name Stockfish");
    w.listen("uciok");
    await expect(p).resolves.toEqual(["id name Stockfish", "uciok"]);
    expect(w.rejectActive).toBeUndefined();
  });

  it("registers a rejectActive hook while pending and clears it on resolve", async () => {
    const w = makeFakeWorker();
    expect(w.rejectActive).toBeUndefined();
    const p = sendCommandsToWorker(w, ["isready"], "readyok");
    expect(typeof w.rejectActive).toBe("function");
    w.listen("readyok");
    await p;
    expect(w.rejectActive).toBeUndefined();
  });

  it("rejects the prior in-flight promise with WorkerSupersededError when a new call arrives", async () => {
    const w = makeFakeWorker();
    // Attach .catch BEFORE the supersession so vitest doesn't flag an
    // unhandled rejection in the window between reject() and our await.
    const captured = sendCommandsToWorker(w, ["go depth 16"], "bestmove").catch(
      (e: unknown) => e,
    );
    // Second call should supersede the first immediately on entry.
    const second = sendCommandsToWorker(w, ["stop", "isready"], "readyok");
    const err = (await captured) as Error;
    expect(err).toBeInstanceOf(WorkerSupersededError);
    expect(err.name).toBe("WorkerSupersededError");
    // The new call should still be live and complete normally.
    w.listen("readyok");
    await expect(second).resolves.toEqual(["readyok"]);
  });

  it("the new call's listener — not the rejected one — handles subsequent messages", async () => {
    const w = makeFakeWorker();
    const captured = sendCommandsToWorker(w, ["go"], "bestmove").catch(
      (e: unknown) => e,
    );
    const second = sendCommandsToWorker(w, ["isready"], "readyok");
    await captured; // ensure the first rejected before we feed messages
    // This message belongs to the second request and should resolve it.
    w.listen("readyok");
    await expect(second).resolves.toEqual(["readyok"]);
  });

  it("three back-to-back calls only leave the last alive", async () => {
    const w = makeFakeWorker();
    const a = sendCommandsToWorker(w, ["a"], "done").catch((e: unknown) => e);
    const b = sendCommandsToWorker(w, ["b"], "done").catch((e: unknown) => e);
    const c = sendCommandsToWorker(w, ["c"], "done");
    expect(await a).toBeInstanceOf(WorkerSupersededError);
    expect(await b).toBeInstanceOf(WorkerSupersededError);
    w.listen("done");
    await expect(c).resolves.toEqual(["done"]);
  });

  it("onNewMessage fires for each message until the finalMessage", async () => {
    const w = makeFakeWorker();
    const seen: string[][] = [];
    const p = sendCommandsToWorker(
      w,
      ["go depth 8"],
      "bestmove",
      (msgs) => seen.push([...msgs]),
    );
    w.listen("info depth 1 score cp 12");
    w.listen("info depth 2 score cp 14");
    w.listen("bestmove e2e4");
    await p;
    expect(seen).toHaveLength(3);
    expect(seen[2]).toEqual([
      "info depth 1 score cp 12",
      "info depth 2 score cp 14",
      "bestmove e2e4",
    ]);
  });
});
