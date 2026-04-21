import { DEFAULT_ENGINE } from "@/constants";
import { getRecommendedWorkersNb } from "@/lib/engine/worker";
import { EngineName } from "@/types/enums";
import { CurrentPosition, GameEval, SavedEvals } from "@/types/eval";
import { Chess } from "chess.js";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export const gameEvalAtom = atom<GameEval | undefined>(undefined);
export const gameAtom = atom(new Chess());
export const boardAtom = atom(new Chess());
export const currentPositionAtom = atom<CurrentPosition>({});

export const boardOrientationAtom = atom(true);
export const showBestMoveArrowAtom = atom(true);
export const showPlayerMoveIconAtom = atom(true);

export const engineNameAtom = atom<EngineName>(DEFAULT_ENGINE);
export const engineDepthAtom = atom(14);
export const engineMultiPvAtom = atom(3);
export const engineWorkersNbAtom = atomWithStorage(
  "engineWorkersNb",
  getRecommendedWorkersNb()
);
export const evaluationProgressAtom = atom(0);

export const savedEvalsAtom = atom<SavedEvals>({});

// Atom for triggering move-specific analysis in AI coach
export const moveAnalysisRequestAtom = atom<{
  moveIdx: number;
  move: string;
  moveNumber: number;
} | null>(null);

// Atom for expanding the right panel to fullscreen
export const panelExpandedAtom = atom(false);

// Atom for which collapsible analysis sections are visible (persisted)
export type AnalysisSectionId =
  | "graph"
  | "engine"
  | "stats"
  | "gameInfo"
  | "moves";

export const visibleSectionsAtom = atomWithStorage<AnalysisSectionId[]>(
  "analysisVisibleSections",
  ["graph", "engine"]
);

// Atom for storing the user's username and player color
export const userPlayerInfoAtom = atom<{
  username: string | null;
  playerColor: "white" | "black" | null;
}>({
  username: null,
  playerColor: null,
});
