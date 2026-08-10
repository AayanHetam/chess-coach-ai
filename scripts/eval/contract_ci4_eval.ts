/**
 * Contract CI-4 eval — the AFTER measurement for the verbalizer-4.0 ENFORCED
 * path (CONTRACT_INVERSION_PLAN.md §7 PR-CI-4 gates), in a NEW script so the
 * parallel --fp-measure work on contract_fidelity_eval.ts merges cleanly.
 *
 * Gates measured (against the BEFORE baseline
 * results/contract-fidelity-BEFORE-claude-sonnet-4-6.json —
 * fabrication 24.6/100 claim sentences, personaMean 3.75):
 *   - fabrication rate of SHIPPED prose ≤ 1
 *   - citation coverage (model output, pre-strip) ≥ 80%
 *   - personaMean ≥ 3.55 (baseline − 0.2)
 *   - ladder-stage distribution (reported)
 *   - TTFT: first visible text + first completed card vs the LEGACY path on
 *     the same fixtures (gate: first card ≤ legacy + 0.5s p50)
 *
 * Modes (house harness discipline):
 *   --dry-run   CI smoke, ZERO network: contracts built for all fixtures;
 *               the ENFORCED stream runs over canned model output (one clean
 *               cited card, one fabricated card) asserting ladder behavior,
 *               citation stripping, and server-authoritative headers.
 *   (live)      ANTHROPIC_API_KEY required. Per fixture: one legacy-path
 *               flagship stream (TTFT reference) + one verbalizer-4.0
 *               enforced stream (the real serving composition:
 *               getVerbalizerSystemPromptParts + buildVerbalizerUserTurn +
 *               callLLMStream → createEnforcedContractStream, refereeMode
 *               full) + 2 Haiku persona judge passes on the shipped text.
 *               Cost ≈ $2 for 10 fixtures. Authorized CI-4 gate spend.
 *
 * Run from the repo root:
 *   npx tsx scripts/eval/contract_ci4_eval.ts --dry-run
 *   npx tsx scripts/eval/contract_ci4_eval.ts [--only 09] [--output p.json]
 */
import * as fs from "node:fs";
import * as path from "node:path";

import type { CoachContract } from "@/lib/contract/types";
import type { FidelityEntry } from "@/lib/contract/refereeChecks";
import type { GameEvalInput, GameHeadersInput } from "@/lib/contract/gameEvalSchema";
import type { LadderStage } from "@/lib/contract/ladder";

const REPO_ROOT = process.cwd();
const FIXTURES_DIR = path.join(REPO_ROOT, "src/lib/contract/__tests__/fixtures");
const RESULTS_DIR = path.join(REPO_ROOT, "scripts/eval/results");

/** Position-analysis-shaped request (the CI-4 armed category). */
const USER_MESSAGE = "analyze this position and where my play went wrong";

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
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
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

function skillLevelOf(r: number | undefined): "beginner" | "intermediate" | "advanced" {
  return r ? (r < 1000 ? "beginner" : r < 1600 ? "intermediate" : "advanced") : "intermediate";
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
    uid: `ci4-eval-${name}`,
    identity: { fen: requestFen, playerColor: f.playerColor || "w" },
  });
}

