/**
 * Contract-fidelity eval — PR-CI-2 of the Contract Inversion program
 * (MASTERMIND_CONTEXT/CONTRACT_INVERSION_PLAN.md §7). Produces the BEFORE
 * baseline every later phase is judged against: legacy-path reviews run
 * through the measurement-grade referee checks (src/lib/contract/
 * refereeChecks.ts — the same functions CI-3 wires into serving).
 *
 * Modes (house eval-harness discipline, see scripts/eval/README.md):
 *
 *   --dry-run   (CI smoke, ZERO network): builds contracts for all 10
 *               vendored fixtures, prints contract stats, and runs the
 *               referee checks against canned prose samples (2 known-bad,
 *               1 clean control) asserting the expected violations.
 *               Exits non-zero on any assertion failure.
 *
 *   (live)      needs ANTHROPIC_API_KEY (env or .env.local). For each
 *               fixture, generates a LEGACY-path review — the exact prompt
 *               the route composes (getCoachChatSystemPromptParts +
 *               "## USER REQUEST" + renderLegacyPrompt(contract) + gold
 *               few-shots) via callLLM (tier flagship, temp 0.7, 3000 max
 *               tokens) — then referees the prose per insight (mapped by
 *               [INSIGHT:moveNumber:color...] headers) and judges persona
 *               with the NON-generator tier (fast/Haiku, 2 passes — PR-E
 *               judge hygiene). Cost: ~10 flagship + ~20 fast calls ≈ $1.
 *
 *   --fp-measure  (CI-4 pre-arming gate, plan §7 PR-CI-3: "SAN/square-check
 *               false-positive rate measured on a 30-game set before any
 *               error-severity arming"). Generates --samples (default 3)
 *               independent live flagship reviews per fixture (10 × 3 = 30)
 *               through the SAME legacy generation path as the BEFORE
 *               baseline, then referees each review TWICE: (a) the
 *               measurement-WIDENED checks (runInsightChecks — window
 *               hypothetical rule) and (b) the STRICT blocking referee
 *               (referee.ts refereeInsight — §4.3 prefix rule). Every fire
 *               is adjudicated mechanically where possible (strict-only +
 *               wouldPassWidenedWindow ⇒ "widened-licensed"; sequence is a
 *               window of the actual game moves ⇒ "game-history-recap";
 *               span backed elsewhere in the contract ⇒
 *               "licensed-elsewhere-in-contract") and otherwise emitted
 *               with sentence context as "needs-review" for human/CI-4
 *               adjudication. No persona judge (fidelity-only measurement).
 *               Output: scripts/eval/results/
 *               contract-referee-fp-30game-<model>.json.
 *               `--fp-measure --dry-run` is the deterministic no-network
 *               smoke for this mode.
 *
 * Output: scripts/eval/results/contract-fidelity-BEFORE-<model>.json
 * (override with --output). Run from the repo root:
 *
 *   npx tsx scripts/eval/contract_fidelity_eval.ts --dry-run
 *   npx tsx scripts/eval/contract_fidelity_eval.ts [--only 09] [--output p.json]
 *   npx tsx scripts/eval/contract_fidelity_eval.ts --fp-measure [--samples 3]
 *   npx tsx scripts/eval/contract_fidelity_eval.ts --fp-measure --fixtures-real
 *   npx tsx scripts/eval/contract_fidelity_eval.ts --fp-measure --dry-run
 *
 * PRECISION PACK additions: --fixtures-real points --fp-measure at
 * src/lib/contract/__tests__/fixtures-real/ (same 10 games, gameEval
 * regenerated with real Stockfish depth 16 multipv 3 —
 * scripts/eval/generate_fixture_evals.ts); the dual referee additionally
 * runs the measurement-ONLY checks (pv_truncation, mobility_claims) and
 * reports their fires separately (measurementOnlyByCheck + needs-review
 * flagged spans) without touching the check-2-5 strict/widened tallies.
 *
 * Known baseline caveats (documented, not silent):
 *  - selectExamples() jitters few-shot choice per run and temperature is
 *    0.7 (the product's serving config) — the baseline is a sample of the
 *    serving distribution, not a fixed-seed artifact.
 *  - Live mode lets the contract builder hit chessdb (and Maia if
 *    configured) exactly like prod; dry-run forces all grounding sources
 *    unavailable.
 */
import * as fs from "node:fs";
import * as path from "node:path";

// Types only (erased at runtime — safe before env prep).
import type { CoachContract, InsightContract } from "@/lib/contract/types";
import type { FidelityEntry, FidelityReport, RefereeViolationCategory } from "@/lib/contract/refereeChecks";
import type { GameEvalInput, GameHeadersInput } from "@/lib/contract/gameEvalSchema";

const REPO_ROOT = process.cwd();
const FIXTURES_DIR = path.join(REPO_ROOT, "src/lib/contract/__tests__/fixtures");
/** PRECISION PACK: same 10 games, gameEval regenerated with REAL Stockfish
 * (scripts/eval/generate_fixture_evals.ts, depth 16 multipv 3). Selected via
 * --fixtures-real — the v2 FP measurement runs against these so arming
 * decisions rest on engine-true contracts, not hand-authored evals. */
const FIXTURES_REAL_DIR = path.join(REPO_ROOT, "src/lib/contract/__tests__/fixtures-real");
const RESULTS_DIR = path.join(REPO_ROOT, "scripts/eval/results");

interface FixtureFile {
  moveHistory: string[];
  gameEval: GameEvalInput;
  playerColor: string;
  username?: string;
  userRating?: number;
  gameHeaders?: GameHeadersInput;
}

interface Args {
  dryRun: boolean;
  only: string | null;
  output: string | null;
  fpMeasure: boolean;
  fixturesReal: boolean;
  samples: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: false,
    only: null,
    output: null,
    fpMeasure: false,
    fixturesReal: false,
    samples: 3,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--only") args.only = argv[++i] ?? null;
    else if (argv[i] === "--output") args.output = argv[++i] ?? null;
    else if (argv[i] === "--fp-measure") args.fpMeasure = true;
    else if (argv[i] === "--fixtures-real") args.fixturesReal = true;
    else if (argv[i] === "--samples") {
      const n = Number.parseInt(argv[++i] ?? "", 10);
      if (!Number.isFinite(n) || n < 1) {
        console.error("--samples needs a positive integer");
        process.exit(2);
      }
      args.samples = n;
    } else {
      console.error(`unknown arg: ${argv[i]}`);
      process.exit(2);
    }
  }
  return args;
}

function loadFixtures(
  only: string | null,
  fixturesReal = false,
): Array<{ name: string; fixture: FixtureFile }> {
  const dir = fixturesReal ? FIXTURES_REAL_DIR : FIXTURES_DIR;
  if (fixturesReal && !fs.existsSync(dir)) {
    console.error(
      `--fixtures-real: ${dir} missing — generate it first: npx tsx scripts/eval/generate_fixture_evals.ts`,
    );
    process.exit(2);
  }
  const names = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  return names
    .filter((n) => (only ? n.includes(only) : true))
    .map((name) => ({
      name: name.replace(/\.json$/, ""),
      fixture: JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as FixtureFile,
    }));
}

