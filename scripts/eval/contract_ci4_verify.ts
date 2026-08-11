/**
 * Contract CI-4 INDEPENDENT VERIFICATION — re-measures the PR #241 AFTER
 * claims with fresh generations (never the builder's cached outputs) and
 * adds the two measurements the builder's artifact cannot answer:
 *
 *  1. FOOTPRINT 2x2 — fabrication of {legacy output, pre-ladder verbalizer
 *     output, shipped post-ladder output} under BOTH footprints:
 *       - "original": aggregateFidelity over the full block (header +
 *         widget-markup lines refereed and counted), the PR-CI-2 BEFORE rule;
 *       - "stripped": stripGrammarTokenLines applied first — the serving
 *         referee's post-d126f6c footprint (widget lines + headers exempt).
 *     The committed BEFORE (24.6/100) is an original-footprint number; the
 *     committed AFTER (0.78/100) is also measured by unstripped
 *     aggregateFidelity — this run proves/disproves comparability on the
 *     same generations instead of arguing from code reading.
 *
 *  2. CONTENT RETENTION (deletion ≠ accuracy) — per shipped card vs the
 *     model's PRE-ladder body:
 *       - sentence retention (prose sentences surviving verbatim),
 *       - key-engine-fact coverage (played/best SAN, eval displays, motif
 *         keywords: mentioned in raw vs still mentioned in shipped),
 *       - prose length ratio.
 *     A low shipped-fabrication number earned by CORRECTNESS keeps fact
 *     coverage ~flat; one earned by DELETION loses facts with the sentences.
 *
 * Modes:
 *   --dry-run   zero-network smoke of the measurement helpers (CI-safe).
 *   (live)      ANTHROPIC_API_KEY required; per fixture one legacy stream,
 *               one enforced verbalizer-4.0 stream (raw deltas captured
 *               before the ladder sees them), 2 Haiku persona passes.
 *
 * Run from the repo root:
 *   npx tsx scripts/eval/contract_ci4_verify.ts --dry-run
 *   npx tsx scripts/eval/contract_ci4_verify.ts [--only 09] [--output p.json]
 */
import * as fs from "node:fs";
import * as path from "node:path";

import type { CoachContract, InsightContract } from "@/lib/contract/types";
import type { FidelityEntry, FidelityReport } from "@/lib/contract/refereeChecks";
import type { GameEvalInput, GameHeadersInput } from "@/lib/contract/gameEvalSchema";
import type { LadderStage } from "@/lib/contract/ladder";
import { CI5_CANDIDATE_ARMING_TABLE } from "./ci4GateTable";

const REPO_ROOT = process.cwd();
const FIXTURES_DIR = path.join(REPO_ROOT, "src/lib/contract/__tests__/fixtures");
const RESULTS_DIR = path.join(REPO_ROOT, "scripts/eval/results");

/** Same request the builder's AFTER run used (comparability). */
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
    uid: `ci4-verify-${name}`,
    identity: { fen: requestFen, playerColor: f.playerColor || "w" },
  });
}

