/**
 * Validator gate dry-run harness — PR_1C_PLAN.md §1.2 (Stage A.1.C.A.1 / 1.C.A.2).
 *
 * Runs the PR 1.B validators against a curated fixture set (10 known-good +
 * 10 known-bad tuples) without touching the network. Computes the four
 * dry-run-feasible gate metrics, compares against the versioned thresholds
 * in gate-thresholds.json, exits 0 on pass and 1 on fail.
 *
 *   Default config:        every metric passes (the gate confirms validators
 *                          catch known-bad fixtures and clear known-good ones).
 *   --override-tolerance:  set adjacent-band tolerance for evalClaim's
 *                          qualitative check. =2000 makes adjacent flips a
 *                          no-op → bad fixtures with adjacent qualitative
 *                          flips slip through → chess correctness metric
 *                          drops below threshold → harness exits 1.
 *   --override-numeric:    set numeric threshold for evalClaim. =20000
 *                          makes numeric mismatches a no-op.
 *   --override-confidence: set parser low-confidence threshold. =1.01
 *                          discards every parsed claim (no validator runs).
 *   --inject-fixture=PATH: load extra fixtures from a JSON file (same shape
 *                          as gate-dryrun.json) and append to the set.
 *
 * Per PR_1C_PLAN.md §1.4 the harness ships in two commits:
 *   1.C.A.1: this script + fixtures + thresholds + a passing default run.
 *   1.C.A.2: a follow-up that demonstrates --override-tolerance=2000 fails
 *            the gate, proving sensitivity.
 *
 * Persona fidelity is skipped per plan §1.3 (no Claude rubric in dry-run).
 * Tool calls per turn is hardcoded to 0 (no agent loop in 1.C).
 *
 * No network. No source modification. Pure deterministic harness.
 */
import { readFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";

import {
  validateEvalClaim,
  validateFeatureDeltaCitations,
  regenerateUntilValid,
  buildFallbackResponse,
  type ParserCall,
  type ValidatorResult,
  type ValidatorIssue,
  type TelemetryEvent,
  type ParsedEvalClaim,
  type ParsedFeatureClaim,
  type FinalOutcome,
  type CoachTone,
} from "@/lib/mastermind/validators";
import type { PositionFeatureDelta } from "@/lib/mastermind/featureDelta";
import type { RoleChange } from "@/lib/mastermind/pieceRoles";
import type { CallLLMOptions, LLMResult } from "@/lib/llmProvider";

// ---------------------------------------------------------------------------
// Fixture schema (TypeScript-typed so JSON conformance is checked at runtime)
// ---------------------------------------------------------------------------

type FixtureCategory = "known_good" | "known_bad";

interface FixtureExpectedFires {
  eval_mismatch_numeric: boolean;
  eval_mismatch_qualitative: boolean;
  feature_citation_unsupported: boolean;
}

interface FixtureTuple {
  name: string;
  category: FixtureCategory;
  description: string;
  stockfishEval: { cp?: number; mate?: number };
  playerPerspective: "white" | "black";
  featureDelta: Partial<PositionFeatureDelta>;
  pieceRoleDiff: RoleChange[];
  response: string;
  correctedResponse?: string;
  evalParserOutput: ParsedEvalClaim[];
  citationParserOutput: ParsedFeatureClaim[];
  /** Parser output when the mock LLM returns the corrected response on retry. */
  evalParserOutputCorrected?: ParsedEvalClaim[];
  citationParserOutputCorrected?: ParsedFeatureClaim[];
  expectedFires: FixtureExpectedFires;
  expectedFinalOutcome: FinalOutcome;
  /**
   * Count of feature-delta citation opportunities in the response. Used in
   * the structural-grounding metric: per-fixture binary (any cited delta
   * entry → grounded). Set to 0 to exclude from the structural-grounding
   * aggregate (e.g., fixtures with no feature claims, or known-bad fixtures
   * with invented claims).
   */
  groundingOpportunityCount: number;
  /** Count of citations actually present in `citationParserOutput` that match a real delta entry. */
  groundingMatchedCount: number;
}

interface FixtureFile {
  version: number;
  createdAt: string;
  _note?: string;
  fixtures: FixtureTuple[];
}

interface Thresholds {
  chessCorrectnessViolationsMax: number;
  structuralGroundingMin: number;
  toolCallsPerTurnMedianMax: number;
  costPerTurnFlagshipUsdMax: number;
  personaFidelityMin: number;
  _personaFidelityNote?: string;
}

interface ThresholdsFile {
  version: number;
  createdAt: string;
  _note?: string;
  thresholds: Thresholds;
}

// ---------------------------------------------------------------------------
// Default feature delta — merged into each fixture's partial delta
// ---------------------------------------------------------------------------

const DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function defaultDelta(): PositionFeatureDelta {
  return {
    fenBefore: DEFAULT_FEN,
    fenAfter: DEFAULT_FEN,
    resolutionFen: DEFAULT_FEN,
    resolutionReason: "quiescent",
    materialDelta: { white: 0, black: 0 },
    pawnStructureDelta: {
      doubledPawnsChange: { white: 0, black: 0 },
      isolatedPawnsChange: { white: 0, black: 0 },
      passedPawnsGained: { white: [], black: [] },
      passedPawnsLost: { white: [], black: [] },
      openFilesGained: [],
      openFilesLost: [],
      semiOpenFilesGained: { white: [], black: [] },
      semiOpenFilesLost: { white: [], black: [] },
    },
    kingSafetyDelta: { white: 0, black: 0 },
    pieceActivityDelta: { gainedActive: [], lostActive: [], newlyTrapped: [] },
    hangingPiecesDelta: { newlyHanging: [], nowDefended: [] },
    threatsDelta: { newThreats: [], resolvedThreats: [], carriedOverThreats: [] },
    isEmptyDelta: true,
  };
}

function mergeDelta(partial: Partial<PositionFeatureDelta>): PositionFeatureDelta {
  return { ...defaultDelta(), ...partial };
}

// ---------------------------------------------------------------------------
// CLI flag parsing
// ---------------------------------------------------------------------------

interface CliOverrides {
  toleranceCp?: number;
  numericThresholdCp?: number;
  confidenceThreshold?: number;
  injectFixturePath?: string;
}

function parseCli(argv: string[]): CliOverrides {
  const overrides: CliOverrides = {};
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([a-z-]+)=(.+)$/);
    if (!m) continue;
    const [, key, val] = m;
    switch (key) {
      case "override-tolerance":
        overrides.toleranceCp = Number(val);
        break;
      case "override-numeric":
        overrides.numericThresholdCp = Number(val);
        break;
      case "override-confidence":
        overrides.confidenceThreshold = Number(val);
        break;
      case "inject-fixture":
        overrides.injectFixturePath = val;
        break;
      default:
        console.warn(`Unrecognized flag: --${key}=${val}`);
    }
  }
  return overrides;
}

// ---------------------------------------------------------------------------
// Mock parser + mock LLM, parameterized by the current fixture
// ---------------------------------------------------------------------------

function buildMockParser(fixture: FixtureTuple): ParserCall {
  return async ({ system, user }) => {
    const isEval = system.startsWith("You parse chess analysis prose");
    const corrected = fixture.correctedResponse;
    const isCorrectedResponse = corrected !== undefined && user.includes(corrected);
    if (isEval) {
      const output = isCorrectedResponse
        ? fixture.evalParserOutputCorrected ?? []
        : fixture.evalParserOutput;
      return { raw: JSON.stringify(output), costUsd: 0 };
    }
    const output = isCorrectedResponse
      ? fixture.citationParserOutputCorrected ?? []
      : fixture.citationParserOutput;
    return { raw: JSON.stringify(output), costUsd: 0 };
  };
}

function buildMockCallLLM(fixture: FixtureTuple): (opts: CallLLMOptions) => Promise<LLMResult> {
  let callIdx = 0;
  return async (_opts) => {
    const content =
      callIdx === 0
        ? fixture.response
        : fixture.correctedResponse ?? fixture.response;
    callIdx++;
    return {
      content,
      provider: "anthropic",
      model: "claude-sonnet-4-test",
      inputTokens: 0,
      outputTokens: 0,
      elapsedMs: 0,
    };
  };
}