function loadApiKey(): string {
  const fromEnv = process.env.ANTHROPIC_API_KEY;
  if (fromEnv) return fromEnv;
  const envLocal = path.join(REPO_ROOT, ".env.local");
  if (fs.existsSync(envLocal)) {
    for (const line of fs.readFileSync(envLocal, "utf8").split("\n")) {
      if (line.startsWith("ANTHROPIC_API_KEY=")) {
        return line.slice("ANTHROPIC_API_KEY=".length).trim().replace(/^['"]|['"]$/g, "");
      }
    }
  }
  console.error("no ANTHROPIC_API_KEY in env or .env.local — cannot run live mode");
  process.exit(2);
}

function skillLevelOf(userRating: number | undefined): "beginner" | "intermediate" | "advanced" {
  // Same derivation as the route (route.ts skillLevel).
  return userRating ? (userRating < 1000 ? "beginner" : userRating < 1600 ? "intermediate" : "advanced") : "intermediate";
}

async function buildContractFor(name: string, f: FixtureFile): Promise<CoachContract> {
  const { buildCoachContract } = await import("@/lib/contract/builder");
  const { getFenAtHalfMove } = await import("@/lib/contract/chessFormat");
  const requestFen = getFenAtHalfMove(f.moveHistory, f.moveHistory.length);
  return buildCoachContract({
    moveHistory: f.moveHistory,
    gameEval: f.gameEval,
    playerColor: f.playerColor,
    username: f.username,
    userRating: f.userRating,
    gameHeaders: f.gameHeaders,
    uid: `fidelity-eval-${name}`,
    identity: { fen: requestFen, playerColor: f.playerColor || "w" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode A — dry-run CI smoke (no network)
// ─────────────────────────────────────────────────────────────────────────────
let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`);
  }
}

function countByCategory(violations: Array<{ category: RefereeViolationCategory }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of violations) out[v.category] = (out[v.category] ?? 0) + 1;
  return out;
}

async function runDryRun(): Promise<void> {
  // No network: kill Lc0/Maia gates BEFORE their modules load (they read env
  // at module load time) and force the chessdb fetch seam to reject.
  delete process.env.LC0_API_URL;
  delete process.env.MAIA_API_URL;
  const chessdb = await import("@/lib/grounding/chessdb");
  chessdb.__setFetchForTesting(async () => {
    throw new Error("network disabled in contract_fidelity_eval --dry-run");
  });

  const { serializeForVerbalizer } = await import("@/lib/contract/serialize");
  const { runInsightChecks, aggregateFidelity } = await import("@/lib/contract/refereeChecks");

  const fixtures = loadFixtures(null);
  console.log(`\n=== Mode A (dry-run): contract build over ${fixtures.length} fixtures ===`);
  check("fixture count is 10", fixtures.length === 10, fixtures.length);

  const contracts = new Map<string, CoachContract>();
  for (const { name, fixture } of fixtures) {
    chessdb.__clearChessdbCache();
    const contract = await buildContractFor(name, fixture);
    contracts.set(name, contract);
    const bytes = Buffer.byteLength(serializeForVerbalizer(contract), "utf8");
    console.log(
      `  ${name}: insights=${contract.insights.length} moveTable=${contract.moveTable.length} ` +
        `contractBytes=${bytes} buildMs=${contract.buildMs} ` +
        `evalIntegrity={sentinels:${contract.evalIntegrity.sentinelPlies.length},truncatedAt:${contract.evalIntegrity.sanTruncatedAtPly}}`,
    );
  }

  console.log(`\n=== Mode A: referee checks vs canned prose (2 known-bad, 1 clean) ===`);
  const c09 = contracts.get("09_legal_trap_tactics")!;
  const c07 = contracts.get("07_knight_fork")!;
  check("fixture 09 contract exists", !!c09);
  check("fixture 07 contract exists", !!c07);
  const bxd1 = c09.insights.find((i) => i.playedSan === "Bxd1");
  const nc7 = c07.insights.find((i) => i.playedSan === "Nc7+");
  check("09 has the Bxd1 blunder insight", !!bxd1);
  check("07 has the Nc7+ fork insight", !!nc7);
  if (!bxd1 || !nc7) {
    process.exit(1);
  }

  // KNOWN-BAD #1 (vs 09/Bxd1): wrong mate distance, invented eval, phantom
  // square + claim verb, unbacked tactical keyword, forbidden positional +
  // visibility claims. Expected: 6 violations across all four checks.
  const bad1 =
    "You are down M+7 after this — the eval crashed to -12.50. " +
    "Your rook on a5 cuts the defense, a classic skewer. " +
    "Obviously this loses and White is completely winning.";
  const bad1Violations = runInsightChecks(bad1, bxd1);
  const bad1Cats = countByCategory(bad1Violations);
  check("bad1: 6 violations total", bad1Violations.length === 6, bad1Cats);
  check("bad1: wrong mate distance caught", bad1Cats["mate_distance_wrong"] === 1, bad1Cats);
  check("bad1: invented eval caught", bad1Cats["eval_unbacked"] === 1, bad1Cats);
  check("bad1: phantom square caught", bad1Cats["square_unknown"] === 1, bad1Cats);
  check("bad1: unbacked 'skewer' caught", bad1Cats["tactical_keyword_unbacked"] === 1, bad1Cats);
  check("bad1: forbidden claims caught (positional + visibility)", bad1Cats["forbidden_claim_present"] === 2, bad1Cats);

  // KNOWN-BAD #2 (vs 07/Nc7+): off-contract hypothetical line + fabricated
  // mate distance; the licensed "fork" keyword must NOT fire.
  const bad2 =
    "Instead of Nc7+, the crushing idea was Qh5 g6 Qxe5 — you missed mate in 4. " +
    "The knight forks the king and rook.";
  const bad2Violations = runInsightChecks(bad2, nc7);
  const bad2Cats = countByCategory(bad2Violations);
  check("bad2: 2 violations total", bad2Violations.length === 2, bad2Cats);
  check("bad2: off-contract line caught", bad2Cats["hypothetical_line_off_contract"] === 1, bad2Cats);
  check("bad2: fabricated mate caught", bad2Cats["mate_distance_wrong"] === 1, bad2Cats);
  check(
    "bad2: licensed 'fork' does not fire (precision control)",
    (bad2Cats["tactical_keyword_unbacked"] ?? 0) === 0,
    bad2Cats,
  );

  // CLEAN CONTROL (vs 09/Bxd1): correct displays, PV-backed lines, header
  // grammar — zero violations or the checks are firing on truth.
  const clean =
    "[INSIGHT:5:b:blunder:+2.00:M+2:Bxd1:dxe5]\n" +
    "Grabbing the queen with Bxd1 walks into a forced mate in 2. " +
    "dxe5 was the move, and after dxe5 Qxg4 White is only about +2.00. " +
    "The game ended with Bxf7+ Ke7 Nd5#.";
  const cleanViolations = runInsightChecks(clean, bxd1);
  check("clean control: 0 violations", cleanViolations.length === 0, cleanViolations);

  // Aggregation shape sanity on the clean control.
  const report = aggregateFidelity([{ insight: bxd1, prose: clean }], c09);
  check("clean aggregate: fabricationRate 0", report.fabricationRate === 0, report.fabricationRate);
  check("clean aggregate: claim sentences counted", report.claimSentences >= 3, report.claimSentences);

  console.log(`\n=== Mode A result: ${failures === 0 ? "GREEN" : `${failures} FAILURE(S)`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode B — live BEFORE baseline (API-billed, manual)
// ─────────────────────────────────────────────────────────────────────────────
interface ParsedBlock {
  moveNumber: number;
  color: string;
  prose: string; // header line + body (the header's eval/SAN echoes are claims too)
}

function parseInsightBlocks(raw: string): { blocks: ParsedBlock[]; prefix: string } {
  const blocks: ParsedBlock[] = [];
  const re = /\[INSIGHT:([^\]]*)\]([\s\S]*?)\[\/INSIGHT\]/g;
  let firstOpen = raw.indexOf("[INSIGHT:");
  let lastEnd = 0;
  for (const m of Array.from(raw.matchAll(re))) {
    const header = m[1];
    const fields = header.split(":").map((s) => s.trim());
    blocks.push({
      moveNumber: Number.parseInt(fields[0] ?? "", 10),
      color: (fields[1] ?? "").toLowerCase(),
      prose: m[0],
    });
    lastEnd = (m.index ?? 0) + m[0].length;
  }
  // Unclosed trailing block (max_tokens truncation) still counts as a block.
  const tailOpen = raw.indexOf("[INSIGHT:", lastEnd);
  if (tailOpen >= 0) {
    const headerEnd = raw.indexOf("]", tailOpen);
    if (headerEnd > tailOpen) {
      const fields = raw.slice(tailOpen + "[INSIGHT:".length, headerEnd).split(":");
      blocks.push({
        moveNumber: Number.parseInt(fields[0] ?? "", 10),
        color: (fields[1] ?? "").toLowerCase(),
        prose: raw.slice(tailOpen),
      });
    }
  }
  return { blocks, prefix: firstOpen >= 0 ? raw.slice(0, firstOpen) : raw };
}

interface PerGameResult {
  fixture: string;
  contractId: string;
  insightsInContract: number;
  blocksEmitted: number;
  blocksMatched: number;
  unmatchedBlocks: number;
  claimSentences: number;
  fabricationCount: number;
  fabricationRate: number;
  violationsByCheck: FidelityReport["violationsByCheck"];
  violationsByCategory: FidelityReport["violationsByCategory"];
  personaScores: number[];
  personaMean: number | null;
  sampleViolations: Array<{ check: string; category: string; span: string; factIdPrefix: string; detail: string }>;
  generatorModel: string;
  outputTokens: number;
}

/**
 * THE legacy-path generation seam — one review, exactly as the BEFORE
 * baseline (and the route) composes it. Shared by Mode B (runLive) and
 * --fp-measure so the two modes can never drift apart. Dynamic imports are
 * module-cached by Node, so per-call importing costs nothing after the
 * first review.
 */
async function generateLegacyReview(
  name: string,
  fixture: FixtureFile,
): Promise<{ contract: CoachContract; content: string; model: string; outputTokens: number }> {
  const { callLLM } = await import("@/lib/llmProvider");
  const { getCoachChatSystemPromptParts } = await import("@/lib/prompts/coachChatPrompt");
  const { selectExamples, formatExamplesForPrompt } = await import("@/data/goldStandardExamples");
  const { renderLegacyPrompt } = await import("@/lib/contract/serialize");

  const contract = await buildContractFor(name, fixture);
  const gameContext = renderLegacyPrompt(contract);

  // Mirror route.ts's userContent assembly exactly: USER REQUEST + game
  // context + gold-standard few-shots ("analyze my game" is the client's
  // canonical auto-review message — AICoachChat autoAnalyze).
  const skillLevel = skillLevelOf(fixture.userRating);
  const examplesContext = formatExamplesForPrompt(selectExamples(undefined, skillLevel, 3));
  const userContent = `## USER REQUEST:\nanalyze my game\n\n${gameContext}${examplesContext}`;

  const parts = getCoachChatSystemPromptParts({
    personalityId: "friendly",
    userRating: fixture.userRating ?? 1500,
    username: fixture.username,
    playerColorName: fixture.playerColor === "b" ? "black" : "white",
  });

  const result = await callLLM({
    tier: "flagship",
    system: parts.stable,
    systemSuffix: parts.perUser,
    cacheSystem: true,
    messages: [{ role: "user", content: userContent }],
    temperature: 0.7,
    maxTokens: 3000,
  });
  return { contract, content: result.content, model: result.model, outputTokens: result.outputTokens };
}

const PERSONA_JUDGE_SYSTEM = [
  "You are an evaluation judge for a chess-coaching product called Chess Masti.",
  "Grade the PERSONA quality of the coaching response you are given — NOT its chess accuracy.",
  "Criteria (equal weight):",
  "1. Masti voice — warm, playful, encouraging energy; not sterile engine-speak.",
  "2. Encouragement — celebrates effort, frames mistakes as learnable moments.",
  "3. Teaching structure — clear idea → problem → solution → takeaway arc per insight.",
  'Score 1-5 (5 = exemplary persona). Respond with ONLY a JSON object: {"score": <number 1-5>}',
].join("\n");

function parseJudgeScore(content: string): number | null {
  const m = content.match(/\{[^{}]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]) as { score?: unknown };
    const s = typeof parsed.score === "number" ? parsed.score : Number.parseFloat(String(parsed.score));
    return Number.isFinite(s) && s >= 1 && s <= 5 ? s : null;
  } catch {
    return null;
  }
}

async function runLive(args: Args): Promise<void> {
  process.env.ANTHROPIC_API_KEY = loadApiKey();

  const { callLLM } = await import("@/lib/llmProvider");
  const { PROMPT_VERSION } = await import("@/lib/prompts/coachChatPrompt");
  const { aggregateFidelity, countClaimSentences } = await import("@/lib/contract/refereeChecks");
  const { CONTRACT_VERSION } = await import("@/lib/contract/types");

  const fixtures = loadFixtures(args.only);
  console.log(`\n=== Mode B (live): legacy-path BEFORE baseline over ${fixtures.length} fixtures ===`);

  const perGame: PerGameResult[] = [];
  let generatorModel = "unknown";
  let judgeModel = "unknown";

  for (const { name, fixture } of fixtures) {
    const t0 = Date.now();
    const result = await generateLegacyReview(name, fixture);
    const contract = result.contract;
    generatorModel = result.model;

    const { blocks } = parseInsightBlocks(result.content);
    const entries: FidelityEntry[] = [];
    let unmatched = 0;
    for (const block of blocks) {
      const insight = contract.insights.find(
        (i) => i.moveNumber === block.moveNumber && i.color === block.color,
      );
      if (insight) entries.push({ insight, prose: block.prose });
      else unmatched++;
    }
    const report = aggregateFidelity(entries, contract);
    // Claim sentences in unmatched blocks still describe the game — count
    // them in the denominator footprint separately (not refereed).
    const unmatchedClaimSentences = blocks
      .filter((b) => !contract.insights.some((i) => i.moveNumber === b.moveNumber && i.color === b.color))
      .reduce((acc, b) => acc + countClaimSentences(b.prose), 0);

    // Persona judge: non-generator tier, 2 passes (PR-E judge hygiene).
    const personaScores: number[] = [];
    for (let pass = 0; pass < 2; pass++) {
      try {
        const judge = await callLLM({
          tier: "fast",
          system: PERSONA_JUDGE_SYSTEM,
          messages: [{ role: "user", content: result.content.slice(0, 12000) }],
          temperature: 0.7,
          maxTokens: 100,
        });
        judgeModel = judge.model;
        const score = parseJudgeScore(judge.content);
        if (score !== null) personaScores.push(score);
      } catch (err) {
        console.error(`  judge pass ${pass + 1} failed for ${name}: ${(err as Error).message}`);
      }
    }
    const personaMean =
      personaScores.length > 0 ? personaScores.reduce((a, b) => a + b, 0) / personaScores.length : null;

    perGame.push({
      fixture: name,
      contractId: contract.contractId,
      insightsInContract: contract.insights.length,
      blocksEmitted: blocks.length,
      blocksMatched: entries.length,
      unmatchedBlocks: unmatched,
      claimSentences: report.claimSentences,
      fabricationCount: report.fabricationCount,
      fabricationRate: Number(report.fabricationRate.toFixed(2)),
      violationsByCheck: report.violationsByCheck,
      violationsByCategory: report.violationsByCategory,
      personaScores,
      personaMean,
      sampleViolations: report.allViolations.slice(0, 12).map((v) => ({
        check: v.check,
        category: v.category,
        span: v.span,
        factIdPrefix: v.factIdPrefix,
        detail: v.detail.slice(0, 200),
      })),
      generatorModel: result.model,
      outputTokens: result.outputTokens,
    });
    console.log(
      `  ${name}: blocks=${blocks.length} matched=${entries.length} unmatched=${unmatched} ` +
        `claimSentences=${report.claimSentences} (+${unmatchedClaimSentences} unrefereed) ` +
        `fabrications=${report.fabricationCount} rate=${report.fabricationRate.toFixed(1)}/100 ` +
        `persona=${personaMean?.toFixed(1) ?? "n/a"} [${Date.now() - t0}ms]`,
    );
  }

  // Aggregate
  const totalClaims = perGame.reduce((a, g) => a + g.claimSentences, 0);
  const totalFabrications = perGame.reduce((a, g) => a + g.fabricationCount, 0);
  const sumChecks = (key: keyof FidelityReport["violationsByCheck"]) =>
    perGame.reduce((a, g) => a + g.violationsByCheck[key], 0);
  const categoryTotals: Record<string, number> = {};
  for (const g of perGame) {
    for (const [cat, n] of Object.entries(g.violationsByCategory)) {
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + n;
    }
  }
  const personaMeans = perGame.map((g) => g.personaMean).filter((x): x is number => x !== null);
  const aggregate = {
    fabricationRate: totalClaims > 0 ? Number(((totalFabrications / totalClaims) * 100).toFixed(2)) : 0,
    fabricationCount: totalFabrications,
    claimSentences: totalClaims,
    violationsByCheck: {
      eval_display: sumChecks("eval_display"),
      san_whitelist: sumChecks("san_whitelist"),
      tactical_keyword: sumChecks("tactical_keyword"),
      forbidden_claim: sumChecks("forbidden_claim"),
    },
    violationsByCategory: categoryTotals,
    personaMean:
      personaMeans.length > 0
        ? Number((personaMeans.reduce((a, b) => a + b, 0) / personaMeans.length).toFixed(2))
        : null,
    unmatchedBlocks: perGame.reduce((a, g) => a + g.unmatchedBlocks, 0),
    blocksEmitted: perGame.reduce((a, g) => a + g.blocksEmitted, 0),
  };

  const payload = {
    date: new Date().toISOString().slice(0, 10),
    mode: "legacy_path_BEFORE_baseline",
    model: { generator: generatorModel, judge: judgeModel },
    promptVersion: PROMPT_VERSION,
    contractVersion: CONTRACT_VERSION,
    fixtures: perGame.length,
    generation: { tier: "flagship", temperature: 0.7, maxTokens: 3000, userMessage: "analyze my game" },
    judge: { tier: "fast", passes: 2, rubric: "masti voice / encouragement / teaching structure, 1-5" },
    aggregate,
    perGame,
  };

  const outPath =
    args.output ?? path.join(RESULTS_DIR, `contract-fidelity-BEFORE-${generatorModel}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
  console.log(`\n=== BEFORE baseline ===`);
  console.log(JSON.stringify(aggregate, null, 2));
  console.log(`written: ${outPath}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode C — --fp-measure: strict-vs-widened false-positive pre-arming set
// (plan §7 PR-CI-3 gate: "SAN/square-check false-positive rate measured on a
// 30-game set before any error-severity arming"). See module doc.
// ─────────────────────────────────────────────────────────────────────────────
type FpAdjudication =
  | "widened-licensed" // strict-only: the sequence IS a contiguous window of a contract PV
  | "game-history-recap" // the sequence is a contiguous window of the actual game moves
  | "licensed-elsewhere-in-contract" // span backed by another insight / the move table
  | "needs-review"; // no mechanical license — human/CI-4 adjudication required

interface FpFlaggedSpan {
  fixture: string;
  sample: number;
  factIdPrefix: string;
  /** "both" = fires under widened AND strict (widened fires ⊆ strict fires);
   * "strict-only" = §4.3 prefix rule fires where the widened window passes. */
  referee: "both" | "strict-only";
  check: string;
  category: string;
  span: string;
  /** The sentence the span sits in — context for human adjudication. */
  sentence: string;
  adjudication: FpAdjudication;
  wouldPassWidenedWindow?: boolean;
  detail: string;
}

interface FpContractPools {
  san: Set<string>;
  squares: Set<string>;
  pawns: number[];
  mates: number[];
  keywords: Set<string>;
  /** Normalized actual game moves (contract.game.moveHistory). */
  gameMoves: string[];
  /** All insights' PVs + move-table bestWas lines (contract-global). */
  pvs: string[][];
}

/**
 * Contract-GLOBAL license pools for mechanical adjudication. The referee
 * checks are insight-LOCAL by design (plan §4.3); a fire whose span is backed
 * elsewhere in the same contract ("earlier you played Nf3") is the documented
 * measurement-bias class — legitimate prose, not fabrication. Built from the
 * same exported grammar (buildWhitelist / collectEvalPools / fenPieceSquares)
 * so the adjudicator can never drift from the checks.
 */
async function buildFpPools(contract: CoachContract): Promise<FpContractPools> {
  const { buildWhitelist, collectEvalPools, fenPieceSquares, stripSanDecorations } = await import(
    "@/lib/contract/refereeChecks"
  );
  const san = new Set<string>();
  const squares = new Set<string>();
  const pawns: number[] = [];
  const mates: number[] = [];
  const keywords = new Set<string>();
  const pvs: string[][] = [];
  const addSanToken = (raw: string) => {
    const s = stripSanDecorations(raw);
    if (!s) return;
    san.add(s);
    for (const sq of s.match(/[a-h][1-8]/g) ?? []) squares.add(sq);
  };

  for (const ins of contract.insights) {
    const wl = buildWhitelist(ins);
    wl.san.forEach((s) => san.add(s));
    wl.squares.forEach((sq) => squares.add(sq));
    pvs.push(...wl.pvs);
    const ep = collectEvalPools(ins);
    pawns.push(...ep.pawns);
    mates.push(...ep.mates);
    for (const k of ins.allowedTacticalKeywords) keywords.add(k.toLowerCase());
  }

  const gameMoves = contract.game.moveHistory.map(stripSanDecorations);
  for (const m of contract.game.moveHistory) addSanToken(m);
  for (const row of contract.moveTable) {
    if (row.evalAfter && !row.evalAfter.sentinel) {
      if (row.evalAfter.mate !== null) mates.push(row.evalAfter.mate);
      else if (row.evalAfter.cp !== null) pawns.push(row.evalAfter.cp / 100);
    }
    for (const fen of [row.fenBefore, row.fenAfter]) {
      if (fen) for (const sq of fenPieceSquares(fen)) squares.add(sq);
    }
    if (row.bestWas) {
      addSanToken(row.bestWas.san);
      if (row.bestWas.line) {
        const line = row.bestWas.line.san.map(stripSanDecorations);
        pvs.push(line);
        for (const s of row.bestWas.line.san) addSanToken(s);
        const ev = row.bestWas.line.eval;
        if (!ev.sentinel) {
          if (ev.mate !== null) mates.push(ev.mate);
          else if (ev.cp !== null) pawns.push(ev.cp / 100);
        }
      }
    }
  }
  return { san, squares, pawns, mates, keywords, gameMoves, pvs };
}

interface FpAdjudicateHelpers {
  stripSanDecorations: (s: string) => string;
  isPvWindow: (seq: string[], pvs: string[][]) => boolean;
}

/** Mechanical adjudication of one fire. Anything not provably licensed stays
 * "needs-review" — no hand-waving; the span+sentence ship in the output. */
function adjudicateFp(
  v: { category: string; span: string; wouldPassWidenedWindow?: boolean },
  pools: FpContractPools,
  helpers: FpAdjudicateHelpers,
): FpAdjudication {
  const { stripSanDecorations, isPvWindow } = helpers;
  switch (v.category) {
    case "hypothetical_line_off_contract": {
      if (v.wouldPassWidenedWindow) return "widened-licensed";
      const seq = v.span.split(/\s+/).map(stripSanDecorations).filter(Boolean);
      if (seq.length > 0 && isPvWindow(seq, [pools.gameMoves])) return "game-history-recap";
      if (seq.length > 0 && isPvWindow(seq, pools.pvs)) return "licensed-elsewhere-in-contract";
      return "needs-review";
    }
    case "san_unknown":
      return pools.san.has(stripSanDecorations(v.span)) ? "licensed-elsewhere-in-contract" : "needs-review";
    case "square_unknown":
      return pools.squares.has(v.span) ? "licensed-elsewhere-in-contract" : "needs-review";
    case "eval_unbacked": {
      const val = Number.parseFloat(v.span);
      return Number.isFinite(val) &&
        pools.pawns.some((p) => Math.abs(p - val) <= EVAL_ADJUDICATION_TOLERANCE + 1e-9)
        ? "licensed-elsewhere-in-contract"
        : "needs-review";
    }
    case "mate_distance_wrong": {
      const signed = v.span.match(/^M([+-]\d+)$/);
      if (signed) {
        const d = Number.parseInt(signed[1], 10);
        return pools.mates.some((md) => md === d) ? "licensed-elsewhere-in-contract" : "needs-review";
      }
      const m = v.span.match(/\d+/);
      const dist = m ? Number.parseInt(m[0], 10) : Number.NaN;
      return pools.mates.some((md) => Math.abs(md) === dist)
        ? "licensed-elsewhere-in-contract"
        : "needs-review";
    }
    case "tactical_keyword_unbacked":
      return pools.keywords.has(v.span.toLowerCase()) ? "licensed-elsewhere-in-contract" : "needs-review";
    default:
      return "needs-review";
  }
}
/** Same ±0.3-pawn tolerance the eval-display check itself uses. */
const EVAL_ADJUDICATION_TOLERANCE = 0.3;

/** Sentence around a span (RefereeFinding drops the index, so fall back to
 * first occurrence; sequences fall back to their first token). */
function sentenceContext(prose: string, span: string, index?: number): string {
  let idx = typeof index === "number" && index >= 0 ? index : prose.indexOf(span);
  if (idx < 0) {
    const tok = span.split(/\s+/)[0] ?? "";
    idx = tok ? prose.indexOf(tok) : -1;
  }
  if (idx < 0) return "";
  let start = 0;
  for (let i = idx - 1; i >= 0; i--) {
    const ch = prose[i];
    if (ch === "." || ch === "!" || ch === "?" || ch === "\n") {
      start = i + 1;
      break;
    }
  }
  let end = prose.length;
  for (let i = idx; i < prose.length; i++) {
    const ch = prose[i];
    if (ch === "." || ch === "!" || ch === "?" || ch === "\n") {
      end = i + 1;
      break;
    }
  }
  return prose.slice(start, end).trim().slice(0, 300);
}

const FP_CONTRACT_CHECKS = new Set(["eval_display", "san_whitelist", "tactical_keyword", "forbidden_claim"]);

interface FpSample {
  fixture: string;
  sample: number;
  contractId: string;
  generatorModel: string;
  outputTokens: number;
  blocksEmitted: number;
  blocksMatched: number;
  unmatchedBlocks: number;
  claimSentences: number;
  /** Contract checks 2–5 only; stage-9 scanners reported separately. */
  strictFires: number;
  widenedFires: number;
  strictOnlyFires: number;
  strictByCategory: Record<string, number>;
  widenedByCategory: Record<string, number>;
  stage9ByCheck: Record<string, number>;
  /** PRECISION PACK: pv_truncation / mobility_claims fires — measurement-ONLY
   * evidence gathering (plan §9 risk 3 discipline: fire-rate data before any
   * arming conversation). Never counted into strict/widened fires so v1↔v2
   * check-2-5 numbers stay directly comparable. */
  measurementOnlyByCheck: Record<string, number>;
  /** Non-empty ⇒ strict ≠ widened + strictOnly for some insight (grammar drift). */
  consistency: string[];
}

/**
 * Referee ONE review with BOTH graders: (a) measurement-widened
 * runInsightChecks (window hypothetical rule) and (b) the PR-CI-3 blocking
 * refereeInsight (strict §4.3 prefix rule + wouldPassWidenedWindow
 * telemetry). Widened fires are a subset of strict fires by construction
 * (prefix ⊂ window; all other checks rule-independent) — verified per
 * insight via the consistency field rather than assumed.
 */
async function refereeReviewDual(input: {
  fixture: string;
  sample: number;
  contract: CoachContract;
  content: string;
  userRating: number | null;
  generatorModel: string;
  outputTokens: number;
}): Promise<{ result: FpSample; flagged: FpFlaggedSpan[] }> {
  const {
    runInsightChecks,
    runMeasurementOnlyChecks,
    countClaimSentences,
    stripSanDecorations,
    isPvWindow,
  } = await import("@/lib/contract/refereeChecks");
  const { refereeInsight } = await import("@/lib/contract/referee");
  const pools = await buildFpPools(input.contract);
  const helpers: FpAdjudicateHelpers = { stripSanDecorations, isPvWindow };

  const { blocks } = parseInsightBlocks(input.content);
  const flagged: FpFlaggedSpan[] = [];
  const strictByCategory: Record<string, number> = {};
  const widenedByCategory: Record<string, number> = {};
  const stage9ByCheck: Record<string, number> = {};
  const measurementOnlyByCheck: Record<string, number> = {};
  const consistency: string[] = [];
  let matched = 0;
  let unmatched = 0;
  let claimSentences = 0;
  let strictFires = 0;
  let widenedFires = 0;
  let strictOnlyFires = 0;
  const bump = (rec: Record<string, number>, key: string) => {
    rec[key] = (rec[key] ?? 0) + 1;
  };

  for (const block of blocks) {
    const insight = input.contract.insights.find(
      (i) => i.moveNumber === block.moveNumber && i.color === block.color,
    );
    if (!insight) {
      unmatched++;
      continue;
    }
    matched++;
    claimSentences += countClaimSentences(block.prose);

    // ROUND 2: both graders get the full contract — the eval-display check
    // licenses contract-globally (precision-pack fix 7) and the round-2
    // game-history licenses (king-context "trapped", forbidden-claim
    // history exemption) need the move table / game moves.
    const widened = runInsightChecks(block.prose, insight, input.contract);
    const strictAll = refereeInsight(block.prose, insight, {
      userRating: input.userRating,
      correlationId: `fp30:${input.fixture}:s${input.sample}:${insight.factIdPrefix}`,
      contract: input.contract,
    }).findings;
    const strictContract = strictAll.filter((f) => FP_CONTRACT_CHECKS.has(f.check));
    const strictOnly = strictContract.filter(
      (f) => f.category === "hypothetical_line_off_contract" && f.wouldPassWidenedWindow === true,
    );
    strictFires += strictContract.length;
    widenedFires += widened.length;
    strictOnlyFires += strictOnly.length;
    if (strictContract.length !== widened.length + strictOnly.length) {
      consistency.push(
        `${insight.factIdPrefix}: strict=${strictContract.length} widened=${widened.length} strictOnly=${strictOnly.length} — strict ≠ widened + strictOnly (grammar drift?)`,
      );
    }
    for (const v of widened) {
      bump(widenedByCategory, v.category);
      bump(strictByCategory, v.category); // widened fires ⊆ strict fires
      flagged.push({
        fixture: input.fixture,
        sample: input.sample,
        factIdPrefix: insight.factIdPrefix,
        referee: "both",
        check: v.check,
        category: v.category,
        span: v.span,
        sentence: sentenceContext(block.prose, v.span, v.index),
        adjudication: adjudicateFp(v, pools, helpers),
        detail: v.detail.slice(0, 300),
      });
    }
    for (const f of strictOnly) {
      bump(strictByCategory, f.category);
      flagged.push({
        fixture: input.fixture,
        sample: input.sample,
        factIdPrefix: insight.factIdPrefix,
        referee: "strict-only",
        check: f.check,
        category: f.category,
        span: f.span,
        sentence: sentenceContext(block.prose, f.span),
        adjudication: adjudicateFp(f, pools, helpers),
        wouldPassWidenedWindow: true,
        detail: f.detail.slice(0, 300),
      });
    }
    for (const f of strictAll.filter((f) => !FP_CONTRACT_CHECKS.has(f.check))) {
      bump(stage9ByCheck, f.check);
    }
    // PRECISION PACK measurement-only checks (pv_truncation / mobility_claims):
    // evidence-gathering fires only — separate tally, no mechanical
    // adjudicator (every fire ships as needs-review with sentence context).
    for (const v of runMeasurementOnlyChecks(block.prose, insight)) {
      bump(measurementOnlyByCheck, v.check);
      flagged.push({
        fixture: input.fixture,
        sample: input.sample,
        factIdPrefix: insight.factIdPrefix,
        referee: "both",
        check: v.check,
        category: v.category,
        span: v.span,
        sentence: sentenceContext(block.prose, v.span, v.index),
        adjudication: "needs-review",
        detail: v.detail.slice(0, 300),
      });
    }
  }

  return {
    result: {
      fixture: input.fixture,
      sample: input.sample,
      contractId: input.contract.contractId,
      generatorModel: input.generatorModel,
      outputTokens: input.outputTokens,
      blocksEmitted: blocks.length,
      blocksMatched: matched,
      unmatchedBlocks: unmatched,
      claimSentences,
      strictFires,
      widenedFires,
      strictOnlyFires,
      strictByCategory,
      widenedByCategory,
      stage9ByCheck,
      measurementOnlyByCheck,
      consistency,
    },
    flagged,
  };
}

interface FpClassTally {
  fires: number;
  adjudications: Record<string, number>;
  needsReview: number;
}

function summarizeFp(samples: FpSample[], flagged: FpFlaggedSpan[]) {
  const sum = (pick: (s: FpSample) => number) => samples.reduce((a, s) => a + pick(s), 0);
  const mergeCats = (pick: (s: FpSample) => Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const s of samples) {
      for (const [k, n] of Object.entries(pick(s))) out[k] = (out[k] ?? 0) + n;
    }
    return out;
  };
  const strictByCategory = mergeCats((s) => s.strictByCategory);
  const widenedByCategory = mergeCats((s) => s.widenedByCategory);
  const stage9ByCheck = mergeCats((s) => s.stage9ByCheck);
  const measurementOnlyByCheck = mergeCats((s) => s.measurementOnlyByCheck ?? {});

  const tallyFor = (cats: string[], side: "strict" | "widened"): FpClassTally => {
    const src = side === "strict" ? strictByCategory : widenedByCategory;
    const fires = cats.reduce((a, c) => a + (src[c] ?? 0), 0);
    const adjudications: Record<string, number> = {};
    let needsReview = 0;
    for (const f of flagged) {
      if (!cats.includes(f.category)) continue;
      if (side === "widened" && f.referee !== "both") continue;
      adjudications[f.adjudication] = (adjudications[f.adjudication] ?? 0) + 1;
      if (f.adjudication === "needs-review") needsReview++;
    }
    return { fires, adjudications, needsReview };
  };

  const evalDisplay = tallyFor(["eval_unbacked", "mate_distance_wrong"], "strict");
  const sanStrict = tallyFor(["san_unknown", "square_unknown", "hypothetical_line_off_contract"], "strict");
  const sanWidened = tallyFor(["san_unknown", "square_unknown", "hypothetical_line_off_contract"], "widened");
  const tactical = tallyFor(["tactical_keyword_unbacked"], "strict");
  const forbidden = tallyFor(["forbidden_claim_present"], "strict");
  const hypoStrictFires = strictByCategory["hypothetical_line_off_contract"] ?? 0;
  const hypoWidenedFires = widenedByCategory["hypothetical_line_off_contract"] ?? 0;
  const strictOnlyFires = sum((s) => s.strictOnlyFires);
  const strictOnlySpans = flagged.filter((f) => f.referee === "strict-only");
  const strictOnlyLicensed = strictOnlySpans.filter((f) => f.adjudication === "widened-licensed").length;
  const hypoTally = tallyFor(["hypothetical_line_off_contract"], "strict");

  const recFor = (t: FpClassTally): string => {
    if (t.fires === 0)
      return "0 fires across the set — no FP evidence; candidate to arm at error in CI-4 (known-bad detection suite must stay green)";
    if (t.needsReview === 0)
      return `all ${t.fires} fire(s) mechanically licensed by contract-GLOBAL facts — the insight-LOCAL whitelist over-fires on legitimate cross-insight/game references; do NOT arm insight-local at error, widen the license pool (or keep warn) first`;
    return `${t.needsReview}/${t.fires} fire(s) lack any mechanical license — human/CI-4 adjudication of flaggedSpans required before arming`;
  };
  let hypoRec: string;
  if (strictOnlyFires > 0) {
    hypoRec = `strict §4.3 prefix rule over-fires ${strictOnlyFires}× where the widened window licenses the span — keep the widened window (or strict-at-warn) in CI-4; ${
      hypoTally.needsReview > 0 ? `${hypoTally.needsReview} shared fire(s) still need review` : "no shared fires need review"
    }`;
  } else if (hypoStrictFires === 0) {
    hypoRec = "0 fires — prefix and window rules agree vacuously on this set; either rule can arm, prefer strict";
  } else {
    hypoRec = `prefix and window agree on all ${hypoStrictFires} fire(s) (no widening pressure observed); adjudicate the needs-review spans before arming`;
  }

  // PRECISION PACK measurement-only checks: evidence tallies only — every
  // fire is a needs-review flagged span; adjudicate before ANY arming talk.
  const measurementOnlyTally = (check: string): FpClassTally => {
    const mine = flagged.filter((f) => f.check === check);
    return {
      fires: measurementOnlyByCheck[check] ?? 0,
      adjudications: mine.length > 0 ? { "needs-review": mine.length } : {},
      needsReview: mine.length,
    };
  };
  const pvTruncation = measurementOnlyTally("pv_truncation");
  const mobilityClaims = measurementOnlyTally("mobility_claims");
  const measurementOnlyRec = (t: FpClassTally): string =>
    t.fires === 0
      ? "0 fires — measurement-only check gathered no evidence on this set; keep measuring before proposing"
      : `${t.fires} measurement-only fire(s), all needs-review by construction — adjudicate flaggedSpans before this check may even be PROPOSED for the arming table`;

  const perCheck = {
    eval_display: { ...evalDisplay, recommendation: recFor(evalDisplay) },
    san_whitelist_strict: { ...sanStrict, recommendation: recFor(sanStrict) },
    san_whitelist_widened: { ...sanWidened, recommendation: recFor(sanWidened) },
    tactical_keyword: { ...tactical, recommendation: recFor(tactical) },
    forbidden_claim: { ...forbidden, recommendation: recFor(forbidden) },
    pv_truncation: { ...pvTruncation, recommendation: measurementOnlyRec(pvTruncation) },
    mobility_claims: { ...mobilityClaims, recommendation: measurementOnlyRec(mobilityClaims) },
    hypothetical_line: {
      strictFires: hypoStrictFires,
      widenedFires: hypoWidenedFires,
      strictOnlyFires,
      adjudications: hypoTally.adjudications,
      needsReview: hypoTally.needsReview,
      recommendation: hypoRec,
    },
  };

  const summary = {
    reviews: samples.length,
    claimSentences: sum((s) => s.claimSentences),
    strictFires: sum((s) => s.strictFires),
    widenedFires: sum((s) => s.widenedFires),
    strictOnlyFires,
    /** Share of strict-only fires the widened window licenses (computed, not
     * assumed — 1.0 confirms the strict/widened delta is exactly the
     * wouldPassWidenedWindow class). */
    widenedLicensedShare:
      strictOnlyFires > 0 ? Number((strictOnlyLicensed / strictOnlyFires).toFixed(3)) : null,
    recommendation: Object.fromEntries(
      Object.entries(perCheck).map(([k, v]) => [k, v.recommendation]),
    ) as Record<string, string>,
  };

  return {
    summary,
    perCheck,
    strictByCategory,
    widenedByCategory,
    stage9ByCheck,
    measurementOnlyByCheck,
  };
}

async function runFpMeasure(args: Args): Promise<void> {
  process.env.ANTHROPIC_API_KEY = loadApiKey();
  const { PROMPT_VERSION } = await import("@/lib/prompts/coachChatPrompt");
  const { CONTRACT_VERSION } = await import("@/lib/contract/types");

  const fixtures = loadFixtures(args.only, args.fixturesReal);
  const total = fixtures.length * args.samples;
  console.log(
    `\n=== Mode C (--fp-measure): ${fixtures.length} fixtures × ${args.samples} samples = ${total} live reviews, dual-refereed` +
      `${args.fixturesReal ? " [fixtures-real: real-Stockfish gameEvals]" : ""} ===`,
  );

  const samples: FpSample[] = [];
  const flagged: FpFlaggedSpan[] = [];
  const failedSamples: Array<{ fixture: string; sample: number; error: string }> = [];
  let generatorModel = "unknown";

  for (const { name, fixture } of fixtures) {
    const t0 = Date.now();
    // The samples of one fixture run concurrently (independent draws at the
    // serving temperature); fixtures run sequentially to stay rate-limit-kind.
    const runs = await Promise.all(
      Array.from({ length: args.samples }, async (_, k) => {
        try {
          return { k, gen: await generateLegacyReview(name, fixture) };
        } catch (err) {
          console.error(
            `  ${name} s${k + 1}: generation failed (${(err as Error).message}) — retrying once`,
          );
          try {
            return { k, gen: await generateLegacyReview(name, fixture) };
          } catch (err2) {
            failedSamples.push({ fixture: name, sample: k + 1, error: (err2 as Error).message });
            return { k, gen: null };
          }
        }
      }),
    );
    for (const { k, gen } of runs) {
      if (!gen) continue;
      generatorModel = gen.model;
      const { result, flagged: f } = await refereeReviewDual({
        fixture: name,
        sample: k + 1,
        contract: gen.contract,
        content: gen.content,
        userRating: fixture.userRating ?? null,
        generatorModel: gen.model,
        outputTokens: gen.outputTokens,
      });
      samples.push(result);
      flagged.push(...f);
      console.log(
        `  ${name} s${k + 1}: blocks=${result.blocksEmitted} matched=${result.blocksMatched} ` +
          `claims=${result.claimSentences} strict=${result.strictFires} widened=${result.widenedFires} ` +
          `strictOnly=${result.strictOnlyFires}${result.consistency.length ? " CONSISTENCY-MISMATCH" : ""}`,
      );
    }
    console.log(`  ${name}: done [${Date.now() - t0}ms]`);
  }

  const agg = summarizeFp(samples, flagged);
  const perFixture = fixtures.map(({ name }) => {
    const mine = samples.filter((s) => s.fixture === name);
    return {
      fixture: name,
      samples: mine,
      totals: {
        claimSentences: mine.reduce((a, s) => a + s.claimSentences, 0),
        strictFires: mine.reduce((a, s) => a + s.strictFires, 0),
        widenedFires: mine.reduce((a, s) => a + s.widenedFires, 0),
        strictOnlyFires: mine.reduce((a, s) => a + s.strictOnlyFires, 0),
      },
    };
  });

  const payload = {
    date: new Date().toISOString().slice(0, 10),
    mode: "referee_fp_30game_pre_arming",
    planGate:
      "CONTRACT_INVERSION_PLAN.md §7 PR-CI-3: SAN/square-check false-positive rate measured on a 30-game set before any error-severity arming",
    model: { generator: generatorModel },
    promptVersion: PROMPT_VERSION,
    contractVersion: CONTRACT_VERSION,
    fixtures: fixtures.length,
    fixturesSource: args.fixturesReal
      ? "fixtures-real (real-Stockfish gameEvals, generate_fixture_evals.ts)"
      : "fixtures (hand-authored gameEvals)",
    samplesPerFixture: args.samples,
    failedSamples,
    generation: { tier: "flagship", temperature: 0.7, maxTokens: 3000, userMessage: "analyze my game" },
    referees: {
      widened:
        "refereeChecks.runInsightChecks (hypotheticalRule: window, precision-pack + round-2 licenses, contract threaded)",
      strict:
        "referee.refereeInsight (hypotheticalRule: prefix, wouldPassWidenedWindow telemetry, contract threaded)",
      measurementOnly:
        "refereeChecks.runMeasurementOnlyChecks (pv_truncation quiescence rewrite + mobility_claims incl. zero-mobility cross-check)",
    },
    summary: agg.summary,
    perCheck: agg.perCheck,
    strictByCategory: agg.strictByCategory,
    widenedByCategory: agg.widenedByCategory,
    stage9Informational: agg.stage9ByCheck,
    measurementOnlyByCheck: agg.measurementOnlyByCheck,
    perFixture,
    flaggedSpans: flagged,
  };

  const outPath =
    args.output ?? path.join(RESULTS_DIR, `contract-referee-fp-30game-${generatorModel}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
  console.log(`\n=== FP pre-arming summary ===`);
  console.log(JSON.stringify(agg.summary, null, 2));
  console.log(`written: ${outPath}`);
  if (failedSamples.length > 0) {
    console.error(`WARNING: ${failedSamples.length}/${total} samples failed generation — set is short`);
    process.exitCode = 1;
  }
}

/** --fp-measure --dry-run: deterministic no-network smoke of the dual-referee
 * + adjudication + aggregation path (same network kill as Mode A). */
async function runFpSmoke(): Promise<void> {
  delete process.env.LC0_API_URL;
  delete process.env.MAIA_API_URL;
  const chessdb = await import("@/lib/grounding/chessdb");
  chessdb.__setFetchForTesting(async () => {
    throw new Error("network disabled in contract_fidelity_eval --fp-measure --dry-run");
  });
  const { buildWhitelist, isPvPrefix } = await import("@/lib/contract/refereeChecks");

  console.log(`\n=== --fp-measure --dry-run: dual-referee smoke (no network) ===`);
  const fixtures = loadFixtures(null);
  const f09 = fixtures.find((f) => f.name === "09_legal_trap_tactics");
  const f07 = fixtures.find((f) => f.name === "07_knight_fork");
  check("fixtures 09 + 07 present", !!f09 && !!f07);
  if (!f09 || !f07) process.exit(1);
  chessdb.__clearChessdbCache();
  const c09 = await buildContractFor(f09.name, f09.fixture);
  chessdb.__clearChessdbCache();
  const c07 = await buildContractFor(f07.name, f07.fixture);
  const bxd1 = c09.insights.find((i) => i.playedSan === "Bxd1");
  const nc7 = c07.insights.find((i) => i.playedSan === "Nc7+");
  check("Bxd1 + Nc7+ insights present", !!bxd1 && !!nc7);
  if (!bxd1 || !nc7) process.exit(1);

  // A mid-PV window: contiguous window of a contract PV that is NOT a prefix
  // of any PV — the exact strict-vs-widened divergence class.
  const wl = buildWhitelist(bxd1);
  let windowSeq: string[] | null = null;
  outer: for (const pv of wl.pvs) {
    for (let off = 1; off + 2 <= pv.length; off++) {
      const seq = pv.slice(off, off + 2);
      if (seq.some((t) => !/^[a-h][1-8]$/.test(t)) && !isPvPrefix(seq, wl.pvs)) {
        windowSeq = seq;
        break outer;
      }
    }
  }
  check("found a mid-PV window seq (window-legal, prefix-illegal)", windowSeq !== null);
  if (!windowSeq) process.exit(1);

  const review09 = `[INSIGHT:${bxd1.moveNumber}:${bxd1.color}]\nAfter ${windowSeq.join(" ")} there is nothing more to say.\n[/INSIGHT]`;
  const dual09 = await refereeReviewDual({
    fixture: "09_smoke",
    sample: 1,
    contract: c09,
    content: review09,
    userRating: f09.fixture.userRating ?? null,
    generatorModel: "dry-run",
    outputTokens: 0,
  });
  check("smoke09: widened passes the mid-PV window", dual09.result.widenedFires === 0, dual09.result.widenedByCategory);
  check("smoke09: strict fires exactly once", dual09.result.strictFires === 1, dual09.result.strictByCategory);
  check(
    "smoke09: the fire is strict-only hypothetical_line",
    dual09.result.strictOnlyFires === 1 &&
      (dual09.result.strictByCategory["hypothetical_line_off_contract"] ?? 0) === 1,
    dual09.result.strictByCategory,
  );
  check(
    "smoke09: adjudicated widened-licensed (mechanical)",
    dual09.flagged.length === 1 &&
      dual09.flagged[0].referee === "strict-only" &&
      dual09.flagged[0].adjudication === "widened-licensed",
    dual09.flagged,
  );
  check(
    "smoke09: flagged span carries sentence context",
    (dual09.flagged[0]?.sentence ?? "").includes(windowSeq[0]),
    dual09.flagged[0]?.sentence,
  );

  // A fabricated line (Mode A's bad2 class): fires under BOTH rules and must
  // never be widened-licensed.
  const review07 = `[INSIGHT:${nc7.moveNumber}:${nc7.color}]\nInstead Qh5 g6 Qxe5 and there is nothing more to say.\n[/INSIGHT]`;
  const dual07 = await refereeReviewDual({
    fixture: "07_smoke",
    sample: 1,
    contract: c07,
    content: review07,
    userRating: f07.fixture.userRating ?? null,
    generatorModel: "dry-run",
    outputTokens: 0,
  });
  const hypo07 = dual07.flagged.filter((f) => f.category === "hypothetical_line_off_contract");
  check(
    "smoke07: fabricated line fires under BOTH rules",
    dual07.result.strictOnlyFires === 0 && dual07.result.widenedFires >= 1 && hypo07.length >= 1,
    dual07.result,
  );
  check(
    "smoke07: fabricated line is NOT widened-licensed",
    hypo07.every((f) => f.adjudication !== "widened-licensed"),
    hypo07.map((f) => f.adjudication),
  );

  // Aggregation shape + arithmetic.
  const samples = [dual09.result, dual07.result];
  const flagged = [...dual09.flagged, ...dual07.flagged];
  const agg = summarizeFp(samples, flagged);
  check("summary: reviews = 2", agg.summary.reviews === 2, agg.summary);
  check(
    "summary: strict = widened + strictOnly",
    agg.summary.strictFires === agg.summary.widenedFires + agg.summary.strictOnlyFires,
    agg.summary,
  );
  check("summary: widenedLicensedShare = 1", agg.summary.widenedLicensedShare === 1, agg.summary);
  check(
    "summary: all eight per-check recommendations present (incl. the 2 measurement-only)",
    Object.keys(agg.summary.recommendation).length === 8,
    agg.summary.recommendation,
  );
  check(
    "consistency: no strict/widened grammar drift",
    samples.every((s) => s.consistency.length === 0),
    samples.map((s) => s.consistency),
  );

  console.log(`\n=== --fp-measure smoke result: ${failures === 0 ? "GREEN" : `${failures} FAILURE(S)`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.fpMeasure && args.dryRun) await runFpSmoke();
  else if (args.fpMeasure) await runFpMeasure(args);
  else if (args.dryRun) await runDryRun();
  else await runLive(args);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
