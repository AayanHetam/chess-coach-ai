/**
 * Play-to-learn — close the loop between game analysis and the curriculum.
 *
 * Game analysis emits `[CONCEPT:<camelCaseKey>]` tags on the user's mistakes.
 * This maps those keys to canonical curriculum theme ids (kebab, with real
 * puzzle coverage) and seeds a spaced-repetition card per theme — so the
 * patterns you actually missed in a real game become tomorrow's training.
 *
 * Pure (no React) so it unit-tests in the node env. Deliberately does NOT
 * import puzzleRepository (which pulls the neo4j driver into the client bundle).
 */

import { allSyllabusThemes } from "./syllabus";
import { QUIZ_FOCUS_THEME_IDS } from "@/components/onboarding/quizThemes";
import { ThemeSrsCard, createCard } from "./puzzleThemeSrs";

/** Themes with real puzzle coverage that the curriculum/SRS can drill. */
const KNOWN = new Set<string>([
  ...allSyllabusThemes(),
  ...QUIZ_FOCUS_THEME_IDS,
]);

/** camelCase / spaced / snake → kebab. */
function kebab(s: string): string {
  return s
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

/** Map fine-grained / non-curriculum concept ids onto the nearest KNOWN theme. */
const ALIAS: Record<string, string> = {
  // forks
  "knight-fork": "fork",
  "pawn-fork": "fork",
  "bishop-fork": "fork",
  "queen-fork": "fork",
  "double-check": "double-attack",
  // discovered
  "discovered-check": "discovered-attack",
  "discovered-attack-on-queen": "discovered-attack",
  // mates
  mate: "mating-attack",
  checkmate: "mating-attack",
  "mate-in-1": "mating-attack",
  "mate-in-2": "mating-attack",
  "mate-in-3": "mating-attack",
  "mate-in-4": "mating-attack",
  "mate-in-5": "mating-attack",
  "smothered-mate": "mating-attack",
  "back-rank-mate": "back-rank",
  // king attacks
  "queenside-attack": "kingside-attack",
  "attacking-f2-f7": "exposed-king",
  // trapped
  "trapping-piece": "trapped-piece",
  // pawns
  "under-promotion": "promotion",
  underpromotion: "promotion",
  // endgames → the single endgame unit theme when no specific unit exists
  "bishop-endgame": "endgame",
  "knight-endgame": "endgame",
  "queen-endgame": "endgame",
  "queen-rook-endgame": "endgame",
  // x-ray spellings
  "x-ray-attack": "x-ray",
  xray: "x-ray",
};

/** Map raw `[CONCEPT]` keys (camelCase TACTICAL_THEMES ids) → deduped KNOWN
 *  curriculum theme ids. Unmappable keys are dropped. */
export function conceptKeysToThemes(conceptKeys: string[]): string[] {
  const out: string[] = [];
  for (const raw of conceptKeys) {
    if (!raw) continue;
    const k = kebab(raw);
    const target = ALIAS[k] ?? (KNOWN.has(k) ? k : undefined);
    if (target && KNOWN.has(target) && !out.includes(target)) out.push(target);
  }
  return out;
}

/** Seed an SRS card for any newly-detected weakness theme (idempotent: keeps
 *  existing cards untouched). Returns the same object reference when unchanged
 *  so callers can skip a state write. */
export function enrollThemesIntoSrs(
  themes: string[],
  cards: Record<string, ThemeSrsCard>,
  now: number
): Record<string, ThemeSrsCard> {
  let changed = false;
  const next = { ...cards };
  for (const t of themes) {
    if (!next[t]) {
      next[t] = createCard(t);
      changed = true;
    }
  }
  void now;
  return changed ? next : cards;
}
