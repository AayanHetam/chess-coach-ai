/**
 * Filesystem loaders for the generator runtime. Reads persona markdown
 * files (extracting the `# System prompt` section) and the JSON fixture
 * files. Used by:
 *   - the unit tests (with the real fixture data)
 *   - the Pause-3 smoke script
 *   - the live sweep wiring in run.ts (next iteration)
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type {
  GeneratorFixtures,
  OpponentFixture,
  ConceptFixture,
  LossSummary,
  UserHistoryCacheFile,
} from "./index";

const SCRIPT_DIR = join(__dirname, "..");
const PERSONAS_DIR = join(SCRIPT_DIR, "personas");
const FIXTURES_DIR = join(SCRIPT_DIR, "fixtures");
const USER_HISTORY_CACHE_DIR = join(FIXTURES_DIR, "user_history_cache");

/** Personas used by the new (category-aware) generators. */
export const CATEGORY_GENERATOR_PERSONAS = [
  "opponent_prep_seeker",
  "improvement_seeker",
  "reflective_learner",
  "concept_curious",
] as const;

/** Personas used by the position-anchored generator (existing pool). */
export const POSITION_ANCHORED_PERSONAS = [
  "confused_beginner",
  "curious_advanced",
  "hinglish_learner",
  "tilted_intermediate",
  "trick_questioner",
] as const;

/** All personas the harness loads when running category-balanced sweeps. */
export const ALL_PERSONAS = [
  ...POSITION_ANCHORED_PERSONAS,
  ...CATEGORY_GENERATOR_PERSONAS,
] as const;

function extractSystemPrompt(rawMarkdown: string, personaName: string): string {
  const fmMatch = rawMarkdown.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  const body = fmMatch?.[1] ?? rawMarkdown;
  const sysMatch = body.match(/# System prompt\n([\s\S]*?)(?:\n# |$)/);
  const prompt = (sysMatch?.[1] ?? body).trim();
  if (!prompt) {
    throw new Error(`Persona ${personaName} has empty system prompt`);
  }
  return prompt;
}

export function loadPersonaSystemPrompts(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of ALL_PERSONAS) {
    const path = join(PERSONAS_DIR, `${name}.md`);
    if (!existsSync(path)) {
      throw new Error(`Persona file missing: ${path}`);
    }
    out[name] = extractSystemPrompt(readFileSync(path, "utf8"), name);
  }
  return out;
}

export function loadOpponents(): OpponentFixture[] {
  const path = join(FIXTURES_DIR, "opponents.json");
  return JSON.parse(readFileSync(path, "utf8")) as OpponentFixture[];
}

export function loadConcepts(): ConceptFixture[] {
  const path = join(FIXTURES_DIR, "concepts.json");
  return JSON.parse(readFileSync(path, "utf8")) as ConceptFixture[];
}

export function loadLossSummaries(): LossSummary[] {
  const path = join(FIXTURES_DIR, "loss_summaries.json");
  return JSON.parse(readFileSync(path, "utf8")) as LossSummary[];
}

export function loadUserHistoryCache(): Record<string, UserHistoryCacheFile> {
  const out: Record<string, UserHistoryCacheFile> = {};
  if (!existsSync(USER_HISTORY_CACHE_DIR)) {
    return out;
  }
  for (const file of readdirSync(USER_HISTORY_CACHE_DIR)) {
    if (!file.endsWith(".json")) continue;
    const path = join(USER_HISTORY_CACHE_DIR, file);
    const cache = JSON.parse(readFileSync(path, "utf8")) as UserHistoryCacheFile;
    out[cache.username] = cache;
  }
  return out;
}

export function loadAllFixtures(): GeneratorFixtures {
  return {
    opponents: loadOpponents(),
    concepts: loadConcepts(),
    lossSummaries: loadLossSummaries(),
    userHistories: loadUserHistoryCache(),
  };
}
