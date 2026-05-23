/**
 * Generator dispatch + shared types.
 *
 * Each QuestionCategory has a dedicated generator that:
 *   1. Picks a fixture (or accepts pre-supplied position context for game_review /
 *      position_analysis).
 *   2. Builds a category-appropriate context block for the student persona.
 *   3. Calls the supplied LlmCall to generate the student's question (mocked
 *      in tests + dev; real Haiku in live sweeps).
 *   4. Returns the question + the request-body extensions the route needs
 *      (e.g., opponentUsername for opponent_prep).
 *
 * Mock-LLM mode mandatory for all development per Stage C budget discipline
 * (CATEGORY_GENERATOR_DESIGN.md §12.5). Tests + Pause 3 smoke run with a
 * canned LlmCall; live sweep wires the real Anthropic Haiku call from
 * scripts/synthetic-tester/client.ts:generatePersonaQuestion.
 */

import type { QuestionCategory } from "../../../src/lib/mastermind/categorization/categoryClassifier";
import type { GameEval } from "../../../src/types/eval";

/* ────────────────────────────────────────────────────────────────────
 * Public types
 * ──────────────────────────────────────────────────────────────────── */

/** Seeded RNG (mulberry32) for deterministic fixture picks. */
export type Rng = () => number;

/** Single call to the LLM. Returns the student's question text. */
export type LlmCall = (args: {
  systemPrompt: string;
  userPrompt: string;
  generatorTag: string; // for cost-tracker / mock-mode logging
}) => Promise<{ ok: boolean; text: string; errorMessage?: string }>;

export interface GeneratorContextBase {
  category: QuestionCategory;
  rng: Rng;
  llmCall: LlmCall;
  /** Loaded persona system prompts keyed by persona name. */
  personas: Record<string, string>;
  /** Loaded fixtures — generator picks whatever it needs. */
  fixtures: GeneratorFixtures;
}

export interface GeneratorFixtures {
  opponents: OpponentFixture[];
  concepts: ConceptFixture[];
  lossSummaries: LossSummary[];
  /** Loaded user-history cache files keyed by username. */
  userHistories: Record<string, UserHistoryCacheFile>;
}

export interface OpponentFixture {
  fixture_id: string;
  handle_kind: "real" | "stub";
  username: string;
  platform: "chess.com" | "lichess";
  profile_summary: string;
  expected_scout: "has_data" | "no_data";
}

export interface ConceptFixture {
  concept_id: string;
  name: string;
  source: string;
  level: string | null;
  category: string | null;
  notes: string;
}

export interface LossSummary {
  snippet_id: string;
  text: string;
}

export interface UserHistoryCacheFile {
  username: string;
  platform: "chess.com" | "lichess";
  loadedAt: string;
  totalFetchedFromApi?: number;
  gamesCached?: number;
  monthsRequested?: number;
  games: Array<{
    pgn: string;
    white: { name?: string };
    black: { name?: string };
    result?: string;
    timeControl?: string;
    date?: string;
    createdAt?: unknown;
  }>;
  loadFailed?: boolean;
  error?: string;
}

/** Per-category context the position-anchored generator additionally needs. */
export interface PositionAnchorContext {
  fenAfter: string;
  fenBefore?: string;
  moveHistory: string[];
  gameEval: GameEval;
  playerColor: "w" | "b";
  recentSan: string;
  classification: string;
  initialAnalysis: string;
  /** The persona picked for this turn by run.ts. */
  persona: string;
  /** Which subcategory framing — game_review (mistake-anchored) or position_analysis (board-state). */
  subcategory: "game_review" | "position_analysis";
  gameId: string;
}

export interface GeneratorResult {
  question: string;
  personaUsed: string;
  /** Extra fields the harness adds to the /api/enhanced-analysis request body. */
  bodyExtensions: {
    opponentUsername?: string;
    opponentPlatform?: "chess.com" | "lichess";
    /**
     * When set, the harness POSTs with this username so the route's
     * Firestore-fetch lookup hits the cached user-history fixture
     * (requires the route-side stub-mode wiring noted in the deviation
     * section of Step 2.3.2's commit; without that wiring, live sweep
     * for improvement_strategy / meta_motivational degrades gracefully).
     */
    username?: string;
  };
  /** Free-form per-turn metadata for the CSV writer. */
  metadata: Record<string, unknown>;
}

export type Generator = (
  ctx: GeneratorContextBase & Partial<PositionAnchorContext>,
) => Promise<GeneratorResult>;

/* ────────────────────────────────────────────────────────────────────
 * Dispatch
 * ──────────────────────────────────────────────────────────────────── */

import { positionAnchoredGenerator } from "./positionAnchored";
import { opponentPrepGenerator } from "./opponentPrep";
import { improvementStrategyGenerator } from "./improvementStrategy";
import { metaMotivationalGenerator } from "./metaMotivational";
import { conceptExplanationGenerator } from "./conceptExplanation";

/**
 * Map a QuestionCategory to its generator. Throws on unknown category —
 * the harness should never call this with a value outside the enum.
 */
export function pickGenerator(category: QuestionCategory): Generator {
  switch (category) {
    case "game_review":
    case "position_analysis":
      return positionAnchoredGenerator;
    case "opponent_prep":
      return opponentPrepGenerator;
    case "improvement_strategy":
      return improvementStrategyGenerator;
    case "meta_motivational":
      return metaMotivationalGenerator;
    case "concept_explanation":
      return conceptExplanationGenerator;
    default: {
      const _exhaustive: never = category;
      throw new Error(`pickGenerator: unknown category ${_exhaustive}`);
    }
  }
}

/* ────────────────────────────────────────────────────────────────────
 * Shared helpers
 * ──────────────────────────────────────────────────────────────────── */

/** Mulberry32 — deterministic, fast, good-enough RNG for fixture picking. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickOne<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error("pickOne: empty array");
  return arr[Math.floor(rng() * arr.length)];
}

export function weightedPick<T>(
  rng: Rng,
  options: Array<{ value: T; weight: number }>,
): T {
  if (options.length === 0) throw new Error("weightedPick: empty options");
  const total = options.reduce((s, o) => s + o.weight, 0);
  let r = rng() * total;
  for (const o of options) {
    r -= o.weight;
    if (r <= 0) return o.value;
  }
  return options[options.length - 1].value;
}

/**
 * Mock LlmCall — returns a canned question. Used in unit tests and the
 * Pause 3 smoke script. The canned question reflects the input context
 * shape so a human can verify the generator wired its inputs correctly,
 * but does NOT actually call Anthropic.
 */
export function makeMockLlmCall(
  cannedByTag?: Record<string, string>,
): LlmCall {
  return async ({ generatorTag, userPrompt }) => {
    if (cannedByTag && cannedByTag[generatorTag]) {
      return { ok: true, text: cannedByTag[generatorTag] };
    }
    // Default: echo a one-line "mocked" question that includes a hint
    // of the context block so reviewers can verify wiring.
    const firstContextLine = userPrompt
      .split("\n")
      .find((l) => l.trim().length > 0 && !l.startsWith("#"))
      ?.slice(0, 80) || "(empty)";
    return {
      ok: true,
      text: `[MOCK ${generatorTag}] ${firstContextLine}`,
    };
  };
}
