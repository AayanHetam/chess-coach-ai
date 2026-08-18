export interface EngineWorker {
  isReady: boolean;
  uci(command: string): void;
  listen: (data: string) => void;
  terminate: () => void;
  /**
   * If a previous sendCommandsToWorker call is still pending its
   * finalMessage when a new one is issued, the new call invokes this
   * hook to reject the prior promise with a Superseded error. Without
   * this, the prior promise would dangle forever because its listener
   * (worker.listen) gets overwritten by the new call. Cleared on
   * resolve/reject so an idle worker has no hook set.
   */
  rejectActive?: (err: Error) => void;
  /**
   * Resolves/rejects once the underlying `Worker` reports a load or runtime
   * error (T7). `new Worker(url)` does not throw when the script 404s or is
   * blocked by a network filter — it fires an `error` event, and nothing was
   * listening. The `uci` handshake in `addNewWorker` then waited for a
   * `uciok` that could never come, so `UciEngine.create()` hung FOREVER: no
   * resolve, no reject, no timeout. `useEngine` sat on `engine === null`
   * indefinitely, which the coach's composer gate read as "not analyzing" and
   * unlocked. Awaiting this is what turns that hang into a real failure.
   */
  errored: Promise<Error>;
}

export interface WorkerJob {
  commands: string[];
  finalMessage: string;
  onNewMessage?: (messages: string[]) => void;
  resolve: (messages: string[]) => void;
}
