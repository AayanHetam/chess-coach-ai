import { EngineName } from "@/types/enums";
import {
  EvaluateGameParams,
  EvaluatePositionWithUpdateParams,
  GameEval,
  PositionEval,
} from "@/types/eval";
import {
  getResultProperty,
  parseEvaluationResults,
} from "./helpers/parseResults";
import { computeAccuracy } from "./helpers/accuracy";
import { getIsStalemate, getWhoIsCheckmated } from "../chess";
import { getLichessEval } from "../lichess";
import { getMovesClassification } from "./helpers/moveClassification";
import { computeEstimatedElo } from "./helpers/estimateElo";
import { EngineWorker, WorkerJob } from "@/types/engine";
import { getEngineWorker, sendCommandsToWorker } from "./worker";
import { withTimeout } from "./helpers/withTimeout";
import { createBestEvalPublisher } from "./helpers/bestEvalPublisher";
import { satisfiesRequest } from "./pickDisplayEval";

const DEFAULT_PER_POSITION_TIMEOUT_MS = 30_000;

/**
 * How long the UCI handshake may take before the engine is declared dead.
 *
 * Generous on purpose: Stockfish 17 Lite is 7.16 MB, production is never
 * cross-origin-isolated (COOP `same-origin-allow-popups` ⇒ no
 * `SharedArrayBuffer` ⇒ single-threaded), and a cold cache on a mid-range
 * Android over a slow connection is a real, legitimate case. This number is
 * meant to catch "never" — not to hurry "slow".
 */
const WORKER_BOOT_TIMEOUT_MS = 90_000;

/**
 * How long an interactive single-position eval pauses for Lichess before it
 * starts the local engine anyway.
 *
 * A warm cloud hit measures ~175ms and saves a whole local search, so a short
 * pause pays for itself. Past that we stop waiting — but we do NOT cancel:
 * the request stays in flight and a late answer still upgrades the result.
 * That is the whole point of the split. While the local search was gated on
 * the cloud response, the wait budget had to be tiny to keep the UI
 * responsive, which meant the cloud answer was usually thrown away.
 */
const CLOUD_HEAD_START_MS = 350;

/**
 * The whole-game sweep on a single-worker device genuinely does block on this
 * — a hit there replaces an entire local search, so it can afford to wait
 * longer than the interactive path, but not the full request timeout.
 * Misses are cheap either way: Lichess 404s in ~175ms.
 */
const CLOUD_GAME_PASS_TIMEOUT_MS = 800;

export class UciEngine {
  public readonly name: EngineName;
  private workers: EngineWorker[] = [];
  private workerQueue: WorkerJob[] = [];
  private isReady = false;
  private enginePath: string;
  private customEngineInit?:
    | ((worker: EngineWorker) => Promise<void>)
    | undefined = undefined;
  private multiPv = 3;
  private elo: number | undefined = undefined;

  private constructor(
    engineName: EngineName,
    enginePath: string,
    customEngineInit: UciEngine["customEngineInit"]
  ) {
    this.name = engineName;
    this.enginePath = enginePath;
    this.customEngineInit = customEngineInit;
  }

  public static async create(
    engineName: EngineName,
    enginePath: string,
    customEngineInit?: UciEngine["customEngineInit"]
  ): Promise<UciEngine> {
    const engine = new UciEngine(engineName, enginePath, customEngineInit);

    await engine.addNewWorker();
    engine.isReady = true;

    return engine;
  }

  private acquireWorker(): EngineWorker | undefined {
    for (const worker of this.workers) {
      if (!worker.isReady) continue;

      worker.isReady = false;
      return worker;
    }

    return undefined;
  }

  private async releaseWorker(worker: EngineWorker) {
    const nextJob = this.workerQueue.shift();
    if (!nextJob) {
      worker.isReady = true;
      return;
    }

    const res = await sendCommandsToWorker(
      worker,
      nextJob.commands,
      nextJob.finalMessage,
      nextJob.onNewMessage
    );

    this.releaseWorker(worker);
    nextJob.resolve(res);
  }

  private async setMultiPv(multiPv: number) {
    if (multiPv === this.multiPv) return;

    // MultiPV=1 is the engine's own default and what every single-line
    // consumer asks for (PuzzleAnalysisPanel, surpriseEngineService). The
    // lower bound was 2 — inherited from the Lines-tab selector, whose
    // smallest offering is 2 — so a multiPv:1 request threw right here,
    // BEFORE the search and before the cloud head-start. That one comparison
    // was the entire "Analyse never returns an evaluation" stall: the panel's
    // catch() swallowed the throw and the stall guard fired 25s later.
    if (multiPv < 1 || multiPv > 10) {
      throw new Error(`Invalid MultiPV value : ${multiPv}`);
    }

    await this.sendCommandsToEachWorker(
      [`setoption name MultiPV value ${multiPv}`, "isready"],
      "readyok"
    );

    this.multiPv = multiPv;
  }