// ---------------------------------------------------------------------------
// Inline pipeline (mirrors runValidationPipeline shape; routes override
// flags through to validateEvalClaim / validateFeatureDeltaCitations
// directly, since the sealed PR 1.B index.ts doesn't expose them).
// ---------------------------------------------------------------------------

interface PipelineRunOpts {
  fixture: FixtureTuple;
  overrides: CliOverrides;
  coachTone?: CoachTone;
}

async function runFixturePipeline(opts: PipelineRunOpts) {
  const { fixture, overrides } = opts;
  const delta = mergeDelta(fixture.featureDelta);
  const parseCall = buildMockParser(fixture);
  const callLLM = buildMockCallLLM(fixture);
  const correlationId = `dryrun-${fixture.name}-${Date.now()}`;

  const validate = async (response: string): Promise<ValidatorResult> => {
    const evalResult = await validateEvalClaim({
      llmResponse: response,
      stockfishEval: fixture.stockfishEval,
      playerPerspective: fixture.playerPerspective,
      fen: delta.fenBefore,
      correlationId,
      parseCall,
      toleranceCp: overrides.toleranceCp,
      numericThresholdCp: overrides.numericThresholdCp,
      confidenceThreshold: overrides.confidenceThreshold,
    });
    const citationResult = await validateFeatureDeltaCitations({
      llmResponse: response,
      featureDelta: delta,
      pieceRoleDiff: fixture.pieceRoleDiff,
      playerPerspective: fixture.playerPerspective,
      fen: delta.fenBefore,
      correlationId,
      parseCall,
      confidenceThreshold: overrides.confidenceThreshold,
    });
    const issues = [...evalResult.issues, ...citationResult.issues];
    const telemetry: TelemetryEvent[] = [...evalResult.telemetry, ...citationResult.telemetry];
    return {
      issues,
      passed: issues.length === 0,
      telemetry,
      costUsd: evalResult.costUsd + citationResult.costUsd,
    };
  };

  const buildFallback = async () =>
    buildFallbackResponse({
      stockfishEval: fixture.stockfishEval,
      featureDelta: delta,
      pieceRoleDiff: fixture.pieceRoleDiff,
      playerPerspective: fixture.playerPerspective,
      coachTone: opts.coachTone,
    });

  return regenerateUntilValid({
    initialRequest: {
      tier: "flagship",
      system: "dry-run system",
      messages: [{ role: "user", content: `analyze fixture ${fixture.name}` }],
    },
    validate,
    buildFallback,
    callLLM,
    correlationId,
    context: {
      fen: delta.fenBefore,
      player_perspective: fixture.playerPerspective,
    },
  });
}

// ---------------------------------------------------------------------------
// Per-fixture analysis: did expectedFires match observed fires?
// ---------------------------------------------------------------------------

interface FiredFlags {
  eval_mismatch_numeric: boolean;
  eval_mismatch_qualitative: boolean;
  feature_citation_unsupported: boolean;
}

function summarizeFires(issues: ValidatorIssue[]): FiredFlags {
  return {
    eval_mismatch_numeric: issues.some((i) => i.check_name === "eval_mismatch_numeric"),
    eval_mismatch_qualitative: issues.some((i) => i.check_name === "eval_mismatch_qualitative"),
    feature_citation_unsupported: issues.some((i) => i.check_name === "feature_citation_unsupported"),
  };
}

interface FixtureResult {
  name: string;
  category: FixtureCategory;
  expectedFinalOutcome: FinalOutcome;
  actualFinalOutcome: FinalOutcome;
  outcomeMatches: boolean;
  expectedFires: FixtureExpectedFires;
  actualFires: FiredFlags;
  firesMatch: boolean;
  retryCount: number;
  totalCostUsd: number;
  groundingOpportunityCount: number;
  groundingMatchedCount: number;
  /** Per-fixture grounding ratio: matched/opportunities. null when opp=0 (excluded from aggregate). */
  groundingRatio: number | null;
}

