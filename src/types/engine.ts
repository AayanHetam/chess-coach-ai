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
}

export interface WorkerJob {
  commands: string[];
  finalMessage: string;
  onNewMessage?: (messages: string[]) => void;
  resolve: (messages: string[]) => void;
}
