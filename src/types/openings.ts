/**
 * Types for the Opening Training & Drills system.
 */

export interface OpeningLine {
  /** Unique identifier */
  id: string;
  /** Moves in SAN format: ["e4", "e5", "Nf3", "Nc6", ...] */
  moves: string[];
  /** Name of this specific variation */
  name: string;
  /** Brief description of the strategic idea */
  description: string;
}

export interface OpeningRepertoire {
  /** Unique identifier */
  id: string;
  /** Display name (e.g., "Sicilian Dragon") */
  name: string;
  /** ECO code (e.g., "B70") */
  eco: string;
  /** Which color this repertoire is for */
  color: "white" | "black";
  /** Difficulty level */
  difficulty: "beginner" | "intermediate" | "advanced";
  /** Brief overview of the opening's character */
  description: string;
  /** Key strategic themes */
  themes: string[];
  /** The main line and critical variations */
  lines: OpeningLine[];
}

/**
 * A chapter within a course — groups related lines under a named section.
 */
export interface OpeningChapter {
  /** Unique identifier */
  id: string;
  /** Chapter display name (e.g., "Vienna Gambit Best Line (3...d5)") */
  name: string;
  /** Brief description */
  description: string;
  /** The repertoire data for this chapter (lines, color, etc.) */
  repertoire: OpeningRepertoire;
}

/**
 * A full opening course — one card on the browse page, containing multiple chapters.
 */
export interface OpeningCourse {
  /** Unique identifier */
  id: string;
  /** Course display name (e.g., "The Vienna Game") */
  name: string;
  /** Which color this course is for */
  color: "white" | "black";
  /** Difficulty level */
  difficulty: "beginner" | "intermediate" | "advanced";
  /** Course description */
  description: string;
  /** Key themes */
  themes: string[];
  /** Ordered chapters */
  chapters: OpeningChapter[];
}

export interface DrillProgress {
  /** Repertoire ID */
  repertoireId: string;
  /** Line ID */
  lineId: string;
  /** How many times drilled */
  attempts: number;
  /** How many times correct on first try */
  correctFirstTry: number;
  /** Furthest move reached without error */
  maxDepthReached: number;
  /** Spaced repetition: ease factor (SM-2) */
  easeFactor: number;
  /** Spaced repetition: interval in days */
  interval: number;
  /** Spaced repetition: next review timestamp */
  nextReview: number;
  /** Last drilled timestamp */
  lastDrilled: number;
}

export interface DrillSession {
  /** Current repertoire being drilled */
  repertoire: OpeningRepertoire;
  /** Current line being drilled */
  line: OpeningLine;
  /** Current move index the user needs to play */
  currentMoveIndex: number;
  /** Whether the current line is complete */
  isComplete: boolean;
  /** Whether the user made an error on this attempt */
  hadError: boolean;
}