async function processFixture(fixture: FixtureTuple, overrides: CliOverrides): Promise<FixtureResult> {
  const result = await runFixturePipeline({ fixture, overrides });
  const actualFires = summarizeFires(result.cumulativeIssues);
  const expectedFires = fixture.expectedFires;
  const firesMatch =
    expectedFires.eval_mismatch_numeric === actualFires.eval_mismatch_numeric &&
    expectedFires.eval_mismatch_qualitative === actualFires.eval_mismatch_qualitative &&
    expectedFires.feature_citation_unsupported === actualFires.feature_citation_unsupported;

  const groundingRatio =
    fixture.groundingOpportunityCount > 0
      ? fixture.groundingMatchedCount / fixture.groundingOpportunityCount
      : null;

  return {
    name: fixture.name,
    category: fixture.category,
    expectedFinalOutcome: fixture.expectedFinalOutcome,
    actualFinalOutcome: result.finalOutcome,
    outcomeMatches: result.finalOutcome === fixture.expectedFinalOutcome,
    expectedFires,
    actualFires,
    firesMatch,
    retryCount: result.retryCount,
    totalCostUsd: result.totalCostUsd,
    groundingOpportunityCount: fixture.groundingOpportunityCount,
    groundingMatchedCount: fixture.groundingMatchedCount,
    groundingRatio,
  };
}

// ---------------------------------------------------------------------------
// Metric aggregation against thresholds
// ---------------------------------------------------------------------------

interface MetricReport {
  chessCorrectnessViolations: number;
  chessCorrectnessPasses: boolean;
  structuralGrounding: number | null;
  structuralGroundingPasses: boolean;
  toolCallsPerTurnMedian: number;
  toolCallsPerTurnPasses: boolean;
  costPerTurnUsd: number;
  costPerTurnPasses: boolean;
  personaFidelity: "skipped";
  overallPasses: boolean;
}

function aggregate(results: FixtureResult[], thresholds: Thresholds): MetricReport {
  const chessCorrectnessViolations = results.filter((r) => !r.outcomeMatches || !r.firesMatch).length;
  const chessCorrectnessPasses = chessCorrectnessViolations <= thresholds.chessCorrectnessViolationsMax;

  const groundingDenominator = results.filter((r) => r.groundingRatio !== null);
  let structuralGrounding: number | null = null;
  let structuralGroundingPasses = true;
  if (groundingDenominator.length > 0) {
    const ratioSum = groundingDenominator.reduce((acc, r) => acc + (r.groundingRatio ?? 0), 0);
    structuralGrounding = ratioSum / groundingDenominator.length;
    structuralGroundingPasses = structuralGrounding >= thresholds.structuralGroundingMin;
  }

  const toolCallsPerTurnMedian = 0;
  const toolCallsPerTurnPasses = toolCallsPerTurnMedian <= thresholds.toolCallsPerTurnMedianMax;

  const totalCost = results.reduce((sum, r) => sum + r.totalCostUsd, 0);
  const costPerTurnUsd = results.length > 0 ? totalCost / results.length : 0;
  const costPerTurnPasses = costPerTurnUsd <= thresholds.costPerTurnFlagshipUsdMax;

  const overallPasses =
    chessCorrectnessPasses &&
    structuralGroundingPasses &&
    toolCallsPerTurnPasses &&
    costPerTurnPasses;

  return {
    chessCorrectnessViolations,
    chessCorrectnessPasses,
    structuralGrounding,
    structuralGroundingPasses,
    toolCallsPerTurnMedian,
    toolCallsPerTurnPasses,
    costPerTurnUsd,
    costPerTurnPasses,
    personaFidelity: "skipped",
    overallPasses,
  };
}

// ---------------------------------------------------------------------------
// Reporter
// ---------------------------------------------------------------------------

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function reportLine(label: string, value: string, pass: boolean): string {
  const tag = pass ? "PASS" : "FAIL";
  return `  ${pad(label, 26)} ${pad(value, 22)} [${tag}]`;
}

