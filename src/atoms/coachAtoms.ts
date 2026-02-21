import { atom } from "jotai";
import { defaultPersonalityId } from "@/config/coachPersonalities";

// Atom for storing selected coach personality ID
// Persisted to localStorage in the component that uses it
export const selectedCoachIdAtom = atom<string>(defaultPersonalityId);