  private async setElo(elo: number) {
    if (elo === this.elo) return;

    if (elo < 1320 || elo > 3190) {
      throw new Error(`Invalid Elo value : ${elo}`);
    }

    await this.sendCommandsToEachWorker(
      ["setoption name UCI_LimitStrength value true", "isready"],
      "readyok"
    );

    await this.sendCommandsToEachWorker(
      [`setoption name UCI_Elo value ${elo}`, "isready"],
      "readyok"
    );

    this.elo = elo;
  }

  public getIsReady(): boolean {
    return this.isReady;
  }

  private throwErrorIfNotReady() {
    if (!this.isReady) {
      throw new Error(`${this.name} is not ready`);
    }
  }

  public shutdown(): void {
    this.isReady = false;
    this.workerQueue = [];

    for (const worker of this.workers) {
      this.terminateWorker(worker);
    }
    this.workers = [];
  }

  private terminateWorker(worker: EngineWorker) {
    console.log(`Terminating worker from ${this.enginePath}`);
    worker.isReady = false;
    worker.uci("quit");
    worker.terminate();
  }

  public async stopAllCurrentJobs(): Promise<void> {
    this.workerQueue = [];
    await this.sendCommandsToEachWorker(["stop", "isready"], "readyok");

    for (const worker of this.workers) {
      this.releaseWorker(worker);
    }
  }

  private async sendCommands(
    commands: string[],
    finalMessage: string,
    onNewMessage?: (messages: string[]) => void
  ): Promise<string[]> {
    const worker = this.acquireWorker();

    if (!worker) {
      return new Promise((resolve) => {
        this.workerQueue.push({
          commands,
          finalMessage,
          onNewMessage,
          resolve,
        });
      });
    }

    const res = await sendCommandsToWorker(
      worker,
      commands,
      finalMessage,
      onNewMessage
    );

    this.releaseWorker(worker);
    return res;
  }

  private async sendCommandsToEachWorker(
    commands: string[],
    finalMessage: string,
    onNewMessage?: (messages: string[]) => void
  ): Promise<void> {
    await Promise.all(
      this.workers.map(async (worker) => {
        await sendCommandsToWorker(
          worker,
          commands,
          finalMessage,
          onNewMessage
        );
        this.releaseWorker(worker);
      })
    );
  }

  private async addNewWorker() {
    const worker = getEngineWorker(this.enginePath);

    // T7 (SILENT_SUBSTITUTION_HANDOFF §4): the handshake below waits for the
    // engine to answer. If the worker script never loaded — 404, a school or
    // corporate filter blocking `/engines/*`, a dead worker — that answer
    // never comes, and this used to wait for it forever: `create()` neither
    // resolved nor rejected, so `useEngine` held `null` indefinitely and the
    // coach's composer read that as "not analyzing" and unlocked.
    //
    // A hang is the worst possible shape for this failure, because it is
    // indistinguishable from a slow boot on exactly the low-end devices where
    // slow boots are normal. Both escapes below convert it into a rejection,
    // which `useEngineWithStatus` turns into a reportable `failed` status.
    const handshake = (async () => {
      await sendCommandsToWorker(worker, ["uci"], "uciok");
      await sendCommandsToWorker(
        worker,
        [`setoption name MultiPV value ${this.multiPv}`, "isready"],
        "readyok"
      );
      await this.customEngineInit?.(worker);
      await sendCommandsToWorker(worker, ["ucinewgame", "isready"], "readyok");
    })();

    let bootTimer: ReturnType<typeof setTimeout> | undefined;
    const bootTimeout = new Promise<never>((_, reject) => {
      bootTimer = setTimeout(
        () =>
          reject(
            new Error(
              `engine boot exceeded ${WORKER_BOOT_TIMEOUT_MS}ms (${this.enginePath})`
            )
          ),
        WORKER_BOOT_TIMEOUT_MS
      );
      (bootTimer as unknown as { unref?: () => void }).unref?.();
    });

    try {
      await Promise.race([
        handshake,
        // A worker that loaded but never speaks UCI is covered by the timeout;
        // one that failed to load at all reports here immediately.
        worker.errored.then((err) => {
          throw err;
        }),
        bootTimeout,
      ]);
    } catch (err) {
      clearTimeout(bootTimer);
      worker.terminate();
      throw err;
    }
    clearTimeout(bootTimer);

    this.workers.push(worker);
    this.releaseWorker(worker);
  }

