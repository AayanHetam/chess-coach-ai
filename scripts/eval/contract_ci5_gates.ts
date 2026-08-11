/**
 * CI-5 GATE RUN — game_review, multi-sample, honest.
 *
 * Same discipline as contract_ci4_gates.ts (N independent generations per
 * fixture; every gate reported PER RUN and POOLED; the REAL serving arming
 * table, never a hand-copied mirror), retargeted at the surface CI-5 arms:
 *
 *   - USER MESSAGE is the game_review request ("analyze my game"), not the
 *     position_analysis one the CI-4 runs used. The vendored fixtures are
 *     full games with top mistakes either way; what changes is the request
 *     framing, and therefore the card counts the model is asked to carry.
 *   - The CI-5 GATE is added: FALSE-INTERVENTION RATE < 15%.
 *
 * WHY THE GATE MOVED (plan §14, founder-approved 2026-08-11). The original
 * CI-5 gate — "referee-intervention < 15%" — measures the wrong quantity.
 * Under the armed table, an intervention means the referee caught something;
 * the intervention rate IS (approximately) the generator's fabrication rate.
 * Satisfying a <15% bar on it would require DISARMING the referee and
 * shipping the fabrications. The gate is therefore:
 *
 *     false-intervention rate = mechanically-licensed fires / total armed fires
 *
 * A fire is "false" when the span it flagged is provably backed elsewhere in
 * the SAME contract (adjudicateFp in ./fpAdjudication.ts — the same
 * contract-global pools the v3/v4 arming decisions used, built from the
 * referee's own exported grammar so it cannot drift). The adjudicator only
 * ever proves a fire FALSE; everything else stays "needs-review", so this
 * number is a LOWER BOUND on precision and an UPPER bound on nothing. Raw
 * intervention rate is still reported — as a metric, not a bar.
 *
 * Also measured, because game_review is where they can actually fail:
 *   - TTFT and FIRST-CARD latency against the legacy path on the same fixture
 *     (the CI-4 verification's first-card miss was at 1-3 cards; game_review
 *     runs up to 13 through one 55s budget);
 *   - ladder distribution, deadline breaches, and cards refused by the CI-5
 *     sentinel guard;
 *   - prose retention (a fabrication number earned by DELETION is not a win).
 *
 * Run from the repo root:
 *   npx tsx scripts/eval/contract_ci5_gates.ts --dry-run
 *   npx tsx scripts/eval/contract_ci5_gates.ts [--samples 3] [--only 09]
 *                                              [--no-legacy] [--output p.json]
 */
import * as fs from "node:fs";
import * as path from "node:path";

import type { CoachContract, InsightContract } from "@/lib/contract/types";
import type { FidelityEntry } from "@/lib/contract/refereeChecks";
import type { GameEvalInput, GameHeadersInput } from "@/lib/contract/gameEvalSchema";
import type { LadderStage } from "@/lib/contract/ladder";
import type { ServingFinding } from "@/lib/contract/armingConfig";
import { CI4_GATE_ARMING_TABLE } from "./ci4GateTable";
import { adjudicateFp, buildFpPools } from "./fpAdjudication";
import type { FpAdjudication } from "./fpAdjudication";

const REPO_ROOT = process.cwd();
const FIXTURES_DIR = path.join(REPO_ROOT, "src/lib/contract/__tests__/fixtures");
const RESULTS_DIR = path.join(REPO_ROOT, "scripts/eval/results");

/**
 * The game_review request. The CI-4 runs used "analyze this position and where
 * my play went wrong" (position_analysis framing); this is the turn-1 phrasing
 * the /analysis Coach tab actually sends, and it is the ONLY intentional
 * difference in composition between the CI-4 and CI-5 gate runs.
 */
const USER_MESSAGE = "analyze my game";
const CATEGORY = "game_review";

// CI-4 gates, inherited unchanged (all must still pass for game_review).
const GATE_PERSONA_POOLED = 3.55;
const GATE_PERSONA_PER_RUN = 3.5;
const GATE_CITATION = 0.8;
const GATE_FABRICATION = 1;
// The CI-5 gate (plan §14).
const GATE_FALSE_INTERVENTION = 0.15;

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
  samples: number;
  legacy: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, only: null, output: null, samples: 3, legacy: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--no-legacy") args.legacy = false;
    else if (argv[i] === "--only") args.only = argv[++i] ?? null;
    else if (argv[i] === "--output") args.output = argv[++i] ?? null;
    else if (argv[i] === "--samples") args.samples = Number.parseInt(argv[++i] ?? "3", 10);
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
    uid: `ci5-gates-${name}`,
    identity: { fen: requestFen, playerColor: f.playerColor || "w" },
  });
}

