import {
  CHESS_TERM_GLOSSARY,
  type ChessTermEntry,
} from "@/components/puzzle/ChessTermGlossary";
import { unitForTheme } from "@/lib/curriculum/syllabus";

/**
 * What the "Reference" tool shows for a puzzle's motif.
 *
 * Built from STATIC content only — the 15-term glossary that already backs the
 * coach's inline term chips, with the curriculum unit blurb as a fallback.
 * When neither covers a theme this returns null and the caller shows nothing,
 * because the alternative is generating an explanation at read time, and an
 * invented definition of a chess motif is exactly the class of confident
 * fabrication that produced the "Qxd8# is checkmate" bug.
 *
 * Coverage is honestly partial: the glossary has 15 terms and the syllabus
 * covers ~20 theme ids across 12 units, against ~70 themes in the Lichess
 * taxonomy. The tool is disabled rather than vague when we have nothing.
 */

export interface ThemeReference {
  /** Display name, e.g. "Fork". */
  title: string;
  /** One or two sentences. Always present. */
  summary: string;
  /** Longer explanation. Only from the glossary. */
  detail?: string;
  example?: string;
  /** Where the text came from — surfaced so the UI can style it honestly. */
  source: "glossary" | "syllabus";
}

/**
 * Puzzle themes arrive in two vocabularies — Lichess camelCase from the CSV
 * feed (`discoveredAttack`) and kebab from Neo4j/the curriculum
 * (`discovered-attack`) — while glossary keys are plain English with spaces
 * ("discovered attack"). Normalise all three to the glossary's shape.
 */
function toGlossaryKey(theme: string): string {
  return theme
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .toLowerCase();
}

/** kebab-case, which is what the syllabus indexes themes by. */
function toKebab(theme: string): string {
  return theme
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .trim()
    .toLowerCase();
}

function fromGlossary(entry: ChessTermEntry): ThemeReference {
  return {
    title: entry.name,
    summary: entry.short,
    detail: entry.detail,
    example: entry.example,
    source: "glossary",
  };
}

/**
 * Resolve the best available reference for a puzzle's themes.
 *
 * Themes are tried in order, so the caller should pass them most-specific
 * first. Glossary entries win over syllabus blurbs for the same theme: a
 * definition of the motif beats a one-line pitch for the unit that contains it.
 *
 * @returns null when nothing static covers any of these themes.
 */
export function findThemeReference(
  themes: string[] | undefined,
): ThemeReference | null {
  if (!themes || themes.length === 0) return null;

  // Full pass for glossary hits before falling back, so a later theme with a
  // real definition beats an earlier one that only has a unit blurb.
  for (const theme of themes) {
    const entry = CHESS_TERM_GLOSSARY[toGlossaryKey(theme)];
    if (entry) return fromGlossary(entry);
  }

  for (const theme of themes) {
    const unit = unitForTheme(toKebab(theme));
    if (unit) {
      return {
        title: unit.title,
        summary: unit.blurb,
        source: "syllabus",
      };
    }
  }

  return null;
}
