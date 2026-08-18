import { isWasmSupported } from "@/lib/engine/shared";
import { Stockfish11 } from "@/lib/engine/stockfish11";
import { Stockfish16 } from "@/lib/engine/stockfish16";
import { Stockfish16_1 } from "@/lib/engine/stockfish16_1";
import { Stockfish17 } from "@/lib/engine/stockfish17";
import { UciEngine } from "@/lib/engine/uciEngine";
import { EngineName } from "@/types/enums";
import { useEffect, useState } from "react";

/**
 * Why this hook reports a status (T7, SILENT_SUBSTITUTION_HANDOFF §4).
 *
 * It used to return `UciEngine | null`, and `null` meant four different
 * things that callers could not tell apart:
 *
 *   1. the engine is still downloading and booting — Stockfish is 7.16 MB and
 *      production is never cross-origin-isolated (`next.config.ts` sets COOP
 *      `same-origin-allow-popups`, so `SharedArrayBuffer` is undefined and the
 *      search runs single-threaded). On a mid-range Android this window is
 *      long;
 *   2. this browser cannot run WASM at all — the effect returned early and
 *      nothing ever happened;
 *   3. `create()` REJECTED — `/engines/*` blocked by a network filter, or the
 *      worker died. The old `.then()` had no `.catch()`, so the rejection was
 *      unhandled and the state simply stayed `null` forever;
 *   4. no engine was requested.
 *
 * Cases 2 and 3 are indistinguishable from case 1 while you are only looking
 * at `engine === null` — and the coach's composer gate was doing exactly that.
 * It unlocks when the engine is "not loading", so a browser that could never
 * produce an evaluation presented an open, inviting input box, and the answer
 * that came back was written with the TOP MISTAKES section silently absent.
 * No error, no spinner, no hedge: the failure mode this whole programme is
 * about.
 *
 * Telling the four apart is what lets the UI say "coaching without engine
 * data" instead of pretending nothing is missing.
 */
export type EngineStatus =
  /** No engine requested yet. */
  | "idle"
  /** `create()` is in flight — evaluations ARE coming, just not yet. */
  | "loading"
  /** Ready to evaluate. */
  | "ready"
  /** This browser cannot run the engine; no evaluation will ever arrive. */
  | "unsupported"
  /** `create()` rejected; no evaluation will ever arrive. */
  | "failed";

export interface EngineState {
  engine: UciEngine | null;
  status: EngineStatus;
}

/**
 * True when no evaluation is ever going to arrive for this session — as
 * opposed to "not yet". The distinction the UI and the prompt both need.
 */
export function isEngineUnavailable(status: EngineStatus): boolean {
  return status === "unsupported" || status === "failed";
}

export const useEngineWithStatus = (
  engineName: EngineName | undefined,
): EngineState => {
  const [state, setState] = useState<EngineState>({
    engine: null,
    status: "idle",
  });

  useEffect(() => {
    if (!engineName) {
      setState({ engine: null, status: "idle" });
      return;
    }

    if (engineName !== EngineName.Stockfish11 && !isWasmSupported()) {
      // Previously a bare `return`, leaving the caller on a `null` it could
      // not distinguish from "still booting".
      setState({ engine: null, status: "unsupported" });
      return;
    }

    // A create() still in flight when `engineName` changes must not install
    // its engine over the newer one, nor report its failure as the new
    // engine's.
    let cancelled = false;
    setState((prev) => ({ engine: prev.engine, status: "loading" }));

    pickEngine(engineName)
      .then((newEngine) => {
        if (cancelled) {
          newEngine.shutdown();
          return;
        }
        setState((prev) => {
          prev.engine?.shutdown();
          return { engine: newEngine, status: "ready" };
        });
      })
      .catch(() => {
        // The `/engines/*` request being blocked or the worker dying used to
        // land here as an unhandled rejection and leave `engine` null with no
        // way to tell it apart from a slow boot.
        if (cancelled) return;
        setState((prev) => {
          prev.engine?.shutdown();
          return { engine: null, status: "failed" };
        });
      });

    return () => {
      cancelled = true;
    };
  }, [engineName]);

  return state;
};

/** Back-compat: callers that only need the engine handle. */
export const useEngine = (engineName: EngineName | undefined) =>
  useEngineWithStatus(engineName).engine;

const pickEngine = (engine: EngineName): Promise<UciEngine> => {
  switch (engine) {
    case EngineName.Stockfish17:
      return Stockfish17.create(false);
    case EngineName.Stockfish17Lite:
      return Stockfish17.create(true);
    case EngineName.Stockfish16_1:
      return Stockfish16_1.create(false);
    case EngineName.Stockfish16_1Lite:
      return Stockfish16_1.create(true);
    case EngineName.Stockfish16:
      return Stockfish16.create(false);
    case EngineName.Stockfish16NNUE:
      return Stockfish16.create(true);
    case EngineName.Stockfish11:
      return Stockfish11.create();
  }
};
