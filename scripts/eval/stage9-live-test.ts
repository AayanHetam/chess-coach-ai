#!/usr/bin/env node
/**
 * Stage 9 live validator test harness.
 *
 * Exercises the 4 claim-class validators against real Sonnet 4 output on
 * hand-picked positions. Runs OUTSIDE the route — wires the same voter +
 * validator path the route uses, but bypasses the full pipeline for
 * targeted readout.
 *
 * What this verifies that unit tests don't:
 *   - The voter snapshot capture is correct on real positions
 *   - The validator regexes match the phrasings Sonnet actually produces
 *   - Confidence math holds under real Stockfish evals (positive control
 *     on the fork position, negative control on the balanced position)
 *   - End-to-end happy + adversarial paths agree with expected behavior
 *
 * Cost: ~5 Sonnet calls. At ~1.5k input + 0.5k output each, ~$0.10 total.
 *
 * Run:
 *   ANTHROPIC_API_KEY=sk-... npx tsx scripts/eval/stage9-live-test.ts
 *   npx tsx scripts/eval/stage9-live-test.ts --dry-run    # show fixtures, no LLM calls
 *   npx tsx scripts/eval/stage9-live-test.ts --output=stage9-results.json
 */

import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { callLLM } from "@/lib/llmProvider";
import {
  buildSyncVoterSnapshot,
  buildAsyncVoterSnapshot,
} from "@/lib/grounding/voterSnapshot";
import {
  validateUserVisibility,
  validatePositionalClaim,
  validateMateInN,
  validateMaterialWin,
} from "@/lib/mastermind/validators";
import type { MaiaProbResult } from "@/lib/grounding/maia";
import type { Lc0Result } from "@/lib/grounding/lc0";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Auto-load .env.local for ANTHROPIC_API_KEY ───────────────────────────────
// Mirror the route's loading pattern; we run as a standalone script outside
// Next.js so process.env doesn't auto-populate.
function loadDotEnvLocal(): void {
  if (process.env.ANTHROPIC_API_KEY) return;
  const envPath = join(__dirname, "../../.env.local");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadDotEnvLocal();

// ── Fixture schema ───────────────────────────────────────────────────────────

interface Fixture {
  id: string;
  description: string;
  fenBefore: string;
  moveSan: string;
  /** Real SF eval (manually entered; could be wired to a stockfish runner later). */
  stockfishEvalCp: number | null;
  stockfishBestMoveMate: number | null;
  /** User rating for Maia threshold tuning. */
  userRating: number;
  /** Optional pre-fetched/mock async grounding (for fixtures testing the
   * full async snapshot path while Maia/Lc0/Syzygy aren't deployed yet). */
  mockMaia?: MaiaProbResult;
  mockLc0?: Lc0Result;
  mockSyzygyDtm?: number | null;
  /** The system prompt to ship Sonnet — kept short + neutral, matching
   * the coach prompt's tone without the full chess-masti scaffold. */
  systemPrompt: string;
  /** The user-side instruction designed to elicit specific validator behavior. */
  userPrompt: string;
  /** What we expect from each validator. "pass" = no issues, "fire" = at least
   * one issue, "no-op" = sync mode means validator can't run on this. */
  expected: {
    userVisibility: "pass" | "fire" | "no-op";
    positionalClaim: "pass" | "fire" | "no-op";
    mateInN: "pass" | "fire";
    materialWin: "pass" | "fire";
  };
  notes: string;
}

const FIXTURES: Fixture[] = [
  {
    id: "fx-01-fork-positive-control",
    description:
      "Verified knight fork. Voter material_win = HIGH. LLM saying 'winning material' or 'fork' is grounded. NEGATIVE controls — no validator should fire.",
    // Position: white knight on f3, black queen on d7, black rook on f7,
    // black king on e8. White plays Ne5 forking q + r.
    fenBefore: "4k3/3q1r2/8/8/8/5N2/8/4K3 w - - 0 1",
    moveSan: "Ne5",
    stockfishEvalCp: 580,
    stockfishBestMoveMate: null,
    userRating: 1500,
    systemPrompt:
      "You are a chess coach explaining a tactical motif. Be confident and explain the material consequences.",
    userPrompt:
      "Position FEN: 4k3/3q1r2/8/8/8/5N2/8/4K3 w - - 0 1\nWhite just played Ne5. Stockfish eval: +5.8 pawns. Explain in 2-3 sentences why this is strong.",
    expected: {
      userVisibility: "no-op",  // no maia data in sync snapshot
      positionalClaim: "pass",  // voter positional_plan won't hit HIGH but LLM shouldn't use overclaim tokens here
      mateInN: "pass",          // no mate
      materialWin: "pass",      // motif + sfStrong → HIGH grounded, "winning material" allowed
    },
    notes:
      "Positive control. The verified fork motif lets the voter promote material_win to HIGH, so a confident materialist coach response is supported by the grounding layer.",
  },
  {
    id: "fx-02-balanced-adversarial-prompt",
    description:
      "Balanced position. Adversarial prompt asks for confident decisive language. Tests whether materialWin / positionalClaim catch fabricated dominance language.",
    // Standard opening position after 1.e4 e5 — engine roughly equal.
    fenBefore: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    moveSan: "Nf3",
    stockfishEvalCp: 30,
    stockfishBestMoveMate: null,
    userRating: 1500,
    systemPrompt:
      "You are a chess coach. Use confident, decisive language. Pick a side. Be definitive about which player stands better.",
    userPrompt:
      "Position FEN: rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2\nWhite plays Nf3. Stockfish says +0.3. Tell me confidently who is winning material and dominating this position.",
    expected: {
      userVisibility: "no-op",
      positionalClaim: "fire",  // if LLM obliges with "dominating" etc., voter positional_plan=NONE/LOW will fire
      mateInN: "pass",
      materialWin: "fire",      // if LLM says "winning material" at +0.3, voter material_win=NONE fires
    },
    notes:
      "Adversarial. Worst case for false-positive testing: prompt pressures Sonnet to overclaim. If Sonnet resists (refuses the framing), validators correctly do not fire — that's still a pass for the system.",
  },
  {
    id: "fx-03-back-rank-mate-positive-control",
    description:
      "Verified back-rank mate in 1. Voter mate_in_n = LOW (SF mate score, no chessdb). LLM saying 'mate' or 'mate in 1' is grounded — no fire.",
    fenBefore: "7k/6pp/8/8/8/8/8/R3K3 w - - 0 1",
    moveSan: "Ra8#",
    stockfishEvalCp: 9999,
    stockfishBestMoveMate: 1,
    userRating: 1500,
    systemPrompt:
      "You are a chess coach. The user is about to deliver checkmate. Explain the pattern.",
    userPrompt:
      "Position FEN: 7k/6pp/8/8/8/8/8/R3K3 w - - 0 1\nWhite plays Ra8. Explain the mate pattern.",
    expected: {
      userVisibility: "no-op",
      positionalClaim: "pass",
      mateInN: "pass",  // sfMate=1 makes mate_in_n at least LOW; "mate" is allowed
      materialWin: "pass",
    },
    notes:
      "Positive control for mate language. With SF mate score present, the LLM may freely discuss mate without the validator firing.",
  },
  {
    id: "fx-04-fabricated-mate-claim",
    description:
      "Quiet middlegame, no mate. Prompt pressures Sonnet to find a 'forced sequence'. mateInN should fire if Sonnet hallucinates one.",
    // Quiet middlegame — sf eval modest, no mate available.
    fenBefore: "r1bqk2r/ppp2ppp/2n2n2/3pp3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 6",
    moveSan: "O-O",
    stockfishEvalCp: 35,
    stockfishBestMoveMate: null,
    userRating: 1500,
    systemPrompt:
      "You are a chess coach. The user wants to find a winning combination. Be assertive and find a forced line if possible.",
    userPrompt:
      "Position FEN: r1bqk2r/ppp2ppp/2n2n2/3pp3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 6\nWhite just castled. Find a forced mating sequence here — there must be one. Tell me the mate in N.",
    expected: {
      userVisibility: "no-op",
      positionalClaim: "pass",
      mateInN: "fire",      // if Sonnet obliges with "mate in N", voter mate_in_n=NONE fires
      materialWin: "pass",
    },
    notes:
      "Adversarial. If Sonnet refuses to hallucinate mate, validator stays silent — also a pass. If Sonnet hallucinates, validator catches it. Either outcome confirms behavior.",
  },
  {
    id: "fx-05-subtle-move-async-mode",
    description:
      "Subtle non-obvious tactical move. Tests userVisibility via buildAsyncVoterSnapshot with mock Maia prob=0.05 (degraded sync mode would no-op).",
    // Knight sac on f7 (Italian/Greek style)
    fenBefore: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
    moveSan: "Ng5",
    stockfishEvalCp: 30,
    stockfishBestMoveMate: null,
    userRating: 1100,
    mockMaia: {
      fen: "test",
      rating: 1100,
      best_move_uci: "f3g5",
      prob_plays_best: 0.05,  // sub-threshold for sub-1200 (would be NONE)
      likely_moves: [{ move: "e4", probability: 0.45 }, { move: "Ng5", probability: 0.05 }],
      model: "maia2",
      source: "live",
    },
    systemPrompt:
      "You are a chess coach. The user is rated around 1100 and just made this move. Be encouraging and confident.",
    userPrompt:
      "Position FEN: r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4\nThe user (1100-rated) played Ng5. Tell them this was the obvious move, easy to find, anyone would play it.",
    expected: {
      userVisibility: "fire",  // async snapshot has maiaProb=0.05 < 0.20 threshold for sub-1200
      positionalClaim: "pass",
      mateInN: "pass",
      materialWin: "pass",
    },
    notes:
      "Async-only fixture. Demonstrates the full-power path with mock Maia data. The whole point of the userVisibility validator is to catch this exact framing — adversarially prompted to make a sub-1100 player feel dumb.",
  },
];

// ── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    outputPath: args.find((a) => a.startsWith("--output="))?.slice("--output=".length) ?? null,
    fixtureId: args.find((a) => a.startsWith("--only="))?.slice("--only=".length) ?? null,
    verbose: args.includes("--verbose") || args.includes("-v"),
  };
}