  private async setWorkersNb(workersNb: number) {
    if (workersNb === this.workers.length) return;

    if (workersNb < 1) {
      throw new Error(
        `Number of workers must be greater than 0, got ${workersNb} instead`
      );
    }

    if (workersNb < this.workers.length) {
      const workersToRemove = this.workers.slice(workersNb);
      this.workers = this.workers.slice(0, workersNb);

      for (const worker of workersToRemove) {
        this.terminateWorker(worker);
      }
      return;
    }

    const workersNbToCreate = workersNb - this.workers.length;

    await Promise.all(
      new Array(workersNbToCreate).fill(0).map(() => this.addNewWorker())
    );
  }

  public async evaluateGame({
    fens,
    uciMoves,
    depth = 16,
    multiPv = this.multiPv,
    setEvaluationProgress,
    playersRatings,
    workersNb = 1,
    useLichessEval = false, // Changed to false for deterministic analysis
    perPositionTimeoutMs = DEFAULT_PER_POSITION_TIMEOUT_MS,
  }: EvaluateGameParams): Promise<GameEval> {
    this.throwErrorIfNotReady();
    this.isReady = false;
    setEvaluationProgress?.(1);

    // ONE `ucinewgame`, HERE — not per position. Every ply below is then
    // searched on a transposition table warmed by the plies before it, which is
    // deliberate: consecutive positions in a game genuinely share structure.
    //
    // DO NOT send any other position through this engine while a sweep is in
    // flight, and do not reuse this instance for hypothetical positions. A null
    // move (one side moving twice) is not reachable by legal play, and mixing
    // such searches into this table corrupts the REAL evaluations that follow.
    // Measured offline on a 12-game corpus: a position worth ~600cp came back
    // as mate-in-17 purely from that carryover, and 3.1% of positions gained or
    // lost a forced mate outright. Those numbers are the eval bar, the accuracy
    // score and every card the review shows.
    //
    // Anything that needs a hypothetical position — the Tier 1 intent prober in
    // src/lib/intent is the live example — must own a SEPARATE engine and clear
    // its table before each search. See `NullMoveProbe` in
    // src/lib/intent/fromGameEval.ts.
    await this.setMultiPv(multiPv);
    await this.sendCommandsToEachWorker(["ucinewgame", "isready"], "readyok");
    this.setWorkersNb(workersNb);

    const positions: PositionEval[] = new Array(fens.length);
    let completed = 0;

    const updateEval = (index: number, positionEval: PositionEval) => {
      completed++;
      positions[index] = positionEval;
      const progress = completed / fens.length;
      setEvaluationProgress?.(99 - Math.exp(-4 * progress) * 99);
    };

    // Process positions sequentially to ensure deterministic results
    for (let i = 0; i < fens.length; i++) {
      const fen = fens[i];

      const whoIsCheckmated = getWhoIsCheckmated(fen);
      if (whoIsCheckmated) {
        updateEval(i, {
          lines: [
            {
              pv: [],
              depth: 0,
              multiPv: 1,
              mate: whoIsCheckmated === "w" ? -1 : 1,
            },
          ],
        });
        continue;
      }

      const isStalemate = getIsStalemate(fen);
      if (isStalemate) {
        updateEval(i, {
          lines: [
            {
              pv: [],
              depth: 0,
              multiPv: 1,
              cp: 0,
            },
          ],
        });
        continue;
      }

      // Per-position timeout-and-retry. Without this, a single stalled
      // Stockfish position can park the whole sweep — UI sits at 50%
      // progress forever. On timeout we abort the engine and retry once
      // at a shallower depth; if THAT also times out (very unlikely) we
      // record a sentinel eval so the sweep can finish.
      let result = await withTimeout(
        this.evaluatePosition(fen, depth, workersNb, useLichessEval),
        perPositionTimeoutMs
      );

      if (result === null) {
        const retryDepth = Math.max(8, depth - 4);
        console.warn(
          `[uciEngine] position ${i + 1}/${fens.length} exceeded ${perPositionTimeoutMs}ms at depth=${depth}; aborting and retrying at depth=${retryDepth}`
        );
        await this.stopAllCurrentJobs();
        result = await withTimeout(
          this.evaluatePosition(fen, retryDepth, workersNb, useLichessEval),
          perPositionTimeoutMs * 2
        );
        if (result === null) {
          console.error(
            `[uciEngine] position ${i + 1}/${fens.length} stalled even at retry depth=${retryDepth}; recording sentinel and moving on`
          );
          await this.stopAllCurrentJobs();
          result = {
            lines: [{ pv: [], depth: 0, multiPv: 1, cp: 0 }],
          };
        }
      }

      updateEval(i, result);
    }

    await this.setWorkersNb(1);
    this.isReady = true;

    const positionsWithClassification = getMovesClassification(
      positions,
      uciMoves,
      fens
    );
    const accuracy = computeAccuracy(positions);
    const estimatedElo = computeEstimatedElo(
      positions,
      playersRatings?.white,
      playersRatings?.black
    );

    return {
      positions: positionsWithClassification,
      estimatedElo,
      accuracy,
      settings: {
        engine: this.name,
        date: new Date().toISOString(),
        depth,
        multiPv,
      },
    };
  }

