import { EngineWorker } from "@/types/engine";
import { isIosDevice, isMobileDevice } from "./shared";

export const getEngineWorker = (enginePath: string): EngineWorker => {
  // Force absolute resolution against the origin so nested routes
  // (/preview/analysis, /play/<id>, …) don't 404 on the worker JS.
  const resolved =
    enginePath.startsWith("/") || /^https?:/.test(enginePath)
      ? enginePath
      : `/${enginePath}`;
  console.log(`Creating worker from ${resolved}`);

  const worker = new window.Worker(resolved);

  // T7: `new Worker()` does not throw when the script is missing or blocked —
  // it fires `error` asynchronously. With nobody listening, the `uci`
  // handshake waited on a `uciok` that was never coming and
  // `UciEngine.create()` hung forever. A hang is worse than a failure here:
  // a failure can be reported to the user, and a hang cannot be told apart
  // from a slow boot.
  const errored = new Promise<Error>((resolve) => {
    worker.onerror = (event) => {
      const detail =
        typeof event === "object" && event && "message" in event
          ? String((event as ErrorEvent).message)
          : "unknown error";
      resolve(new Error(`engine worker failed to load (${resolved}): ${detail}`));
    };
  });

  const engineWorker: EngineWorker = {
    isReady: false,
    uci: (command: string) => worker.postMessage(command),
    listen: () => null,
    terminate: () => worker.terminate(),
    errored,
  };

  worker.onmessage = (event) => {
    engineWorker.listen(event.data);
  };

  return engineWorker;
};

/**
 * Error subclass thrown when a sendCommandsToWorker promise is rejected
 * because a newer call superseded it. Keyed off `.name` so callers can
 * recognize and choose to swallow it without misreading every error.
 */
export class WorkerSupersededError extends Error {
  constructor(message = "sendCommandsToWorker call superseded by a newer request") {
    super(message);
    this.name = "WorkerSupersededError";
  }
}

export const sendCommandsToWorker = (
  worker: EngineWorker,
  commands: string[],
  finalMessage: string,
  onNewMessage?: (messages: string[]) => void
): Promise<string[]> => {
  // Reject any prior in-flight promise. Without this, replacing
  // worker.listen below would orphan the previous caller — its promise
  // would never resolve because no listener is installed to catch its
  // finalMessage. Surface the supersession as an explicit error so the
  // caller can decide (catch + ignore, or retry).
  worker.rejectActive?.(new WorkerSupersededError());

  return new Promise((resolve, reject) => {
    const messages: string[] = [];

    // Stash the reject so the NEXT sendCommandsToWorker can surface our
    // supersession to whoever's awaiting this promise.
    worker.rejectActive = reject;

    worker.listen = (data) => {
      messages.push(data);
      onNewMessage?.(messages);

      if (data.startsWith(finalMessage)) {
        worker.rejectActive = undefined;
        resolve(messages);
      }
    };

    for (const command of commands) {
      worker.uci(command);
    }
  });
};

export const getRecommendedWorkersNb = (): number => {
  const maxWorkersNbFromThreads = Math.max(
    1,
    Math.round(navigator.hardwareConcurrency - 4),
    Math.floor((navigator.hardwareConcurrency * 2) / 3)
  );

  const maxWorkersNbFromMemory =
    "deviceMemory" in navigator && typeof navigator.deviceMemory === "number"
      ? Math.max(1, Math.round(navigator.deviceMemory))
      : 4;

  const maxWorkersNbFromDevice = isIosDevice() ? 2 : isMobileDevice() ? 4 : 8;

  return Math.min(
    maxWorkersNbFromThreads,
    maxWorkersNbFromMemory,
    maxWorkersNbFromDevice
  );
};
