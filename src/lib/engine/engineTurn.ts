/**
 * One engine, one job at a time, decided at the page's level.
 *
 * The analysis page has one Stockfish worker and, until now, two callers
 * that each assumed they were alone: the game sweep on load and the
 * live-eval effect for whatever position the board shows. Every search
 * begins with `stopAllCurrentJobs()`, which kills the running search and
 * drops the engine's own queue, so two callers that overlap do not share
 * the engine, they take it from each other, and the loser's promise either
 * rejects (superseded) or never settles at all.
 *
 * A what-if (coachWhatIf.ts) is a third caller, and its searches must
 * finish: the two numbers it draws have to come from one completed search.
 * So the page hands the engine round in turns. A job runs when the engine
 * is free and the next job waits for it, in the order they were asked; a
 * job asked `ahead` goes before the jobs still waiting (the what-if the
 * player just typed should not queue behind a live eval for a square they
 * have already left); a job that throws releases the engine like any
 * other. The engine's own queue is never relied on.
 *
 * Pure: no React, no engine import. The page makes one of these per
 * engine instance (a memo keyed on the engine).
 */

export interface EngineTurn {
  /**
   * Run `job` once the engine is free. Resolves or rejects with the job's
   * own outcome; a rejection never holds up the next job. `ahead` puts the
   * job before those still waiting, after the one running.
   */
  run<T>(job: () => Promise<T>, opts?: { ahead?: boolean }): Promise<T>;
  /** True while a job holds the engine. */
  busy(): boolean;
  /** Jobs waiting for their turn behind the one running. */
  waiting(): number;
}

interface Waiting {
  start: () => void;
}

export function createEngineTurn(): EngineTurn {
  const queue: Waiting[] = [];
  let running = false;

  const pump = () => {
    if (running) return;
    const next = queue.shift();
    if (next) next.start();
  };

  return {
    run<T>(job: () => Promise<T>, opts?: { ahead?: boolean }): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const start = () => {
          running = true;
          let outcome: Promise<T>;
          try {
            outcome = Promise.resolve(job());
          } catch (err) {
            outcome = Promise.reject(err);
          }
          // The engine is free before the caller hears the outcome, so a
          // caller that asks again on resolution never sees it busy.
          outcome.then(
            (value) => {
              running = false;
              pump();
              resolve(value);
            },
            (err) => {
              running = false;
              pump();
              reject(err);
            }
          );
        };
        if (opts?.ahead) queue.unshift({ start });
        else queue.push({ start });
        // The engine is handed over on a microtask, never inside the caller.
        void Promise.resolve().then(pump);
      });
    },
    busy: () => running,
    waiting: () => queue.length,
  };
}