// ── Block parsing (same shape as the builder's scripts) ─────────────────────
interface ParsedBlock {
  moveNumber: number;
  color: string;
  /** Full block: header + body + close token. */
  prose: string;
  /** Body only (between header line and [/INSIGHT]). */
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

// ── Footprint measurement ───────────────────────────────────────────────────
type Footprint = "original" | "stripped";

interface FabricationCell {
  fabricationRate: number;
  fabricationCount: number;
  claimSentences: number;
  violationsByCategory: Record<string, number>;
}

interface MeasureDeps {
  aggregateFidelity: (entries: FidelityEntry[], contract: CoachContract) => FidelityReport;
  stripGrammarTokenLines: (text: string) => string;
  stripCitations: (text: string) => string;
}

/**
 * BEFORE-comparable fabrication measurement over one review text.
 * `original` referees the full matched block (header + widget lines — the
 * PR-CI-2 BEFORE rule); `stripped` applies stripGrammarTokenLines first (the
 * post-d126f6c serving-referee footprint; note the [INSIGHT:...] header line
 * itself matches the grammar-token pattern and is excluded too).
 * Citations are stripped in both footprints (the BEFORE text had none).
 */
function measureFabrication(
  text: string,
  contract: CoachContract,
  footprint: Footprint,
  deps: MeasureDeps,
): FabricationCell {
  const entries: FidelityEntry[] = [];
  for (const block of parseInsightBlocks(text)) {
    const insight = contract.insights.find(
      (i) => i.moveNumber === block.moveNumber && i.color === block.color,
    );
    if (!insight) continue;
    let prose = deps.stripCitations(block.prose);
    if (footprint === "stripped") prose = deps.stripGrammarTokenLines(prose);
    entries.push({ insight, prose });
  }
  const report = deps.aggregateFidelity(entries, contract);
  const violationsByCategory: Record<string, number> = {};
  for (const [cat, n] of Object.entries(report.violationsByCategory)) {
    if (n > 0) violationsByCategory[cat] = n;
  }
  return {
    fabricationRate: Number(report.fabricationRate.toFixed(2)),
    fabricationCount: report.fabricationCount,
    claimSentences: report.claimSentences,
    violationsByCategory,
  };
}

// ── Content retention (deletion ≠ accuracy) ─────────────────────────────────
function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function proseSentences(body: string, deps: MeasureDeps): string[] {
  return deps
    .stripGrammarTokenLines(deps.stripCitations(body))
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

interface KeyFact {
  id: string;
  needle: string;
  kind: "san" | "eval" | "keyword";
}

const MOTIF_KEYWORD: Record<string, string> = {
  fork: "fork",
  pin: "pin",
  skewer: "skewer",
  discovered_attack: "discovered",
  removed_defender: "defender",
  hanging_piece: "hang",
  trapped_piece: "trap",
  back_rank_mate: "back rank",
  back_rank_threat: "back rank",
};

function stripSanDecor(san: string): string {
  return san.replace(/[+#!?]+$/g, "");
}

/** The contract facts a good card should surface: what happened (playedSan),
 * what was right (bestSan), how bad (eval displays), and any verified motif. */
function insightKeyFacts(insight: InsightContract): KeyFact[] {
  const facts: KeyFact[] = [];
  facts.push({ id: "playedSan", needle: stripSanDecor(insight.playedSan), kind: "san" });
  if (insight.bestSan && stripSanDecor(insight.bestSan) !== stripSanDecor(insight.playedSan)) {
    facts.push({ id: "bestSan", needle: stripSanDecor(insight.bestSan), kind: "san" });
  }
  for (const [key, f] of [
    ["evalBefore", insight.evalBefore],
    ["evalAfter", insight.evalAfter],
  ] as const) {
    if (!f.sentinel && f.display && f.display !== "engine data unavailable") {
      facts.push({ id: key, needle: f.display, kind: "eval" });
    }
  }
  insight.motifs.forEach((m, i) => {
    const kw = MOTIF_KEYWORD[m.motif];
    if (kw) facts.push({ id: `motif${i}:${m.motif}`, needle: kw, kind: "keyword" });
  });
  return facts;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

function factMentioned(text: string, fact: KeyFact): boolean {
  if (fact.kind === "san") {
    return new RegExp(`(^|[^A-Za-z0-9])${escapeRe(fact.needle)}([+#]|\\b)`).test(text);
  }
  if (fact.kind === "eval") return text.includes(fact.needle);
  return text.toLowerCase().includes(fact.needle);
}

interface CardRetention {
  factIdPrefix: string;
  stage: LadderStage;
  rawSentences: number;
  keptSentences: number;
  sentenceRetention: number | null;
  factsTotal: number;
  factsInRaw: number;
  factsInShipped: number;
  factsLost: string[];
  rawProseChars: number;
  shippedProseChars: number;
  lengthRatio: number | null;
}

function cardRetention(
  factIdPrefix: string,
  stage: LadderStage,
  insight: InsightContract,
  rawBody: string,
  shippedBody: string,
  deps: MeasureDeps,
): CardRetention {
  const rawSents = proseSentences(rawBody, deps);
  const shippedProse = deps.stripGrammarTokenLines(shippedBody);
  const shippedNorm = normalizeWs(shippedProse);
  const kept = rawSents.filter((s) => shippedNorm.includes(normalizeWs(s)));
  const facts = insightKeyFacts(insight);
  const rawStripped = deps.stripCitations(rawBody);
  const inRaw = facts.filter((f) => factMentioned(rawStripped, f));
  const inShipped = inRaw.filter((f) => factMentioned(shippedBody, f));
  const rawChars = normalizeWs(deps.stripGrammarTokenLines(rawStripped)).length;
  const shippedChars = normalizeWs(shippedProse).length;
  return {
    factIdPrefix,
    stage,
    rawSentences: rawSents.length,
    keptSentences: kept.length,
    sentenceRetention: rawSents.length > 0 ? Number((kept.length / rawSents.length).toFixed(3)) : null,
    factsTotal: facts.length,
    factsInRaw: inRaw.length,
    factsInShipped: inShipped.length,
    factsLost: inRaw.filter((f) => !factMentioned(shippedBody, f)).map((f) => f.id),
    rawProseChars: rawChars,
    shippedProseChars: shippedChars,
    lengthRatio: rawChars > 0 ? Number((shippedChars / rawChars).toFixed(3)) : null,
  };
}

// ── Persona judge (identical rubric to the builder's runs) ──────────────────
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

function mean(xs: number[]): number | null {
  return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.error(`  FAIL  ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`);
  }
}

// ── Dry-run smoke: the measurement helpers themselves ───────────────────────
async function runDryRun(): Promise<void> {
  delete process.env.LC0_API_URL;
  delete process.env.MAIA_API_URL;
  const chessdb = await import("@/lib/grounding/chessdb");
  chessdb.__setFetchForTesting(async () => {
    throw new Error("network disabled in contract_ci4_verify --dry-run");
  });
  const { aggregateFidelity } = await import("@/lib/contract/refereeChecks");
  const { stripGrammarTokenLines, stripCitations } = await import("@/lib/contract/citations");
  const deps: MeasureDeps = { aggregateFidelity, stripGrammarTokenLines, stripCitations };

  const fixtures = loadFixtures("09");
  const contract = await buildContractFor(fixtures[0].name, fixtures[0].fixture);
  const bxd1 = contract.insights.find((i) => i.playedSan === "Bxd1");
  check("09 Bxd1 insight exists", !!bxd1);
  if (!bxd1) process.exit(1);

  const header = `[INSIGHT:${bxd1.moveNumber}:${bxd1.color}:blunder:+2.00:M+2:Bxd1:dxe5]`;
  // Distinct keyword from the prose one: motifGrounding fires once per
  // keyword TYPE, so a widget line only adds violations for keywords/SAN not
  // already present in the prose.
  const widgetLine = "[CONCEPT:fork:practice this pattern]";
  const badSentence = "Your rook on a5 cuts the defense, a classic skewer.";
  const text = `${header}\n${badSentence}\n${widgetLine}\n[/INSIGHT]`;

  const original = measureFabrication(text, contract, "original", deps);
  const stripped = measureFabrication(text, contract, "stripped", deps);
  // STALE ASSERTION REPAIRED 2026-08-11 (CI-4 gate recovery). This used to
  // require original.fabricationCount > stripped.fabricationCount — i.e. that
  // a [CONCEPT:fork:...] widget line ADDS a violation when it is refereed.
  // The referee round-2 work licensed concept-widget keyword text (it is a
  // practice-button label, not a claim), so the widget line no longer fires
  // in EITHER footprint and the counts are equal. That is the intended
  // behaviour, not a regression: what still separates the two footprints is
  // the DENOMINATOR (widget lines counted as claim sentences), which the next
  // check pins. Verified pre-existing on main @010818b before this branch.
  check(
    "original footprint never UNDER-counts violations vs stripped",
    original.fabricationCount >= stripped.fabricationCount,
    { original, stripped },
  );
  check(
    "stripped footprint still catches the prose fabrication",
    stripped.fabricationCount >= 2, // a5 square_unknown + skewer keyword
    stripped,
  );
  check(
    "stripped footprint shrinks the claim-sentence denominator",
    stripped.claimSentences < original.claimSentences,
    { original: original.claimSentences, stripped: stripped.claimSentences },
  );

  // Retention smoke: drop the violating sentence, keep a clean one.
  const clean = "Grabbing the queen with Bxd1 walks into a forced mate in 2.";
  const raw = `${clean} ${badSentence}\n${widgetLine}`;
  const shipped = `${clean}\n${widgetLine}`;
  const ret = cardRetention("M1", "sentence_drop", bxd1, raw, shipped, deps);
  check("retention: 1 of 2 raw sentences kept", ret.rawSentences === 2 && ret.keptSentences === 1, ret);
  check("retention: playedSan fact survives", !ret.factsLost.includes("playedSan"), ret);
  check("retention: length ratio < 1", ret.lengthRatio !== null && ret.lengthRatio < 1, ret);

  console.log(`\n=== dry-run result: ${failures === 0 ? "GREEN" : `${failures} FAILURE(S)`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

// ── Live independent verification ───────────────────────────────────────────
async function runLive(args: Args): Promise<void> {
  process.env.ANTHROPIC_API_KEY = loadApiKey();

  const { callLLM, callLLMStream } = await import("@/lib/llmProvider");
  const { getCoachChatSystemPromptParts, PROMPT_VERSION } = await import("@/lib/prompts/coachChatPrompt");
  const { selectExamples, formatExamplesForPrompt } = await import("@/data/goldStandardExamples");
  const { renderLegacyPrompt } = await import("@/lib/contract/serialize");
  const { aggregateFidelity } = await import("@/lib/contract/refereeChecks");
  const { stripGrammarTokenLines, stripCitations } = await import("@/lib/contract/citations");
  const { createEnforcedContractStream } = await import("@/lib/contract/enforcedStream");
  const {
    buildVerbalizerUserTurn,
    getVerbalizerSystemPromptParts,
    maxTokensForInsights,
    selectCardInsights,
    VERBALIZER_PROMPT_VERSION,
  } = await import("@/lib/prompts/verbalizerPrompt");
  const deps: MeasureDeps = { aggregateFidelity, stripGrammarTokenLines, stripCitations };

  const fixtures = loadFixtures(args.only);
  console.log(`\n=== CI-4 independent verify (live) over ${fixtures.length} fixtures ===`);

  interface PerGame {
    fixture: string;
    contractId: string;
    cardsPlanned: number;
    cardsShipped: number;
    ladder: Record<LadderStage, number>;
    errorsInitial: number;
    fabrication: {
      legacy: Record<Footprint, FabricationCell>;
      rawPreLadder: Record<Footprint, FabricationCell>;
      shipped: Record<Footprint, FabricationCell>;
    };
    retention: CardRetention[];
    personaScores: number[];
    personaMean: number | null;
    legacyTtftMs: number;
    legacyFirstCardMs: number | null;
    contractTtftMs: number;
    contractFirstCardMs: number | null;
    costUsd: number;
    /** Full texts committed for auditability (the builder's artifact omitted
     * them, which is what made the footprint question unanswerable). */
    texts: { legacy: string; rawPreLadder: string; shipped: string };
  }
  const perGame: PerGame[] = [];
  let generatorModel = "unknown";
  let judgeModel = "unknown";

  for (const { name, fixture } of fixtures) {
    const contract = await buildContractFor(name, fixture);
    const promptInput = {
      personalityId: "friendly",
      userRating: fixture.userRating ?? 1500,
      username: fixture.username,
      playerColorName: (fixture.playerColor === "b" ? "black" : "white") as "black" | "white",
    };
    const skillLevel = fixture.userRating
      ? fixture.userRating < 1000
        ? "beginner"
        : fixture.userRating < 1600
          ? "intermediate"
          : "advanced"
      : "intermediate";

    // ── LEGACY stream (fresh BEFORE-comparable generation) ─────────────────
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

    // ── CONTRACT enforced stream, raw deltas captured pre-ladder ───────────
    const vParts = getVerbalizerSystemPromptParts(promptInput);
    const vUserTurn = buildVerbalizerUserTurn({ contract, messageText: USER_MESSAGE });
    const cardsPlanned = selectCardInsights(contract).length;
    let rawText = "";
    let shippedText = "";
    let contractTtftMs = -1;
    let contractFirstCardMs: number | null = null;
    const tContract = Date.now();
    const enforced = createEnforcedContractStream({
      contract,
      emit: (text) => {
        shippedText += text;
        if (contractTtftMs < 0 && text.trim().length > 0) contractTtftMs = Date.now() - tContract;
        if (contractFirstCardMs === null && shippedText.includes("[/INSIGHT]")) {
          contractFirstCardMs = Date.now() - tContract;
        }
      },
      correlationId: `ci4-verify-${name}`,
      refereeMode: "full",
      citationGranularity: "sentence",
      deadlineAtMs: tContract + 55_000,
      regenSystem: vParts,
      // See contract_ci4_eval.ts: DEFAULT_ARMING_TABLE is all-warn on main, so
      // an unarmed verify run would compare raw model prose against itself.
      armingTable: CI5_CANDIDATE_ARMING_TABLE,
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

    // ── Footprint 2x2 on this game's three texts ───────────────────────────
    const fab = (text: string) => ({
      original: measureFabrication(text, contract, "original", deps),
      stripped: measureFabrication(text, contract, "stripped", deps),
    });
    const fabrication = {
      legacy: fab(legacyText),
      rawPreLadder: fab(rawText),
      shipped: fab(summary.finalText),
    };

    // ── Retention per shipped card ─────────────────────────────────────────
    const rawBlocks = parseInsightBlocks(rawText);
    const shippedBlocks = parseInsightBlocks(summary.finalText);
    const retention: CardRetention[] = [];
    for (const card of summary.cards) {
      const insight = contract.insights.find((i) => i.factIdPrefix === card.factIdPrefix);
      if (!insight) continue;
      const rawBlock = rawBlocks.find(
        (b) => b.moveNumber === insight.moveNumber && b.color === insight.color,
      );
      const shippedBlock = shippedBlocks.find(
        (b) => b.moveNumber === insight.moveNumber && b.color === insight.color,
      );
      if (!rawBlock || !shippedBlock) continue;
      retention.push(
        cardRetention(card.factIdPrefix, card.stage, insight, rawBlock.body, shippedBlock.body, deps),
      );
    }

    // ── Persona judge (2 passes, non-generator tier) ───────────────────────
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

    perGame.push({
      fixture: name,
      contractId: contract.contractId,
      cardsPlanned,
      cardsShipped: summary.cards.length,
      ladder: summary.ladderDistribution,
      errorsInitial: summary.errorsInitialTotal,
      fabrication,
      retention,
      personaScores,
      personaMean: mean(personaScores),
      legacyTtftMs,
      legacyFirstCardMs,
      contractTtftMs,
      contractFirstCardMs,
      costUsd: Number(summary.costUsd.toFixed(4)),
      texts: { legacy: legacyText, rawPreLadder: rawText, shipped: summary.finalText },
    });
    const g = perGame[perGame.length - 1];
    console.log(
      `  ${name}: ladder=${JSON.stringify(g.ladder)} ` +
        `legacyFab=${g.fabrication.legacy.original.fabricationRate}/${g.fabrication.legacy.stripped.fabricationRate} ` +
        `rawFab=${g.fabrication.rawPreLadder.original.fabricationRate}/${g.fabrication.rawPreLadder.stripped.fabricationRate} ` +
        `shippedFab=${g.fabrication.shipped.original.fabricationRate}/${g.fabrication.shipped.stripped.fabricationRate} ` +
        `(orig/stripped) persona=${g.personaMean ?? "n/a"} firstCardΔ=${
          g.contractFirstCardMs !== null && g.legacyFirstCardMs !== null
            ? g.contractFirstCardMs - g.legacyFirstCardMs
            : "n/a"
        }ms`,
    );
  }

  // ── Aggregates ─────────────────────────────────────────────────────────────
  const sumCell = (
    pick: (g: PerGame) => FabricationCell,
  ): FabricationCell => {
    const cells = perGame.map(pick);
    const fabricationCount = cells.reduce((a, c) => a + c.fabricationCount, 0);
    const claimSentences = cells.reduce((a, c) => a + c.claimSentences, 0);
    const violationsByCategory: Record<string, number> = {};
    for (const c of cells) {
      for (const [cat, n] of Object.entries(c.violationsByCategory)) {
        violationsByCategory[cat] = (violationsByCategory[cat] ?? 0) + n;
      }
    }
    return {
      fabricationRate:
        claimSentences > 0 ? Number(((fabricationCount / claimSentences) * 100).toFixed(2)) : 0,
      fabricationCount,
      claimSentences,
      violationsByCategory,
    };
  };
  const footprint2x2 = {
    legacy: {
      original: sumCell((g) => g.fabrication.legacy.original),
      stripped: sumCell((g) => g.fabrication.legacy.stripped),
    },
    rawPreLadder: {
      original: sumCell((g) => g.fabrication.rawPreLadder.original),
      stripped: sumCell((g) => g.fabrication.rawPreLadder.stripped),
    },
    shipped: {
      original: sumCell((g) => g.fabrication.shipped.original),
      stripped: sumCell((g) => g.fabrication.shipped.stripped),
    },
  };

  const ladder: Record<LadderStage, number> = {
    pass: 0,
    sentence_drop: 0,
    edited: 0,
    regenerated: 0,
    templated: 0,
    passthrough_footnoted: 0,
  };
  for (const g of perGame) for (const k of Object.keys(ladder) as LadderStage[]) ladder[k] += g.ladder[k];

  const allRetention = perGame.flatMap((g) => g.retention);
  const sentRet = allRetention
    .map((r) => r.sentenceRetention)
    .filter((x): x is number => x !== null);
  const factsInRaw = allRetention.reduce((a, r) => a + r.factsInRaw, 0);
  const factsInShipped = allRetention.reduce((a, r) => a + r.factsInShipped, 0);
  const lenRatios = allRetention.map((r) => r.lengthRatio).filter((x): x is number => x !== null);
  const retentionAggregate = {
    cards: allRetention.length,
    sentenceRetentionMean: sentRet.length > 0 ? Number(mean(sentRet)!.toFixed(3)) : null,
    factsInRaw,
    factsInShipped,
    factCoverageRetention: factsInRaw > 0 ? Number((factsInShipped / factsInRaw).toFixed(3)) : null,
    lengthRatioMean: lenRatios.length > 0 ? Number(mean(lenRatios)!.toFixed(3)) : null,
    byStage: Object.fromEntries(
      (["pass", "sentence_drop", "edited", "regenerated", "templated"] as LadderStage[]).map(
        (stage) => {
          const rs = allRetention.filter((r) => r.stage === stage);
          const sr = rs.map((r) => r.sentenceRetention).filter((x): x is number => x !== null);
          const fr = rs.reduce((a, r) => a + r.factsInRaw, 0);
          const fsh = rs.reduce((a, r) => a + r.factsInShipped, 0);
          return [
            stage,
            {
              cards: rs.length,
              sentenceRetentionMean: sr.length > 0 ? Number(mean(sr)!.toFixed(3)) : null,
              factCoverageRetention: fr > 0 ? Number((fsh / fr).toFixed(3)) : null,
            },
          ];
        },
      ),
    ),
  };

  const personaMeans = perGame.map((g) => g.personaMean).filter((x): x is number => x !== null);
  const firstCardDeltas = perGame
    .filter((g) => g.contractFirstCardMs !== null && g.legacyFirstCardMs !== null)
    .map((g) => g.contractFirstCardMs! - g.legacyFirstCardMs!);

  const aggregate = {
    footprint2x2,
    ladderDistribution: ladder,
    errorsInitialTotal: perGame.reduce((a, g) => a + g.errorsInitial, 0),
    personaMean: personaMeans.length > 0 ? Number(mean(personaMeans)!.toFixed(2)) : null,
    retention: retentionAggregate,
    ttft: {
      legacyTtftP50Ms: p50(perGame.map((g) => g.legacyTtftMs)),
      contractTtftP50Ms: p50(perGame.map((g) => g.contractTtftMs)),
      legacyFirstCardP50Ms: p50(
        perGame.map((g) => g.legacyFirstCardMs).filter((x): x is number => x !== null),
      ),
      contractFirstCardP50Ms: p50(
        perGame.map((g) => g.contractFirstCardMs).filter((x): x is number => x !== null),
      ),
      firstCardDeltaP50Ms: p50(firstCardDeltas),
    },
    totalLadderCostUsd: Number(perGame.reduce((a, g) => a + g.costUsd, 0).toFixed(4)),
  };

  const payload = {
    date: new Date().toISOString().slice(0, 10),
    mode: "ci4_independent_verify",
    model: { generator: generatorModel, judge: judgeModel },
    verbalizerPromptVersion: VERBALIZER_PROMPT_VERSION,
    legacyPromptVersion: PROMPT_VERSION,
    fixtures: perGame.length,
    userMessage: USER_MESSAGE,
    refereeMode: "full",
    builderClaimsUnderTest: {
      shippedFabricationPer100: 0.78,
      beforeFabricationPer100: 24.6,
      personaPooled: 3.55,
      ladder: { pass: 5, sentence_drop: 17, edited: 1, regenerated: 0, templated: 2 },
      greetingTtftDeltaMs: 55,
    },
    aggregate,
    perGame,
  };

  const outPath =
    args.output ?? path.join(RESULTS_DIR, `contract-ci4-verify-${payload.date}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
  console.log(`\n=== verify aggregate ===`);
  console.log(JSON.stringify({ ...aggregate, retention: retentionAggregate }, null, 2));
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