  private async evaluatePosition(
    fen: string,
    depth = 16,
    workersNb: number,
    useLichessEval = true
  ): Promise<PositionEval> {
    if (workersNb < 2 && useLichessEval) {
      const lichessEval = await getLichessEval(
        fen,
        this.multiPv,
        CLOUD_GAME_PASS_TIMEOUT_MS
      );
      if (satisfiesRequest(lichessEval, depth, this.multiPv)) {
        return lichessEval;
      }
    }

    const results = await this.sendCommands(
      [`position fen ${fen}`, `go depth ${depth}`],
      "bestmove"
    );

    return parseEvaluationResults(results, fen);
  }

  public async evaluatePositionWithUpdate({
    fen,
    depth = 16,
    multiPv = this.multiPv,
    setPartialEval,
    allowCloud = true,
  }: EvaluatePositionWithUpdateParams): Promise<PositionEval> {
    this.throwErrorIfNotReady();

    // Lichess's cloud eval is usually deeper than anything this WASM engine
    // will reach, so it wins by default. `allowCloud: false` lets a caller
    // insist on THIS engine — the point of an engine selector is that picking
    // one changes what you get.
    const cloudPromise = allowCloud ? getLichessEval(fen, multiPv) : null;

    await this.stopAllCurrentJobs();
    await this.setMultiPv(multiPv);

    console.log(`Evaluating position: ${fen}`);

    // Pause briefly for the cloud, because a hit means no local search at all.
    // `withTimeout` gives up waiting without cancelling, so the request is
    // still alive below.
    if (cloudPromise) {
      const quickCloud = await withTimeout(cloudPromise, CLOUD_HEAD_START_MS);
      if (satisfiesRequest(quickCloud, depth, multiPv)) {
        setPartialEval?.(quickCloud!);
        return quickCloud!;
      }
    }

    // Slower than the head start — so search locally now, and let the cloud
    // answer land whenever it lands. This is the fix: the local search used to
    // wait for this request to settle before it could even begin, which is why
    // the request timeout had to be set below the endpoint's own median
    // response time and the deeper answer was routinely discarded.
    const publisher = createBestEvalPublisher(setPartialEval);

    void cloudPromise?.then(
      (cloud) => {
        if (satisfiesRequest(cloud, depth, multiPv)) publisher.offer(cloud);
      },
      () => {
        /* getLichessEval already swallows its own errors; belt and braces. */
      }
    );

    const onNewMessage = (messages: string[]) => {
      if (!setPartialEval) return;
      const parsedResults = parseEvaluationResults(messages, fen);
      publisher.offer({ ...parsedResults, source: "local" });
    };

    const results = await this.sendCommands(
      [`position fen ${fen}`, `go depth ${depth}`],
      "bestmove",
      onNewMessage
    );

    const localEval: PositionEval = {
      ...parseEvaluationResults(results, fen),
      source: "local",
    };
    publisher.offer(localEval);

    // The cloud may have won while the local search was still deepening.
    return publisher.best() ?? localEval;
  }

  public async getEngineNextMove(
    fen: string,
    elo: number,
    depth = 16
  ): Promise<string | undefined> {
    this.throwErrorIfNotReady();

    await this.stopAllCurrentJobs();
    await this.setElo(elo);

    console.log(`Evaluating position: ${fen}`);

    const results = await this.sendCommands(
      [`position fen ${fen}`, `go depth ${depth}`],
      "bestmove"
    );

    const moveResult = results.find((result) => result.startsWith("bestmove"));
    const move = getResultProperty(moveResult ?? "", "bestmove");
    if (!move) {
      throw new Error("No move found");
    }

    return move === "(none)" ? undefined : move;
  }
}
