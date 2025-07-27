import { PIECE_SETS } from "@/constants";
import { atomWithStorage } from "jotai/utils";
import { atom } from "jotai";

export const pieceSetAtom = atomWithStorage<(typeof PIECE_SETS)[number]>(
  "pieceSet",
  "maestro"
);
export const boardHueAtom = atomWithStorage("boardHue", 0);
export const isExplorationModeAtom = atom(false);
export const showNextMoveSuggestionAtom = atomWithStorage("showNextMoveSuggestion", true);
