import { PIECE_SETS } from "@/constants";
import { atomWithStorage } from "jotai/utils";
import { atom } from "jotai";
import { DEFAULT_PIECE_SET } from "@/lib/licensing/pieceSetLicenses";

export const pieceSetAtom = atomWithStorage<(typeof PIECE_SETS)[number]>(
  "pieceSet",
  DEFAULT_PIECE_SET
);
export const boardHueAtom = atomWithStorage("boardHue", 0);
export const isExplorationModeAtom = atom(false);
export const showNextMoveSuggestionAtom = atomWithStorage(
  "showNextMoveSuggestion",
  true
);