let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.error(`  FAIL  ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode A — dry-run CI smoke (no network)
// ─────────────────────────────────────────────────────────────────────────────
async function runDryRun(): Promise<void> {
  delete process.env.LC0_API_URL;
  delete process.env.MAIA_API_URL;
  const chessdb = await import("@/lib/grounding/chessdb");
  chessdb.__setFetchForTesting(async () => {
    throw new Error("network disabled in contract_ci4_eval --dry-run");
  });

  const { createEnforcedContractStream } = await import("@/lib/contract/enforcedStream");
  const { renderInsightHeader } = await import("@/lib/contract/insightGrammar");
  const { selectCardInsights, buildVerbalizerUserTurn, getVerbalizerSystemPromptParts } =
    await import("@/lib/prompts/verbalizerPrompt");

  const fixtures = loadFixtures(null);
  console.log(`\n=== Mode A (dry-run): contracts + enforced stream over ${fixtures.length} fixtures ===`);
  check("fixture count is 10", fixtures.length === 10, fixtures.length);

  let contract: CoachContract | null = null;
  for (const { name, fixture } of fixtures) {
    chessdb.__clearChessdbCache();
    const c = await buildContractFor(name, fixture);
    if (name.includes("09")) contract = c;
    const turn = buildVerbalizerUserTurn({ contract: c, messageText: USER_MESSAGE });
    const cards = selectCardInsights(c);
    console.log(`  ${name}: cards=${cards.length} userTurnBytes=${Buffer.byteLength(turn)}`);
    check(`${name}: card plan lists every selected insight header`, cards.every((i) => turn.includes(renderInsightHeader(i))));
  }
  check("fixture 09 contract exists", !!contract);
  if (!contract) process.exit(1);

  const sys = getVerbalizerSystemPromptParts({ personalityId: "friendly", userRating: 1500 });
  check("verbalizer system carries the charter", sys.stable.includes("VERBALIZER CHARTER"));

  const cards = selectCardInsights(contract);
  check("09 has ≥2 cards for the stream smoke", cards.length >= 2, cards.length);
  const [a, b] = cards;
  const cleanBody = `You went for ${a.playedSan}, and the position tightened [F:${a.factIdPrefix}].`;
  const badBody = "The eval crashed to -9.87 for -9.87 reasons here.";
  const message =
    "Quick look at the key moments [F:bogus.token].\n\n" +
    `${renderInsightHeader(a)}\n${cleanBody}\n[/INSIGHT]\n\n` +
    `[INSIGHT:${b.moveNumber}:${b.color}:garbled-eval:x:y:${b.playedSan}]\n${badBody}\n[/INSIGHT]`;

  const emitted: string[] = [];
  const stream = createEnforcedContractStream({
    contract,
    emit: (t) => emitted.push(t),
    correlationId: "ci4-dry",
    refereeMode: "deterministic",
    citationGranularity: "sentence",
    deadlineAtMs: Date.now() + 1, // deadline already breached ⇒ no LLM stages
    regenSystem: sys,
  });
  for (let i = 0; i < message.length; i += 17) stream.push(message.slice(i, i + 17));
  const summary = await stream.end();
  const shipped = emitted.join("");

  console.log(`\n=== Mode A: enforced-stream assertions ===`);
  check("prefix survived, citations stripped", shipped.includes("Quick look") && !shipped.includes("[F:"));
  check("2 cards laddered", summary.cards.length === 2, summary.cards.length);
  check("clean card passed", summary.ladderDistribution.pass === 1, summary.ladderDistribution);
  check(
    "fabricated card resolved to the template floor (deadline ⇒ no LLM)",
    summary.ladderDistribution.templated === 1,
    summary.ladderDistribution,
  );
  check("fabricated eval never shipped", !shipped.includes("-9.87"));
  check(
    "headers are server-authoritative",
    shipped.includes(renderInsightHeader(a)) && shipped.includes(renderInsightHeader(b)),
  );
  check("shipped text equals summary.finalText", shipped === summary.finalText);

  console.log(`\n=== Mode A result: ${failures === 0 ? "GREEN" : `${failures} FAILURE(S)`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode B — live AFTER measurement (API-billed, manual; the CI-4 gate run)
// ─────────────────────────────────────────────────────────────────────────────
interface ParsedBlock {
  moveNumber: number;
  color: string;
  prose: string;
}

function parseInsightBlocks(raw: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  for (const m of Array.from(raw.matchAll(/\[INSIGHT:([^\]]*)\]([\s\S]*?)\[\/INSIGHT\]/g))) {
    const fields = m[1].split(":").map((s) => s.trim());
    blocks.push({
      moveNumber: Number.parseInt(fields[0] ?? "", 10),
      color: (fields[1] ?? "").toLowerCase(),
      prose: m[0],
    });
  }
  return blocks;
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

function p50(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

async function runLive(args: Args): Promise<void> {
  process.env.ANTHROPIC_API_KEY = loadApiKey();

  const { callLLM, callLLMStream } = await import("@/lib/llmProvider");
  const { getCoachChatSystemPromptParts, PROMPT_VERSION } = await import("@/lib/prompts/coachChatPrompt");
  const { selectExamples, formatExamplesForPrompt } = await import("@/data/goldStandardExamples");
  const { renderLegacyPrompt } = await import("@/lib/contract/serialize");
  const { aggregateFidelity } = await import("@/lib/contract/refereeChecks");
  const { createEnforcedContractStream } = await import("@/lib/contract/enforcedStream");
  const {
    buildVerbalizerUserTurn,
    getVerbalizerSystemPromptParts,
    maxTokensForInsights,
    selectCardInsights,
    VERBALIZER_PROMPT_VERSION,
  } = await import("@/lib/prompts/verbalizerPrompt");

  const fixtures = loadFixtures(args.only);
  console.log(`\n=== Mode B (live): verbalizer-4.0 ENFORCED AFTER measurement over ${fixtures.length} fixtures ===`);

  interface PerGame {
    fixture: string;
    contractId: string;
    cardsPlanned: number;
    cardsShipped: number;
    ladder: Record<LadderStage, number>;
    citationCoverage: number | null;
    claimSentences: number;
    fabricationCount: number;
    fabricationRate: number;
    personaScores: number[];
    personaMean: number | null;
    legacyTtftMs: number;
    legacyFirstCardMs: number | null;
    contractTtftMs: number;
    contractFirstCardMs: number | null;
    errorsInitial: number;
    warnsInitial: number;
    editsUsed: number;
    regensUsed: number;
    costUsd: number;
    sampleViolations: Array<{ check: string; category: string; span: string }>;
  }
  const perGame: PerGame[] = [];
  let generatorModel = "unknown";
  let judgeModel = "unknown";

  for (const { name, fixture } of fixtures) {
    const contract = await buildContractFor(name, fixture);
    const skillLevel = skillLevelOf(fixture.userRating);
    const promptInput = {
      personalityId: "friendly",
      userRating: fixture.userRating ?? 1500,
      username: fixture.username,
      playerColorName: (fixture.playerColor === "b" ? "black" : "white") as "black" | "white",
    };

    // ── LEGACY reference stream (TTFT + first-card timings) ────────────────
    const legacyParts = getCoachChatSystemPromptParts(promptInput);
    const examplesContext = formatExamplesForPrompt(selectExamples(undefined, skillLevel, 3));
    const legacyUser = `## USER REQUEST:\n${USER_MESSAGE}\n\n${renderLegacyPrompt(contract)}${examplesContext}`;
    let legacyText = "";
    let legacyTtftMs = -1;
    let legacyFirstCardMs: number | null = null;
    const tLegacy = Date.now();
    for await (const evt of callLLMStream({
      tier: "flagship",
      system: legacyParts.stable,
      systemSuffix: legacyParts.perUser,
      cacheSystem: true,
      messages: [{ role: "user", content: legacyUser }],
      temperature: 0.7,
      maxTokens: 3000,
    })) {
      if (evt.type === "text") {
        legacyText += evt.delta;
        if (legacyTtftMs < 0) legacyTtftMs = Date.now() - tLegacy;
        if (legacyFirstCardMs === null && legacyText.includes("[/INSIGHT]")) {
          legacyFirstCardMs = Date.now() - tLegacy;
        }
      } else {
        generatorModel = evt.result.model;
      }
    }

    // ── CONTRACT-MODE enforced stream (the serving composition) ────────────
    const vParts = getVerbalizerSystemPromptParts(promptInput);
    const vUserTurn = buildVerbalizerUserTurn({ contract, messageText: USER_MESSAGE });
    const cardsPlanned = selectCardInsights(contract).length;
    let contractTtftMs = -1;
    let contractFirstCardMs: number | null = null;
    let shipped = "";
    const tContract = Date.now();
    const enforced = createEnforcedContractStream({
      contract,
      emit: (text) => {
        shipped += text;
        if (contractTtftMs < 0 && text.trim().length > 0) contractTtftMs = Date.now() - tContract;
        if (contractFirstCardMs === null && shipped.includes("[/INSIGHT]")) {
          contractFirstCardMs = Date.now() - tContract;
        }
      },
      correlationId: `ci4-${name}`,
      refereeMode: "full",
      citationGranularity: "sentence",
      deadlineAtMs: tContract + 55_000,
      regenSystem: vParts,
    });
    for await (const evt of callLLMStream({
      tier: "flagship",
      system: vParts.stable,
      systemSuffix: vParts.perUser,
      cacheSystem: true,
      messages: [{ role: "user", content: vUserTurn }],
      temperature: 0.7,
      maxTokens: maxTokensForInsights(cardsPlanned),
    })) {
      if (evt.type === "text") enforced.push(evt.delta);
      else generatorModel = evt.result.model;
    }
    const summary = await enforced.end();

    // ── Fabrication of SHIPPED prose (same machinery as the BEFORE run) ────
    const blocks = parseInsightBlocks(summary.finalText);
    const entries: FidelityEntry[] = [];
    for (const block of blocks) {
      const insight = contract.insights.find(
        (i) => i.moveNumber === block.moveNumber && i.color === block.color,
      );
      if (insight) entries.push({ insight, prose: block.prose });
    }
    const report = aggregateFidelity(entries, contract);

    // ── Persona judge (non-generator tier, 2 passes) ───────────────────────
    const personaScores: number[] = [];
    for (let pass = 0; pass < 2; pass++) {
      try {
        const judge = await callLLM({
          tier: "fast",
          system: PERSONA_JUDGE_SYSTEM,
          messages: [{ role: "user", content: summary.finalText.slice(0, 12000) }],
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
      cardsPlanned,
      cardsShipped: summary.cards.length,
      ladder: summary.ladderDistribution,
      citationCoverage: summary.citationCoverageMean,
      claimSentences: report.claimSentences,
      fabricationCount: report.fabricationCount,
      fabricationRate: Number(report.fabricationRate.toFixed(2)),
      personaScores,
      personaMean,
      legacyTtftMs,
      legacyFirstCardMs,
      contractTtftMs,
      contractFirstCardMs,
      errorsInitial: summary.errorsInitialTotal,
      warnsInitial: summary.warnsInitialTotal,
      editsUsed: summary.cards.reduce((a, c) => a + c.editsUsed, 0),
      regensUsed: summary.cards.reduce((a, c) => a + c.regensUsed, 0),
      costUsd: Number(summary.costUsd.toFixed(4)),
      sampleViolations: report.allViolations
        .slice(0, 8)
        .map((v) => ({ check: v.check, category: v.category, span: v.span.slice(0, 60) })),
    });
    const g = perGame[perGame.length - 1];
    console.log(
      `  ${name}: cards=${g.cardsShipped}/${g.cardsPlanned} ladder=${JSON.stringify(g.ladder)} ` +
        `cite=${g.citationCoverage === null ? "n/a" : (g.citationCoverage * 100).toFixed(0) + "%"} ` +
        `fab=${g.fabricationCount}/${g.claimSentences} (${g.fabricationRate}/100) persona=${g.personaMean ?? "n/a"} ` +
        `ttft=${g.contractTtftMs}ms(vs ${g.legacyTtftMs}ms) firstCard=${g.contractFirstCardMs}ms(vs ${g.legacyFirstCardMs}ms)`,
    );
  }

  // ── Aggregate + gates ──────────────────────────────────────────────────────
  const totalClaims = perGame.reduce((a, g) => a + g.claimSentences, 0);
  const totalFabs = perGame.reduce((a, g) => a + g.fabricationCount, 0);
  const fabricationRate = totalClaims > 0 ? Number(((totalFabs / totalClaims) * 100).toFixed(2)) : 0;
  const coverages = perGame.map((g) => g.citationCoverage).filter((x): x is number => x !== null);
  const citationCoverage =
    coverages.length > 0 ? Number((coverages.reduce((a, b) => a + b, 0) / coverages.length).toFixed(3)) : null;
  const personaMeans = perGame.map((g) => g.personaMean).filter((x): x is number => x !== null);
  const personaMean =
    personaMeans.length > 0
      ? Number((personaMeans.reduce((a, b) => a + b, 0) / personaMeans.length).toFixed(2))
      : null;
  const ladder: Record<LadderStage, number> = {
    pass: 0,
    sentence_drop: 0,
    edited: 0,
    regenerated: 0,
    templated: 0,
    passthrough_footnoted: 0,
  };
  for (const g of perGame) for (const k of Object.keys(ladder) as LadderStage[]) ladder[k] += g.ladder[k];
  const firstCardDeltas = perGame
    .filter((g) => g.contractFirstCardMs !== null && g.legacyFirstCardMs !== null)
    .map((g) => g.contractFirstCardMs! - g.legacyFirstCardMs!);

  const aggregate = {
    fabricationRate,
    fabricationCount: totalFabs,
    claimSentences: totalClaims,
    citationCoverage,
    personaMean,
    ladderDistribution: ladder,
    ttft: {
      legacyTtftP50Ms: p50(perGame.map((g) => g.legacyTtftMs)),
      contractTtftP50Ms: p50(perGame.map((g) => g.contractTtftMs)),
      legacyFirstCardP50Ms: p50(perGame.map((g) => g.legacyFirstCardMs).filter((x): x is number => x !== null)),
      contractFirstCardP50Ms: p50(
        perGame.map((g) => g.contractFirstCardMs).filter((x): x is number => x !== null),
      ),
      firstCardDeltaP50Ms: p50(firstCardDeltas),
    },
    totalCostUsd: Number(perGame.reduce((a, g) => a + g.costUsd, 0).toFixed(4)),
  };

  console.log(`\n=== CI-4 gates ===`);
  check("fabrication ≤ 1 per 100 claim sentences", fabricationRate <= 1, fabricationRate);
  check("citation coverage ≥ 80%", citationCoverage !== null && citationCoverage >= 0.8, citationCoverage);
  check("personaMean ≥ 3.55 (baseline 3.75 − 0.2)", personaMean !== null && personaMean >= 3.55, personaMean);
  const delta = aggregate.ttft.firstCardDeltaP50Ms;
  check("first card ≤ legacy + 500ms p50", delta !== null && delta <= 500, delta);

  const payload = {
    date: new Date().toISOString().slice(0, 10),
    mode: "verbalizer_4.0_enforced_AFTER",
    model: { generator: generatorModel, judge: judgeModel },
    verbalizerPromptVersion: VERBALIZER_PROMPT_VERSION,
    legacyPromptVersion: PROMPT_VERSION,
    fixtures: perGame.length,
    userMessage: USER_MESSAGE,
    refereeMode: "full",
    aggregate,
    gates: {
      fabricationLe1: fabricationRate <= 1,
      citationCoverageGe80: citationCoverage !== null && citationCoverage >= 0.8,
      personaMeanGe355: personaMean !== null && personaMean >= 3.55,
      firstCardLeLegacyPlus500msP50: delta !== null && delta <= 500,
    },
    perGame,
  };

  const outPath = args.output ?? path.join(RESULTS_DIR, `contract-ci4-AFTER-${generatorModel}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
  console.log(`\n=== AFTER aggregate ===`);
  console.log(JSON.stringify(aggregate, null, 2));
  console.log(`written: ${outPath}`);
  process.exit(failures === 0 ? 0 : 1);
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
