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
 * Output: scripts/eval/results/contract-fidelity-BEFORE-<model>.json
 * (override with --output). Run from the repo root:
 *
 *   npx tsx scripts/eval/contract_fidelity_eval.ts --dry-run
 *   npx tsx scripts/eval/contract_fidelity_eval.ts [--only 09] [--output p.json]
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
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, only: null, output: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--only") args.only = argv[++i] ?? null;
    else if (argv[i] === "--output") args.output = argv[++i] ?? null;
    else {
      console.error(`unknown arg: ${argv[i]}`);
      process.exit(2);
    }
  }
  return args;
}

function loadFixtures(only: string | null): Array<{ name: string; fixture: FixtureFile }> {
  const names = fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  return names
    .filter((n) => (only ? n.includes(only) : true))
    .map((name) => ({
      name: name.replace(/\.json$/, ""),
      fixture: JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8")) as FixtureFile,
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
  const { getCoachChatSystemPromptParts, PROMPT_VERSION } = await import("@/lib/prompts/coachChatPrompt");
  const { selectExamples, formatExamplesForPrompt } = await import("@/data/goldStandardExamples");
  const { renderLegacyPrompt } = await import("@/lib/contract/serialize");
  const { aggregateFidelity, countClaimSentences } = await import("@/lib/contract/refereeChecks");
  const { CONTRACT_VERSION } = await import("@/lib/contract/types");

  const fixtures = loadFixtures(args.only);
  console.log(`\n=== Mode B (live): legacy-path BEFORE baseline over ${fixtures.length} fixtures ===`);

  const perGame: PerGameResult[] = [];
  let generatorModel = "unknown";
  let judgeModel = "unknown";

  for (const { name, fixture } of fixtures) {
    const t0 = Date.now();
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.dryRun) await runDryRun();
  else await runLive(args);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