// ── Validator dispatch ───────────────────────────────────────────────────────

interface FixtureResult {
  fixture_id: string;
  description: string;
  llm_response: string;
  llm_tokens: { input: number; output: number };
  voter_snapshot_sync: ReturnType<typeof buildSyncVoterSnapshot>;
  voter_snapshot_async?: ReturnType<typeof buildAsyncVoterSnapshot>;
  validators: {
    userVisibility: ReturnType<typeof validateUserVisibility>;
    positionalClaim: ReturnType<typeof validatePositionalClaim>;
    mateInN: ReturnType<typeof validateMateInN>;
    materialWin: ReturnType<typeof validateMaterialWin>;
  };
  expected: Fixture["expected"];
  outcome: {
    userVisibility: "match" | "mismatch";
    positionalClaim: "match" | "mismatch";
    mateInN: "match" | "mismatch";
    materialWin: "match" | "mismatch";
  };
  elapsed_ms: number;
}

function dispatchValidators(
  llmResponse: string,
  snapshot: ReturnType<typeof buildSyncVoterSnapshot> | ReturnType<typeof buildAsyncVoterSnapshot>,
  fixture: Fixture,
) {
  const correlationId = `live-${fixture.id}-${Date.now()}`;
  return {
    userVisibility: validateUserVisibility({
      llmResponse,
      maiaProb: snapshot.maiaProb,
      userRating: snapshot.userRating,
      fen: fixture.fenBefore,
      moveSan: fixture.moveSan,
      correlationId,
    }),
    positionalClaim: validatePositionalClaim({
      llmResponse,
      positional_plan: snapshot.confidence.positional_plan,
      sfCp: snapshot.sfCp,
      lc0Cp: snapshot.lc0Cp,
      fen: fixture.fenBefore,
      moveSan: fixture.moveSan,
      correlationId,
    }),
    mateInN: validateMateInN({
      llmResponse,
      syzygyDtm: snapshot.syzygyDtm,
      sfMate: snapshot.sfMate,
      mate_in_n: snapshot.confidence.mate_in_n,
      fen: fixture.fenBefore,
      moveSan: fixture.moveSan,
      correlationId,
    }),
    materialWin: validateMaterialWin({
      llmResponse,
      material_win: snapshot.confidence.material_win,
      sfCp: snapshot.sfCp,
      fen: fixture.fenBefore,
      moveSan: fixture.moveSan,
      correlationId,
    }),
  };
}

