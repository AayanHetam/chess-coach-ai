#!/usr/bin/env tsx
/**
 * Pause Point 3 smoke script. Runs each non-position generator (the
 * four new ones) and the position-anchored generator's two
 * subcategories in MOCK-LLM MODE (zero Anthropic API cost). Prints
 * 4-5 sample questions per category so Aayan can spot-check that
 * generators wired fixtures + personas correctly before any live
 * sweep budget is committed.
 *
 * Usage:
 *   npx tsx scripts/synthetic-tester/smoke-generators.ts
 *   npx tsx scripts/synthetic-tester/smoke-generators.ts --samples=8
 *   npx tsx scripts/synthetic-tester/smoke-generators.ts --category=opponent_prep
 *
 * Per Stage C budget discipline §12.5: $0 Anthropic spend.
 */

import {
  type GeneratorContextBase,
  pickGenerator,
  mulberry32,
  makeMockLlmCall,
} from "./generators";
import { loadAllFixtures, loadPersonaSystemPrompts } from "./generators/loaders";
import type { QuestionCategory } from "../../src/lib/mastermind/categorization/categoryClassifier";

const SUPPORTED_CATEGORIES: QuestionCategory[] = [
  "game_review",
  "position_analysis",
  "opponent_prep",
  "improvement_strategy",
  "meta_motivational",
  "concept_explanation",
];

interface SmokeOpts {
  samples: number;
  categories: QuestionCategory[];
  seed: number;
}

function parseArgs(argv: string[]): SmokeOpts {
  let samples = 5;
  let categories: QuestionCategory[] = SUPPORTED_CATEGORIES;
  let seed = 42;
  for (const a of argv) {
    if (a.startsWith("--samples=")) samples = parseInt(a.split("=")[1], 10);
    else if (a.startsWith("--category=")) {
      const requested = a.split("=")[1] as QuestionCategory;
      if (!SUPPORTED_CATEGORIES.includes(requested)) {
        throw new Error(`Unknown category: ${requested}. Use one of: ${SUPPORTED_CATEGORIES.join(", ")}`);
      }
      categories = [requested];
    } else if (a.startsWith("--seed=")) seed = parseInt(a.split("=")[1], 10);
    else if (a === "--help" || a === "-h") {
      console.log("Usage: npx tsx scripts/synthetic-tester/smoke-generators.ts [--samples=N] [--category=X] [--seed=N]");
      process.exit(0);
    }
  }
  return { samples, categories, seed };
}

// Position-anchored generators need a synthetic per-sample context.
// Build a minimal but realistic one so Aayan can see what the persona
// sees. The "initial analysis" is a stub; the real run.ts wiring will
// supply a genuine prior-coach response.
function syntheticPositionContext(sampleIdx: number, subcategory: "game_review" | "position_analysis") {
  const FEN_AFTER_E4_E5_NF3_NC6 =
    "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
  return {
    persona: ["confused_beginner", "curious_advanced", "tilted_intermediate", "hinglish_learner", "trick_questioner"][sampleIdx % 5],
    fenAfter: FEN_AFTER_E4_E5_NF3_NC6,
    moveHistory: ["e4", "e5", "Nf3", "Nc6"],
    gameEval: { positions: [], accuracy: { white: 0, black: 0 } } as any,
    playerColor: "w" as const,
    recentSan: "1.e4 e5 2.Nf3 Nc6",
    classification: subcategory === "game_review" ? "inaccuracy" : "book",
    initialAnalysis: "You're in an Italian/Ruy Lopez opening — White has the initiative with a3 + Bb5 to follow. Your last move was solid; consider d6 next to support e5.",
    subcategory,
    gameId: `smoke-game-${sampleIdx}`,
  };
}

async function smokeCategory(
  category: QuestionCategory,
  samples: number,
  baseSeed: number,
  fixtures: ReturnType<typeof loadAllFixtures>,
  personas: Record<string, string>,
): Promise<void> {
  const gen = pickGenerator(category);
  console.log(`\n=== ${category} (${samples} samples) ===`);
  for (let i = 0; i < samples; i++) {
    const rng = mulberry32(baseSeed + i * 1000);
    const llmCall = makeMockLlmCall();
    let ctx: GeneratorContextBase & Record<string, unknown> = {
      category,
      rng,
      llmCall,
      personas,
      fixtures,
    };
    if (category === "game_review" || category === "position_analysis") {
      ctx = { ...ctx, ...syntheticPositionContext(i, category as "game_review" | "position_analysis") };
    }
    try {
      const result = await gen(ctx as Parameters<typeof gen>[0]);
      console.log(`  [${i + 1}] persona=${result.personaUsed}`);
      console.log(`      Q: ${result.question}`);
      if (Object.keys(result.bodyExtensions).length > 0) {
        console.log(`      bodyExtensions: ${JSON.stringify(result.bodyExtensions)}`);
      }
      console.log(`      metadata: ${JSON.stringify(result.metadata)}`);
    } catch (err) {
      console.error(`  [${i + 1}] FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  console.log("smoke-generators.ts — Pause Point 3 mock-LLM dry run");
  console.log(`  samples per category: ${opts.samples}`);
  console.log(`  categories: ${opts.categories.join(", ")}`);
  console.log(`  seed: ${opts.seed}`);
  console.log("");

  const personas = loadPersonaSystemPrompts();
  const fixtures = loadAllFixtures();
  console.log(`Loaded ${Object.keys(personas).length} personas + ${fixtures.opponents.length} opponents + ${fixtures.concepts.length} concepts + ${fixtures.lossSummaries.length} loss snippets + ${Object.keys(fixtures.userHistories).length} user-history caches.`);

  for (const cat of opts.categories) {
    await smokeCategory(cat, opts.samples, opts.seed, fixtures, personas);
  }

  console.log("\n=== Smoke complete ===");
  console.log("Mock-LLM mode: $0 Anthropic spend. Review the printed questions above for shape + realism.");
  console.log("After review, surface back to CC: lock the generators (proceed to dry-run-or-skip decision per Pause 4) or iterate on persona prompts.");
}

main().catch((err) => {
  console.error("fatal:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
