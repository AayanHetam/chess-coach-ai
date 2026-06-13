/**
 * The curriculum — a curated, ordered learning path (fundamentals → advanced)
 * over the tactical theme taxonomy. We DON'T use raw tree depth (it surfaces
 * pattern trivia and dead themes with no puzzles); instead this is a hand-
 * ordered syllabus. Every theme id below is emitted by the FEN analyzer
 * (scripts/neo4j-loaders/fen-analyzer.mjs) and therefore has real HAS_THEME
 * puzzle coverage in Neo4j — so a unit never resolves to an empty feed.
 */

export interface CurriculumUnit {
  id: string;
  title: string;
  blurb: string;
  /** Canonical kebab Neo4j :Theme.id values this unit drills. */
  themes: string[];
}

export const SYLLABUS: CurriculumUnit[] = [
  {
    id: "safety",
    title: "Stop hanging pieces",
    blurb: "The #1 way to lose rating points — and the fastest to fix.",
    themes: ["hanging-piece"],
  },
  {
    id: "forks",
    title: "Forks & double attacks",
    blurb: "Hit two targets at once and win material.",
    themes: ["fork", "double-attack"],
  },
  {
    id: "pins-skewers",
    title: "Pins & skewers",
    blurb: "Line pieces up and freeze or win them.",
    themes: ["pin", "skewer"],
  },
  {
    id: "back-rank",
    title: "Back-rank tactics",
    blurb: "Spot and deliver mates down the last rank.",
    themes: ["back-rank"],
  },
  {
    id: "mates",
    title: "Checkmate patterns",
    blurb: "Recognize forced mates before your opponent does.",
    themes: ["mating-attack"],
  },
  {
    id: "discovered",
    title: "Discovered attacks",
    blurb: "Move one piece to unleash another.",
    themes: ["discovered-attack"],
  },
  {
    id: "defenders",
    title: "Remove the defender",
    blurb: "Deflect or capture what's holding the position together.",
    themes: ["removal-of-defender", "deflection"],
  },
  {
    id: "trapped",
    title: "Trap the pieces",
    blurb: "Corner enemy pieces with no escape.",
    themes: ["trapped-piece"],
  },
  {
    id: "king-attack",
    title: "Attack the king",
    blurb: "Convert an exposed king into a winning attack.",
    themes: ["exposed-king", "kingside-attack"],
  },
  {
    id: "sacrifices",
    title: "Sacrifices",
    blurb: "Give up material for a decisive blow.",
    themes: ["sacrifice"],
  },
  {
    id: "advanced",
    title: "Advanced motifs",
    blurb: "X-rays, interference, and zugzwang.",
    themes: ["x-ray", "interference", "zugzwang"],
  },
  {
    id: "endgames",
    title: "Endgame technique",
    blurb: "Convert and hold the positions that decide games.",
    themes: ["endgame", "rook-endgame", "pawn-endgame"],
  },
];

const THEME_TO_UNIT: Record<string, CurriculumUnit> = (() => {
  const m: Record<string, CurriculumUnit> = {};
  for (const unit of SYLLABUS) for (const t of unit.themes) m[t] = unit;
  return m;
})();

export function unitForTheme(themeId: string): CurriculumUnit | undefined {
  return THEME_TO_UNIT[themeId];
}

export function unitById(unitId: string): CurriculumUnit | undefined {
  return SYLLABUS.find((u) => u.id === unitId);
}

export function allSyllabusThemes(): string[] {
  return SYLLABUS.flatMap((u) => u.themes);
}