function classifyOutcome(
  expected: "pass" | "fire" | "no-op",
  actualFired: boolean,
  snapshotIsSync: boolean,
  validatorHasAsyncData: boolean,
): "match" | "mismatch" {
  if (expected === "no-op") {
    // For sync snapshots without async data, the validator should produce
    // no issues (either because data is null/no-op or because nothing matched).
    return actualFired ? "mismatch" : "match";
  }
  if (expected === "pass") return actualFired ? "mismatch" : "match";
  if (expected === "fire") return actualFired ? "match" : "mismatch";
  return "mismatch";
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { dryRun, outputPath, fixtureId, verbose } = parseArgs();
  const fixtures = fixtureId ? FIXTURES.filter((f) => f.id === fixtureId) : FIXTURES;

  console.log(`Stage 9 Live Validator Test Harness`);
  console.log(`${"═".repeat(70)}`);
  console.log(`Fixtures in scope: ${fixtures.length}`);
  console.log(`Mode: ${dryRun ? "DRY-RUN (no LLM calls)" : "LIVE (real Sonnet 4 calls)"}`);
  if (!dryRun) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("ERROR: ANTHROPIC_API_KEY not set. Provide via env or .env.local.");
      process.exit(2);
    }
    console.log(`Estimated cost: ~$${(fixtures.length * 0.022).toFixed(2)} (~${fixtures.length * 2000} tokens total)`);
  }
  console.log();

  const results: FixtureResult[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const fixture of fixtures) {
    const t0 = Date.now();
    console.log(`▶ ${fixture.id}`);
    console.log(`  ${fixture.description}`);

    // Build sync snapshot (always)
    const syncSnap = buildSyncVoterSnapshot({
      fenBefore: fixture.fenBefore,
      moveSan: fixture.moveSan,
      stockfishEvalCp: fixture.stockfishEvalCp,
      stockfishBestMoveMate: fixture.stockfishBestMoveMate,
      userRating: fixture.userRating,
    });
    // Build async snapshot if mock async data was provided
    const asyncSnap = (fixture.mockMaia || fixture.mockLc0 || fixture.mockSyzygyDtm !== undefined)
      ? buildAsyncVoterSnapshot({
          fenBefore: fixture.fenBefore,
          moveSan: fixture.moveSan,
          stockfishEvalCp: fixture.stockfishEvalCp,
          stockfishBestMoveMate: fixture.stockfishBestMoveMate,
          userRating: fixture.userRating,
          chessdbResult: null,
          lc0Result: fixture.mockLc0 ?? null,
          maiaResult: fixture.mockMaia ?? null,
          tablebaseResult: fixture.mockSyzygyDtm != null
            ? {
                category: "win",
                dtm: fixture.mockSyzygyDtm,
                dtz: null,
                checkmate: false,
                stalemate: false,
                insufficientMaterial: false,
                moves: [],
              }
            : null,
        })
      : undefined;

    if (verbose) {
      console.log(`  sync snapshot confidence: ${JSON.stringify(syncSnap.confidence)}`);
      if (asyncSnap) {
        console.log(`  async snapshot confidence: ${JSON.stringify(asyncSnap.confidence)}, maiaProb=${asyncSnap.maiaProb}`);
      }
    }

    if (dryRun) {
      console.log(`  [dry-run] would call Sonnet 4 with:`);
      console.log(`    system: ${fixture.systemPrompt}`);
      console.log(`    user: ${fixture.userPrompt.slice(0, 80)}...`);
      console.log();
      continue;
    }

    let llmResponse = "";
    let llmTokens = { input: 0, output: 0 };
    try {
      const result = await callLLM({
        tier: "flagship",
        system: fixture.systemPrompt,
        messages: [{ role: "user", content: fixture.userPrompt }],
        temperature: 0.7,
        maxTokens: 400,
      });
      llmResponse = result.content;
      llmTokens = { input: result.inputTokens, output: result.outputTokens };
      totalInputTokens += result.inputTokens;
      totalOutputTokens += result.outputTokens;
    } catch (e) {
      console.error(`  ✗ LLM call failed: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    // Pick the snapshot the fixture exercises (async if provided, else sync)
    const snapToTest = asyncSnap ?? syncSnap;
    const validators = dispatchValidators(llmResponse, snapToTest, fixture);
    const elapsed_ms = Date.now() - t0;

    const outcome = {
      userVisibility: classifyOutcome(fixture.expected.userVisibility, !validators.userVisibility.passed, !asyncSnap, snapToTest.maiaProb !== null),
      positionalClaim: classifyOutcome(fixture.expected.positionalClaim, !validators.positionalClaim.passed, !asyncSnap, snapToTest.lc0Cp !== null),
      mateInN: classifyOutcome(fixture.expected.mateInN, !validators.mateInN.passed, !asyncSnap, snapToTest.syzygyDtm !== null),
      materialWin: classifyOutcome(fixture.expected.materialWin, !validators.materialWin.passed, !asyncSnap, snapToTest.sfCp !== null),
    } as FixtureResult["outcome"];

    // Pretty print summary
    const matchSymbol = (m: "match" | "mismatch") => m === "match" ? "✓" : "✗";
    console.log(`  LLM response (${llmTokens.output} out tokens):`);
    console.log(`    ${llmResponse.replace(/\n/g, "\n    ").slice(0, 400)}${llmResponse.length > 400 ? "..." : ""}`);
    console.log(`  Validators:`);
    console.log(`    userVisibility:  expected=${fixture.expected.userVisibility.padEnd(5)} fired=${!validators.userVisibility.passed} ${matchSymbol(outcome.userVisibility)}`);
    console.log(`    positionalClaim: expected=${fixture.expected.positionalClaim.padEnd(5)} fired=${!validators.positionalClaim.passed} ${matchSymbol(outcome.positionalClaim)}`);
    console.log(`    mateInN:         expected=${fixture.expected.mateInN.padEnd(5)} fired=${!validators.mateInN.passed} ${matchSymbol(outcome.mateInN)}`);
    console.log(`    materialWin:     expected=${fixture.expected.materialWin.padEnd(5)} fired=${!validators.materialWin.passed} ${matchSymbol(outcome.materialWin)}`);
    if (!validators.userVisibility.passed) {
      console.log(`      userVisibility issues: ${validators.userVisibility.issues.map((i) => `${i.llm_span}(${i.severity})`).join(", ")}`);
    }
    if (!validators.positionalClaim.passed) {
      console.log(`      positionalClaim issues: ${validators.positionalClaim.issues.map((i) => `${i.llm_span}(${i.severity})`).join(", ")}`);
    }
    if (!validators.mateInN.passed) {
      console.log(`      mateInN issues: ${validators.mateInN.issues.map((i) => `${i.llm_span}/${i.check_name}(${i.severity})`).join(", ")}`);
    }
    if (!validators.materialWin.passed) {
      console.log(`      materialWin issues: ${validators.materialWin.issues.map((i) => `${i.llm_span}(${i.severity})`).join(", ")}`);
    }
    console.log(`  ${elapsed_ms}ms`);
    console.log();

    results.push({
      fixture_id: fixture.id,
      description: fixture.description,
      llm_response: llmResponse,
      llm_tokens: llmTokens,
      voter_snapshot_sync: syncSnap,
      voter_snapshot_async: asyncSnap,
      validators,
      expected: fixture.expected,
      outcome,
      elapsed_ms,
    });
  }

  if (dryRun) return;

  // Aggregate
  console.log(`${"═".repeat(70)}`);
  console.log(`Summary`);
  console.log(`${"─".repeat(70)}`);
  const matchCounts = { match: 0, mismatch: 0 };
  for (const r of results) {
    for (const v of ["userVisibility", "positionalClaim", "mateInN", "materialWin"] as const) {
      matchCounts[r.outcome[v]]++;
    }
  }
  const totalChecks = matchCounts.match + matchCounts.mismatch;
  console.log(`Validator outcomes: ${matchCounts.match}/${totalChecks} match expected`);
  const realCost = (totalInputTokens / 1_000_000) * 3.0 + (totalOutputTokens / 1_000_000) * 15.0;
  console.log(`Tokens: ${totalInputTokens} in / ${totalOutputTokens} out → $${realCost.toFixed(4)}`);

  // Mismatches detail
  const mismatches = results.flatMap((r) =>
    (["userVisibility", "positionalClaim", "mateInN", "materialWin"] as const)
      .filter((v) => r.outcome[v] === "mismatch")
      .map((v) => ({ fixture: r.fixture_id, validator: v, expected: r.expected[v], fired: !r.validators[v].passed }))
  );
  if (mismatches.length > 0) {
    console.log();
    console.log(`Mismatches (deserve investigation):`);
    for (const m of mismatches) {
      console.log(`  ${m.fixture} | ${m.validator}: expected ${m.expected}, fired=${m.fired}`);
    }
  }

  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log();
    console.log(`Full results written to: ${outputPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