interface ParsedBlock {
  moveNumber: number;
  color: string;
  prose: string;
  body: string;
}

function parseInsightBlocks(raw: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  for (const m of Array.from(raw.matchAll(/\[INSIGHT:([^\]]*)\]([\s\S]*?)\[\/INSIGHT\]/g))) {
    const fields = m[1].split(":").map((s) => s.trim());
    blocks.push({
      moveNumber: Number.parseInt(fields[0] ?? "", 10),
      color: (fields[1] ?? "").toLowerCase(),
      prose: m[0],
      body: m[2],
    });
  }
  return blocks;
}

// ── Persona judge — byte-identical rubric to the CI-4 gate run ──────────────
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
    const s =
      typeof parsed.score === "number" ? parsed.score : Number.parseFloat(String(parsed.score));
    return Number.isFinite(s) && s >= 1 && s <= 5 ? s : null;
  } catch {
    return null;
  }
}

function mean(xs: number[]): number | null {
  return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
function round(x: number | null, digits = 3): number | null {
  return x === null ? null : Number(x.toFixed(digits));
}
function p50(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}
function p95(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)];
}

let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.error(`  FAIL  ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`);
  }
}

// ── Intervention accounting ────────────────────────────────────────────────
interface InterventionFire {
  fixture: string;
  sample: number;
  factIdPrefix: string;
  check: string;
  category: string;
  span: string;
  adjudication: FpAdjudication;
  /** true ⇒ the fire is PROVABLY a false positive (licensed elsewhere). */
  isFalse: boolean;
}

/**
 * Recompute the ARMED-ERROR findings the ladder acted on, from the model's
 * PRE-ladder body, and adjudicate each one.
 *
 * Deliberately NOT read off LadderCardResult.findings: that field is a
 * telemetry sample (first 8, spans truncated to 60 chars), and a truncated
 * span cannot be adjudicated. Recomputing with the SAME referee + the SAME
 * arming table reproduces exactly what the ladder saw, at full fidelity.
 */
async function interventionsForCard(
  rawBody: string,
  insight: InsightContract,
  contract: CoachContract,
  pools: Awaited<ReturnType<typeof buildFpPools>>,
): Promise<ServingFinding[]> {
  const { refereeInsight } = await import("@/lib/contract/referee");
  const { checkCitations, stripGrammarTokenLines } = await import("@/lib/contract/citations");
  const { armFindings } = await import("@/lib/contract/armingConfig");
  void pools;
  const prose = stripGrammarTokenLines(rawBody);
  const citation = checkCitations(rawBody, insight, "sentence");
  const det = refereeInsight(prose, insight, {
    correlationId: "ci5-intervention",
    userRating: contract.game.userRating ?? 1500,
    playerPerspective: contract.game.playerColor === "b" ? "black" : "white",
    contract,
  });
  return armFindings([...citation.findings, ...det.findings], CI4_GATE_ARMING_TABLE).errors;
}