function report(
  results: FixtureResult[],
  metrics: MetricReport,
  thresholds: Thresholds,
  overrides: CliOverrides
): void {
  const overrideSummary =
    [
      overrides.toleranceCp !== undefined ? `tolerance=${overrides.toleranceCp}` : null,
      overrides.numericThresholdCp !== undefined ? `numeric=${overrides.numericThresholdCp}` : null,
      overrides.confidenceThreshold !== undefined ? `confidence=${overrides.confidenceThreshold}` : null,
      overrides.injectFixturePath ? `inject=${overrides.injectFixturePath}` : null,
    ]
      .filter(Boolean)
      .join(", ") || "none";

  console.log("=".repeat(64));
  console.log("VALIDATOR GATE DRY-RUN");
  console.log("=".repeat(64));
  console.log(`Fixtures:           ${results.length}`);
  console.log(`Overrides:          ${overrideSummary}`);
  console.log("");
  console.log("PER-FIXTURE OUTCOMES:");
  for (const r of results) {
    const outcomeTag = r.outcomeMatches ? " ok " : "FAIL";
    const firesTag = r.firesMatch ? " ok " : "FAIL";
    console.log(
      `  [${outcomeTag}] [${firesTag}] ${pad(r.category, 11)} ${pad(r.name, 32)} ` +
        `outcome=${pad(r.actualFinalOutcome, 20)} retries=${r.retryCount}`
    );
    if (!r.outcomeMatches) {
      console.log(`           expected outcome: ${r.expectedFinalOutcome}, got ${r.actualFinalOutcome}`);
    }
    if (!r.firesMatch) {
      console.log(
        `           expected fires: ${JSON.stringify(r.expectedFires)}, got ${JSON.stringify(r.actualFires)}`
      );
    }
  }
  console.log("");
  console.log("METRICS:");
  console.log(
    reportLine(
      "chess correctness",
      `${metrics.chessCorrectnessViolations} / ${thresholds.chessCorrectnessViolationsMax} max`,
      metrics.chessCorrectnessPasses
    )
  );
  console.log(
    reportLine(
      "structural grounding",
      metrics.structuralGrounding === null
        ? "n/a (no opps)"
        : `${metrics.structuralGrounding.toFixed(2)} / ${thresholds.structuralGroundingMin} min`,
      metrics.structuralGroundingPasses
    )
  );
  console.log(
    reportLine(
      "tool calls / turn",
      `${metrics.toolCallsPerTurnMedian} median / ${thresholds.toolCallsPerTurnMedianMax} max`,
      metrics.toolCallsPerTurnPasses
    )
  );
  console.log(
    reportLine(
      "cost / turn (flagship)",
      `$${metrics.costPerTurnUsd.toFixed(5)} / $${thresholds.costPerTurnFlagshipUsdMax.toFixed(3)} max`,
      metrics.costPerTurnPasses
    )
  );
  console.log(`  ${pad("persona fidelity", 26)} ${pad("skipped (Stage C)", 22)} [n/a ]`);
  console.log("");
  console.log("=".repeat(64));
  console.log(`OVERALL: ${metrics.overallPasses ? "PASS" : "FAIL"}`);
  console.log("=".repeat(64));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function loadJson<T>(path: string): T {
  const resolved = isAbsolute(path) ? path : join(process.cwd(), path);
  const raw = readFileSync(resolved, "utf8");
  return JSON.parse(raw) as T;
}

async function main() {
  const overrides = parseCli(process.argv);
  const fixturesPath = join(__dirname, "fixtures", "gate-dryrun.json");
  const thresholdsPath = join(__dirname, "gate-thresholds.json");

  const fixturesFile = loadJson<FixtureFile>(fixturesPath);
  const thresholdsFile = loadJson<ThresholdsFile>(thresholdsPath);

  let fixtures = fixturesFile.fixtures;
  if (overrides.injectFixturePath) {
    const injected = loadJson<FixtureFile>(overrides.injectFixturePath);
    fixtures = [...fixtures, ...injected.fixtures];
  }

  const results: FixtureResult[] = [];
  for (const fixture of fixtures) {
    const result = await processFixture(fixture, overrides);
    results.push(result);
  }

  const metrics = aggregate(results, thresholdsFile.thresholds);
  report(results, metrics, thresholdsFile.thresholds, overrides);

  process.exit(metrics.overallPasses ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