// ── Dry-run: zero-network smoke ────────────────────────────────────────────
async function runDryRun(): Promise<void> {
  delete process.env.LC0_API_URL;
  delete process.env.MAIA_API_URL;
  const chessdb = await import("@/lib/grounding/chessdb");
  chessdb.__setFetchForTesting(async () => {
    throw new Error("network disabled in contract_ci5_gates --dry-run");
  });
  const { createEnforcedContractStream } = await import("@/lib/contract/enforcedStream");
  const { renderInsightHeader } = await import("@/lib/contract/insightGrammar");
  const { aggregateFidelity } = await import("@/lib/contract/refereeChecks");
  const {
    buildVerbalizerUserTurn,
    getVerbalizerSystemPromptParts,
    maxTokensForInsights,
    selectCardInsights,
    selectCardInsightsDetailed,
  } = await import("@/lib/prompts/verbalizerPrompt");

  const fixtures = loadFixtures(null);
  console.log(`\n=== CI-5 dry-run: game_review composition over ${fixtures.length} fixtures ===`);
  check("fixture count is 10", fixtures.length === 10, fixtures.length);

  let sentinelRefusalsSeen = 0;
  let biggest: { name: string; contract: CoachContract; cards: number } | null = null;
  for (const { name, fixture } of fixtures) {
    chessdb.__clearChessdbCache();
    const c = await buildContractFor(name, fixture);
    const detailed = selectCardInsightsDetailed(c);
    sentinelRefusalsSeen += detailed.droppedSentinel.length;
    const turn = buildVerbalizerUserTurn({ contract: c, messageText: USER_MESSAGE });
    console.log(
      `  ${name}: cards=${detailed.cards.length} (refused ${detailed.droppedSentinel.length}) ` +
        `maxTokens=${maxTokensForInsights(detailed.cards.length)} userTurnBytes=${Buffer.byteLength(turn)}`,
    );
    check(
      `${name}: the card plan lists every SERVABLE insight header`,
      detailed.cards.every((i) => turn.includes(renderInsightHeader(i))),
    );
    check(
      `${name}: no REFUSED sentinel card leaks into the card plan`,
      detailed.droppedSentinel.every((i) => !turn.includes(renderInsightHeader(i))),
    );
    if (!biggest || detailed.cards.length > biggest.cards) {
      biggest = { name, contract: c, cards: detailed.cards.length };
    }
  }
  check("the fixture corpus exercises the sentinel guard at least once", sentinelRefusalsSeen > 0, {
    sentinelRefusalsSeen,
  });
  check("a multi-card game_review fixture exists (>3 cards)", (biggest?.cards ?? 0) > 3, biggest?.cards);
  if (!biggest) process.exit(1);

  // Enforced stream over the widest fixture with the deadline already spent:
  // every violating card must resolve deterministically, in order, instantly.
  const sys = getVerbalizerSystemPromptParts({ personalityId: "friendly", userRating: 1500 });
  const plan = selectCardInsights(biggest.contract);
  const emitted: string[] = [];
  const t0 = Date.now();
  const stream = createEnforcedContractStream({
    contract: biggest.contract,
    emit: (t) => emitted.push(t),
    correlationId: "ci5-dry",
    refereeMode: "deterministic",
    citationGranularity: "sentence",
    deadlineAtMs: Date.now() - 1,
    regenSystem: sys,
    armingTable: CI4_GATE_ARMING_TABLE,
  });
  let msg = "Right, let's walk your game [F:bogus].\n\n";
  for (const i of plan) {
    msg += `${renderInsightHeader(i)}\nThe eval crashed to -9.87 after this.\n[/INSIGHT]\n\n`;
  }
  for (let i = 0; i < msg.length; i += 19) stream.push(msg.slice(i, i + 19));
  const summary = await stream.end();
  const shipped = emitted.join("");
  const elapsedMs = Date.now() - t0;

  console.log(`\n=== CI-5 dry-run: ${biggest.name} (${plan.length} cards), deadline breached ===`);
  check("every planned card shipped", summary.cards.length === plan.length, {
    shipped: summary.cards.length,
    planned: plan.length,
  });
  check(
    "cards emitted in pedagogical order",
    summary.cards.map((c) => c.factIdPrefix).join(",") === plan.map((i) => i.factIdPrefix).join(","),
  );
  check(
    "a breached deadline resolves to template cards, never a timeout",
    summary.ladderDistribution.templated === plan.length,
    summary.ladderDistribution,
  );
  check("the fabricated eval never shipped", !shipped.includes("-9.87"));
  check("citations stripped", !shipped.includes("[F:"));
  check("the degraded path is fast (well inside maxDuration 60s)", elapsedMs < 20_000, elapsedMs);

  const entries: FidelityEntry[] = [];
  for (const block of parseInsightBlocks(summary.finalText)) {
    const insight = biggest.contract.insights.find(
      (i) => i.moveNumber === block.moveNumber && i.color === block.color,
    );
    if (insight) entries.push({ insight, prose: block.prose });
  }
  const report = aggregateFidelity(entries, biggest.contract);
  check("fidelity report has a claim-sentence denominator", report.claimSentences > 0, report);

  // The adjudicator wiring must work offline too.
  const pools = await buildFpPools(biggest.contract);
  check("adjudication pools built", pools.san.size > 0 && pools.squares.size > 0);
  check(
    "an unbacked eval span adjudicates needs-review (not silently 'false')",
    adjudicateFp({ category: "eval_unbacked", span: "-9.87" }, pools, {
      stripSanDecorations: (await import("@/lib/contract/refereeChecks")).stripSanDecorations,
      isPvWindow: () => false,
    }) === "needs-review",
  );

  console.log(`\n=== CI-5 dry-run result: ${failures === 0 ? "GREEN" : `${failures} FAILURE(S)`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

// ── Live gate run ───────────────────────────────────────────────────────────
interface SampleResult {
  fixture: string;
  sample: number;
  cardsPlanned: number;
  cardsShipped: number;
  sentinelCardsRefused: number;
  ladder: Record<LadderStage, number>;
  deadlineBreachedCards: number;
  errorsInitial: number;
  coverageSentence: number | null;
  coverageParagraph: number | null;
  claimSentencesForCoverage: { sentence: number; paragraph: number };
  citedClaimSentences: { sentence: number; paragraph: number };
  fabricationCount: number;
  fabricationClaimSentences: number;
  fabricationCategories: Record<string, number>;
  /** Armed-error fires the ladder acted on, and how many are provably false. */
  armedFires: number;
  falseFires: number;
  interventionByCheck: Record<string, number>;
  /** A review is "intervened" when at least one armed fire occurred. */
  intervened: boolean;
  personaScores: number[];
  personaMean: number | null;
  proseRetention: number | null;
  contractTtftMs: number;
  contractFirstCardMs: number | null;
  contractTotalMs: number;
  costUsd: number;
  shipped: string;
}

interface LegacyRef {
  fixture: string;
  ttftMs: number;
  firstCardMs: number | null;
  totalMs: number;
  personaScores: number[];
}

async function runLive(args: Args): Promise<void> {
  process.env.ANTHROPIC_API_KEY = loadApiKey();

  const { callLLM, callLLMStream } = await import("@/lib/llmProvider");
  const { getCoachChatSystemPromptParts, PROMPT_VERSION } = await import(
    "@/lib/prompts/coachChatPrompt"
  );
  const { selectExamples, formatExamplesForPrompt } = await import("@/data/goldStandardExamples");
  const { renderLegacyPrompt } = await import("@/lib/contract/serialize");
  const { aggregateFidelity } = await import("@/lib/contract/refereeChecks");
  const { stripSanDecorations, isPvWindow } = await import("@/lib/contract/refereeChecks");
  const { checkCitations, stripCitations, stripGrammarTokenLines } = await import(
    "@/lib/contract/citations"
  );
  const { createEnforcedContractStream } = await import("@/lib/contract/enforcedStream");
  const {
    buildVerbalizerUserTurn,
    getVerbalizerSystemPromptParts,
    maxTokensForInsights,
    selectCardInsightsDetailed,
    VERBALIZER_PROMPT_VERSION,
  } = await import("@/lib/prompts/verbalizerPrompt");

  const fixtures = loadFixtures(args.only);
  console.log(
    `\n=== CI-5 gate run (${CATEGORY}): ${fixtures.length} fixtures x ${args.samples} samples ` +
      `(arming = CI4_GATE_ARMING_TABLE) ===`,
  );

  const samples: SampleResult[] = [];
  const fires: InterventionFire[] = [];
  const legacyRefs: LegacyRef[] = [];
  let generatorModel = "unknown";
  let judgeModel = "unknown";

  const judgePersona = async (text: string): Promise<number[]> => {
    const scores: number[] = [];
    for (let pass = 0; pass < 2; pass++) {
      try {
        const judge = await callLLM({
          tier: "fast",
          system: PERSONA_JUDGE_SYSTEM,
          messages: [{ role: "user", content: text.slice(0, 12000) }],
          temperature: 0.7,
          maxTokens: 100,
        });
        judgeModel = judge.model;
        const score = parseJudgeScore(judge.content);
        if (score !== null) scores.push(score);
      } catch (err) {
        console.error(`  judge pass ${pass + 1} failed: ${(err as Error).message}`);
      }
    }
    return scores;
  };

  for (const { name, fixture } of fixtures) {
    const contract = await buildContractFor(name, fixture);
    const pools = await buildFpPools(contract);
    const promptInput = {
      personalityId: "friendly",
      userRating: fixture.userRating ?? 1500,
      username: fixture.username,
      playerColorName: (fixture.playerColor === "b" ? "black" : "white") as "black" | "white",
    };

    // ── LEGACY reference stream: the latency + persona baseline for THIS
    // fixture under the SAME game_review request. One sample is enough for a
    // p50 reference and keeps the billed run inside its authorisation.
    if (args.legacy) {
      const skillLevel = fixture.userRating
        ? fixture.userRating < 1000
          ? "beginner"
          : fixture.userRating < 1600
            ? "intermediate"
            : "advanced"
        : "intermediate";
      const legacyParts = getCoachChatSystemPromptParts(promptInput);
      const examplesContext = formatExamplesForPrompt(selectExamples(undefined, skillLevel, 3));
      const legacyUser = `## USER REQUEST:\n${USER_MESSAGE}\n\n${renderLegacyPrompt(contract)}${examplesContext}`;
      let legacyText = "";
      let ttftMs = -1;
      let firstCardMs: number | null = null;
      const tL = Date.now();
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
          if (ttftMs < 0) ttftMs = Date.now() - tL;
          if (firstCardMs === null && legacyText.includes("[/INSIGHT]")) {
            firstCardMs = Date.now() - tL;
          }
        }
      }
      legacyRefs.push({
        fixture: name,
        ttftMs,
        firstCardMs,
        totalMs: Date.now() - tL,
        personaScores: await judgePersona(legacyText),
      });
    }

    for (let s = 0; s < args.samples; s++) {
      const vParts = getVerbalizerSystemPromptParts(promptInput);
      const vUserTurn = buildVerbalizerUserTurn({ contract, messageText: USER_MESSAGE });
      const plan = selectCardInsightsDetailed(contract);
      const cardsPlanned = plan.cards.length;
      let rawText = "";
      let shippedText = "";
      let ttftMs = -1;
      let firstCardMs: number | null = null;
      const t0 = Date.now();
      const enforced = createEnforcedContractStream({
        contract,
        emit: (text) => {
          shippedText += text;
          if (ttftMs < 0 && text.trim().length > 0) ttftMs = Date.now() - t0;
          if (firstCardMs === null && shippedText.includes("[/INSIGHT]")) {
            firstCardMs = Date.now() - t0;
          }
        },
        correlationId: `ci5-gates-${name}-s${s}`,
        refereeMode: "full",
        citationGranularity: "sentence",
        // The REAL serving deadline: requestStart + 55s (maxDuration 60 − 5).
        deadlineAtMs: t0 + 55_000,
        regenSystem: vParts,
        armingTable: CI4_GATE_ARMING_TABLE,
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
        if (evt.type === "text") {
          rawText += evt.delta;
          enforced.push(evt.delta);
        } else {
          generatorModel = evt.result.model;
        }
      }
      const summary = await enforced.end();
      const totalMs = Date.now() - t0;

      // ── Citation coverage (both granularities) on the model's RAW body ───
      const cov = { sentence: { cited: 0, claims: 0 }, paragraph: { cited: 0, claims: 0 } };
      const perCard = { sentence: [] as number[], paragraph: [] as number[] };
      let rawChars = 0;
      let shippedChars = 0;
      const rawBlocks = parseInsightBlocks(rawText);
      const shippedBlocks = parseInsightBlocks(summary.finalText);
      let armedFires = 0;
      let falseFires = 0;
      const interventionByCheck: Record<string, number> = {};

      for (const card of summary.cards) {
        const insight = contract.insights.find((i) => i.factIdPrefix === card.factIdPrefix);
        if (!insight) continue;
        const rawBlock = rawBlocks.find(
          (b) => b.moveNumber === insight.moveNumber && b.color === insight.color,
        );
        if (!rawBlock) continue;
        for (const g of ["sentence", "paragraph"] as const) {
          const r = checkCitations(rawBlock.body, insight, g);
          cov[g].cited += r.citedClaimSentences;
          cov[g].claims += r.claimSentences;
          perCard[g].push(r.coverage);
        }
        const shippedBlock = shippedBlocks.find(
          (b) => b.moveNumber === insight.moveNumber && b.color === insight.color,
        );
        rawChars += stripGrammarTokenLines(stripCitations(rawBlock.body)).replace(/\s+/g, " ").trim()
          .length;
        if (shippedBlock) {
          shippedChars += stripGrammarTokenLines(shippedBlock.body).replace(/\s+/g, " ").trim()
            .length;
        }

        // ── The CI-5 measurement: every armed fire, adjudicated ───────────
        const errors = await interventionsForCard(rawBlock.body, insight, contract, pools);
        for (const f of errors) {
          const adjudication = adjudicateFp(f, pools, { stripSanDecorations, isPvWindow });
          const isFalse = adjudication !== "needs-review";
          armedFires++;
          if (isFalse) falseFires++;
          interventionByCheck[f.check] = (interventionByCheck[f.check] ?? 0) + 1;
          fires.push({
            fixture: name,
            sample: s,
            factIdPrefix: insight.factIdPrefix,
            check: f.check,
            category: f.category,
            span: f.span,
            adjudication,
            isFalse,
          });
        }
      }

      // ── Shipped fabrication (BEFORE-comparable machinery, this contract) ─
      const entries: FidelityEntry[] = [];
      for (const block of shippedBlocks) {
        const insight = contract.insights.find(
          (i: InsightContract) => i.moveNumber === block.moveNumber && i.color === block.color,
        );
        if (insight) entries.push({ insight, prose: block.prose });
      }
      const report = aggregateFidelity(entries, contract);
      const fabricationCategories: Record<string, number> = {};
      for (const [k, v] of Object.entries(report.violationsByCategory)) {
        if (v > 0) fabricationCategories[k] = v;
      }

      const personaScores = await judgePersona(summary.finalText);
      samples.push({
        fixture: name,
        sample: s,
        cardsPlanned,
        cardsShipped: summary.cards.length,
        sentinelCardsRefused: summary.sentinelCardsRefused,
        ladder: summary.ladderDistribution,
        deadlineBreachedCards: summary.cards.filter((c) => c.deadlineBreached).length,
        errorsInitial: summary.errorsInitialTotal,
        coverageSentence: round(mean(perCard.sentence)),
        coverageParagraph: round(mean(perCard.paragraph)),
        claimSentencesForCoverage: { sentence: cov.sentence.claims, paragraph: cov.paragraph.claims },
        citedClaimSentences: { sentence: cov.sentence.cited, paragraph: cov.paragraph.cited },
        fabricationCount: report.fabricationCount,
        fabricationClaimSentences: report.claimSentences,
        fabricationCategories,
        armedFires,
        falseFires,
        interventionByCheck,
        intervened: armedFires > 0,
        personaScores,
        personaMean: round(mean(personaScores), 2),
        proseRetention: rawChars > 0 ? round(shippedChars / rawChars) : null,
        contractTtftMs: ttftMs,
        contractFirstCardMs: firstCardMs,
        contractTotalMs: totalMs,
        costUsd: Number(summary.costUsd.toFixed(4)),
        shipped: summary.finalText,
      });
      const r = samples[samples.length - 1];
      console.log(
        `  ${name} s${s}: cards=${r.cardsShipped}/${r.cardsPlanned} ` +
          `ladder=${JSON.stringify(r.ladder)} cite=${r.coverageSentence}/${r.coverageParagraph} ` +
          `fab=${r.fabricationCount}/${r.fabricationClaimSentences} fires=${r.armedFires}(false ${r.falseFires}) ` +
          `persona=${r.personaMean} retention=${r.proseRetention} ` +
          `ttft=${r.contractTtftMs}ms card1=${r.contractFirstCardMs}ms total=${r.contractTotalMs}ms`,
      );
    }
  }

  // ── Per-run and pooled aggregation ────────────────────────────────────────
  const legacyByFixture = new Map(legacyRefs.map((l) => [l.fixture, l]));
  const runIndexes = Array.from(new Set(samples.map((s) => s.sample))).sort((a, b) => a - b);
  const summarise = (rows: SampleResult[]) => {
    const fabCount = rows.reduce((a, r) => a + r.fabricationCount, 0);
    const fabClaims = rows.reduce((a, r) => a + r.fabricationClaimSentences, 0);
    const covS = rows.map((r) => r.coverageSentence).filter((x): x is number => x !== null);
    const covP = rows.map((r) => r.coverageParagraph).filter((x): x is number => x !== null);
    const personas = rows.map((r) => r.personaMean).filter((x): x is number => x !== null);
    const ladder: Record<string, number> = {};
    const fabCats: Record<string, number> = {};
    const byCheck: Record<string, number> = {};
    for (const r of rows) {
      for (const [k, v] of Object.entries(r.ladder)) ladder[k] = (ladder[k] ?? 0) + v;
      for (const [k, v] of Object.entries(r.fabricationCategories)) fabCats[k] = (fabCats[k] ?? 0) + v;
      for (const [k, v] of Object.entries(r.interventionByCheck)) byCheck[k] = (byCheck[k] ?? 0) + v;
    }
    const armedFires = rows.reduce((a, r) => a + r.armedFires, 0);
    const falseFires = rows.reduce((a, r) => a + r.falseFires, 0);
    const firstCardDeltas = rows
      .map((r) => {
        const l = legacyByFixture.get(r.fixture);
        return l?.firstCardMs !== null && l?.firstCardMs !== undefined && r.contractFirstCardMs !== null
          ? r.contractFirstCardMs - l.firstCardMs
          : null;
      })
      .filter((x): x is number => x !== null);
    const ttftDeltas = rows
      .map((r) => {
        const l = legacyByFixture.get(r.fixture);
        return l ? r.contractTtftMs - l.ttftMs : null;
      })
      .filter((x): x is number => x !== null);
    const totalDeltas = rows
      .map((r) => {
        const l = legacyByFixture.get(r.fixture);
        return l ? r.contractTotalMs - l.totalMs : null;
      })
      .filter((x): x is number => x !== null);
    return {
      games: rows.length,
      personaMean: round(mean(personas), 2),
      personaMin: personas.length ? Math.min(...personas) : null,
      citationCoverageSentence: round(mean(covS)),
      citationCoverageParagraph: round(mean(covP)),
      citationCoveragePooledSentence: round(
        rows.reduce((a, r) => a + r.citedClaimSentences.sentence, 0) /
          Math.max(1, rows.reduce((a, r) => a + r.claimSentencesForCoverage.sentence, 0)),
      ),
      fabricationRate: fabClaims > 0 ? Number(((fabCount / fabClaims) * 100).toFixed(2)) : 0,
      fabricationCount: fabCount,
      claimSentences: fabClaims,
      fabricationCategories: fabCats,
      // ── The CI-5 gate + its context ──
      armedFires,
      falseFires,
      falseInterventionRate: armedFires > 0 ? Number((falseFires / armedFires).toFixed(4)) : 0,
      /** Reviews touched by ≥1 armed fire — reported, NOT a pass/fail bar. */
      interventionRate: Number(
        (rows.filter((r) => r.intervened).length / Math.max(1, rows.length)).toFixed(4),
      ),
      /** Share of claim sentences the referee touched. */
      claimSentencesTouchedShare: fabClaims > 0 ? Number((armedFires / fabClaims).toFixed(4)) : 0,
      interventionByCheck: byCheck,
      ladderDistribution: ladder,
      deadlineBreachedCards: rows.reduce((a, r) => a + r.deadlineBreachedCards, 0),
      sentinelCardsRefused: rows.reduce((a, r) => a + r.sentinelCardsRefused, 0),
      cardsPlanned: rows.reduce((a, r) => a + r.cardsPlanned, 0),
      cardsShipped: rows.reduce((a, r) => a + r.cardsShipped, 0),
      maxCardsInAReview: rows.length ? Math.max(...rows.map((r) => r.cardsPlanned)) : 0,
      proseRetentionMean: round(
        mean(rows.map((r) => r.proseRetention).filter((x): x is number => x !== null)),
      ),
      latency: {
        contractTtftP50Ms: p50(rows.map((r) => r.contractTtftMs)),
        contractFirstCardP50Ms: p50(
          rows.map((r) => r.contractFirstCardMs).filter((x): x is number => x !== null),
        ),
        contractTotalP50Ms: p50(rows.map((r) => r.contractTotalMs)),
        contractTotalP95Ms: p95(rows.map((r) => r.contractTotalMs)),
        ttftDeltaP50Ms: p50(ttftDeltas),
        firstCardDeltaP50Ms: p50(firstCardDeltas),
        totalDeltaP50Ms: p50(totalDeltas),
        totalDeltaP95Ms: p95(totalDeltas),
      },
      costUsd: Number(rows.reduce((a, r) => a + r.costUsd, 0).toFixed(4)),
    };
  };

  const perRun = runIndexes.map((i) => ({
    run: i,
    ...summarise(samples.filter((s) => s.sample === i)),
  }));
  const pooled = summarise(samples);

  console.log(`\n=== per-run ===`);
  for (const r of perRun) {
    console.log(
      `  run ${r.run}: persona=${r.personaMean} (min game ${r.personaMin}) ` +
        `cite=${r.citationCoverageSentence} (para ${r.citationCoverageParagraph}) ` +
        `fab=${r.fabricationRate}/100 falseIntervention=${r.falseInterventionRate} ` +
        `(${r.falseFires}/${r.armedFires}) intervention=${r.interventionRate} ` +
        `retention=${r.proseRetentionMean}`,
    );
  }
  console.log(`\n=== pooled ===`);
  console.log(JSON.stringify(pooled, null, 2));

  const legacyPersonaMean = round(
    mean(legacyRefs.map((l) => mean(l.personaScores)).filter((x): x is number => x !== null)),
    2,
  );
  const legacy = {
    personaMean: legacyPersonaMean,
    ttftP50Ms: p50(legacyRefs.map((l) => l.ttftMs)),
    firstCardP50Ms: p50(legacyRefs.map((l) => l.firstCardMs).filter((x): x is number => x !== null)),
    totalP50Ms: p50(legacyRefs.map((l) => l.totalMs)),
    totalP95Ms: p95(legacyRefs.map((l) => l.totalMs)),
  };
  if (legacyRefs.length > 0) {
    console.log(`\nlegacy (PROMPT_VERSION ${PROMPT_VERSION}) same-day reference:`);
    console.log(JSON.stringify(legacy, null, 2));
  }

  console.log(`\n=== CI-5 gates (${CATEGORY}) ===`);
  check(
    `persona pooled ≥ ${GATE_PERSONA_POOLED}`,
    pooled.personaMean !== null && pooled.personaMean >= GATE_PERSONA_POOLED,
    pooled.personaMean,
  );
  check(
    `persona ≥ ${GATE_PERSONA_PER_RUN} on EVERY run`,
    perRun.every((r) => r.personaMean !== null && r.personaMean >= GATE_PERSONA_PER_RUN),
    perRun.map((r) => r.personaMean),
  );
  check(
    `citation coverage (sentence) ≥ ${GATE_CITATION} pooled`,
    pooled.citationCoverageSentence !== null && pooled.citationCoverageSentence >= GATE_CITATION,
    pooled.citationCoverageSentence,
  );
  check(
    `citation coverage (sentence) ≥ ${GATE_CITATION} on EVERY run`,
    perRun.every(
      (r) => r.citationCoverageSentence !== null && r.citationCoverageSentence >= GATE_CITATION,
    ),
    perRun.map((r) => r.citationCoverageSentence),
  );
  check(
    `fabrication ≤ ${GATE_FABRICATION}/100 pooled`,
    pooled.fabricationRate <= GATE_FABRICATION,
    pooled.fabricationRate,
  );
  check(
    `fabrication ≤ ${GATE_FABRICATION}/100 on EVERY run`,
    perRun.every((r) => r.fabricationRate <= GATE_FABRICATION),
    perRun.map((r) => r.fabricationRate),
  );
  check(
    `FALSE-intervention rate < ${GATE_FALSE_INTERVENTION} pooled (the CI-5 gate)`,
    pooled.falseInterventionRate < GATE_FALSE_INTERVENTION,
    { rate: pooled.falseInterventionRate, false: pooled.falseFires, armed: pooled.armedFires },
  );
  check(
    `FALSE-intervention rate < ${GATE_FALSE_INTERVENTION} on EVERY run`,
    perRun.every((r) => r.falseInterventionRate < GATE_FALSE_INTERVENTION),
    perRun.map((r) => r.falseInterventionRate),
  );
  check(
    "every planned card shipped (no silent drops)",
    pooled.cardsShipped === pooled.cardsPlanned,
    { shipped: pooled.cardsShipped, planned: pooled.cardsPlanned },
  );

  const payload = {
    date: new Date().toISOString().slice(0, 10),
    mode: "ci5_gate_run_multisample",
    category: CATEGORY,
    model: { generator: generatorModel, judge: judgeModel },
    verbalizerPromptVersion: VERBALIZER_PROMPT_VERSION,
    legacyPromptVersion: PROMPT_VERSION,
    fixtures: fixtures.length,
    samplesPerFixture: args.samples,
    userMessage: USER_MESSAGE,
    refereeMode: "full",
    armingTable: CI4_GATE_ARMING_TABLE,
    gateThresholds: {
      personaPooled: GATE_PERSONA_POOLED,
      personaPerRun: GATE_PERSONA_PER_RUN,
      citationCoverage: GATE_CITATION,
      fabricationPer100: GATE_FABRICATION,
      falseInterventionRate: GATE_FALSE_INTERVENTION,
    },
    legacy,
    perRun,
    pooled,
    gates: {
      personaPooled: pooled.personaMean !== null && pooled.personaMean >= GATE_PERSONA_POOLED,
      personaEveryRun: perRun.every(
        (r) => r.personaMean !== null && r.personaMean >= GATE_PERSONA_PER_RUN,
      ),
      citationPooled:
        pooled.citationCoverageSentence !== null &&
        pooled.citationCoverageSentence >= GATE_CITATION,
      citationEveryRun: perRun.every(
        (r) => r.citationCoverageSentence !== null && r.citationCoverageSentence >= GATE_CITATION,
      ),
      fabricationPooled: pooled.fabricationRate <= GATE_FABRICATION,
      fabricationEveryRun: perRun.every((r) => r.fabricationRate <= GATE_FABRICATION),
      falseInterventionPooled: pooled.falseInterventionRate < GATE_FALSE_INTERVENTION,
      falseInterventionEveryRun: perRun.every(
        (r) => r.falseInterventionRate < GATE_FALSE_INTERVENTION,
      ),
      everyPlannedCardShipped: pooled.cardsShipped === pooled.cardsPlanned,
    },
    fires,
    samples,
    legacyRefs,
  };

  const outPath = args.output ?? path.join(RESULTS_DIR, `contract-ci5-gates-${payload.date}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
  console.log(`\nwritten: ${outPath}`);
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
