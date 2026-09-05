/**
 * CI-4 GATE RUN — multi-sample, honest.
 *
 * The 2026-08-10 miss was not just a numbers miss, it was a MEASUREMENT
 * failure: the builder's "persona 3.55" was pooled post-hoc across runs and
 * fell to 3.45-3.5 on every single-run re-measurement. This harness exists so
 * the verdict cannot be cherry-picked:
 *
 *  - N independent generations per fixture (default 3). A "run" is the r-th
 *    sample of every fixture — a complete, self-contained measurement.
 *  - Every gate is reported PER RUN and POOLED. A gate passes only if the
 *    pooled figure clears the bar AND no individual run collapses.
 *  - Citation coverage is reported at BOTH granularities from the SAME
 *    generations (granularity affects only the reported coverage — never a
 *    referee finding, never enforcement — so the comparison is free and
 *    apples-to-apples).
 *  - Fabrication is measured on the SHIPPED prose with the same
 *    aggregateFidelity machinery as the PR-CI-2 BEFORE baseline, per contract
 *    (runInsightChecks consults the contract-global eval-display licence
 *    pool, so entries from different games must not be pooled into one call).
 *
 * ARMING: the gate run measures the REAL serving table. It passes
 * CI4_GATE_ARMING_TABLE (scripts/eval/ci4GateTable.ts), which is
 * `DEFAULT_ARMING_TABLE` plus a declared, enumerated override set — currently
 * empty, so the gate verdict describes exactly the posture a
 * CONTRACT_CATEGORIES flip would apply. An explicit table must still be passed
 * (the enforced stream defaults to no arming, which would make every card
 * `pass` and the fabrication gate vacuous); what it must never be is a
 * hand-copied mirror of the serving severities.
 *
 * Run from the repo root:
 *   npx tsx scripts/eval/contract_ci4_gates.ts --dry-run
 *   npx tsx scripts/eval/contract_ci4_gates.ts [--samples 3] [--only 01,07,09]
 *                                              [--fixtures-real] [--label arm-name]
 *                                              [--legacy] [--output p.json]
 */
import * as fs from "node:fs";
import * as path from "node:path";

import type { CoachContract, InsightContract } from "@/lib/contract/types";
import type { FidelityEntry } from "@/lib/contract/refereeChecks";
import type { GameEvalInput, GameHeadersInput } from "@/lib/contract/gameEvalSchema";
import type { LadderStage } from "@/lib/contract/ladder";
import { CI4_GATE_ARMING_TABLE } from "./ci4GateTable";

const REPO_ROOT = process.cwd();
const FIXTURES_DIR = path.join(REPO_ROOT, "src/lib/contract/__tests__/fixtures");
/** Same games, every reachable position re-evaluated by real Stockfish (depth 16, MultiPV 3). */
const FIXTURES_REAL_DIR = path.join(REPO_ROOT, "src/lib/contract/__tests__/fixtures-real");
const RESULTS_DIR = path.join(REPO_ROOT, "scripts/eval/results");

/** Same request text the BEFORE/AFTER/verify runs used (comparability). */
const USER_MESSAGE = "analyze this position and where my play went wrong";

const GATE_PERSONA_POOLED = 3.55;
const GATE_PERSONA_PER_RUN = 3.5;
const GATE_CITATION = 0.8;
const GATE_FABRICATION = 1;

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
  /** Real-Stockfish fixtures (fixtures-real/) instead of the hand-authored evals. */
  fixturesReal: boolean;
  /** Free-text arm name stamped into the result (e.g. "story-4.1", "baseline-4.0"). */
  label: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, only: null, output: null, samples: 3, legacy: false, fixturesReal: false, label: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--legacy") args.legacy = true;
    else if (argv[i] === "--only") args.only = argv[++i] ?? null;
    else if (argv[i] === "--output") args.output = argv[++i] ?? null;
    else if (argv[i] === "--fixtures-real") args.fixturesReal = true;
    else if (argv[i] === "--label") args.label = argv[++i] ?? null;
    else if (argv[i] === "--samples") args.samples = Number.parseInt(argv[++i] ?? "3", 10);
    else {
      console.error(`unknown arg: ${argv[i]}`);
      process.exit(2);
    }
  }
  return args;
}

function loadFixtures(only: string | null, real = false): Array<{ name: string; fixture: FixtureFile }> {
  const dir = real ? FIXTURES_REAL_DIR : FIXTURES_DIR;
  // --only takes a comma-separated list of name fragments ("01,07,09").
  const wanted = only ? only.split(",").map((x) => x.trim()).filter(Boolean) : [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .filter((n) => (wanted.length ? wanted.some((w) => n.includes(w)) : true))
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
    uid: `ci4-gates-${name}`,
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

// ── Persona judge — byte-identical rubric to the CI-4 eval + verify runs ────
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

let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.error(`  FAIL  ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`);
  }
}

// ── Dry-run: zero-network smoke of the scoring/aggregation helpers ──────────
async function runDryRun(): Promise<void> {
  delete process.env.LC0_API_URL;
  delete process.env.MAIA_API_URL;
  const chessdb = await import("@/lib/grounding/chessdb");
  chessdb.__setFetchForTesting(async () => {
    throw new Error("network disabled in contract_ci4_gates --dry-run");
  });
  const { checkCitations } = await import("@/lib/contract/citations");
  const { runInsightLadder } = await import("@/lib/contract/ladder");
  const { aggregateFidelity } = await import("@/lib/contract/refereeChecks");

  const fixtures = loadFixtures("09");
  const contract = await buildContractFor(fixtures[0].name, fixtures[0].fixture);
  const insight = contract.insights.find((i) => i.playedSan === "Bxd1");
  check("09 Bxd1 insight exists", !!insight);
  if (!insight) process.exit(1);

  check("judge parser reads a score", parseJudgeScore('{"score": 4}') === 4);
  check("judge parser rejects junk", parseJudgeScore("nope") === null);

  // Granularity is measurement-only: it must change coverage but NEVER a finding.
  const body = [
    "You wanted the queen, and that is human.",
    "The capture walks into a forced mate [F:" + insight.factIdPrefix + "].",
    "The king has nowhere to go once the rook lands.",
  ].join("\n");
  const sentence = checkCitations(body, insight, "sentence");
  const paragraph = checkCitations(body, insight, "paragraph");
  check(
    "paragraph granularity is never stricter than sentence",
    paragraph.coverage >= sentence.coverage,
    { sentence: sentence.coverage, paragraph: paragraph.coverage },
  );
  check(
    "granularity does not change findings (enforcement is granularity-blind)",
    sentence.findings.length === paragraph.findings.length,
  );

  // Ladder still runs deterministically with the gate's arming table.
  const res = await runInsightLadder(
    body,
    {
      insight,
      contract,
      refereeOpts: { correlationId: "ci4-gates-dry", userRating: 1500 },
      refereeMode: "deterministic",
      citationGranularity: "sentence",
      deadlineAtMs: Date.now() - 1,
      budgets: { editsRemaining: 0, regensRemaining: 0, relationalRemaining: 0 },
      regenSystem: { stable: "", perUser: "" },
    },
    CI4_GATE_ARMING_TABLE,
  );
  check("ladder returns a card with the server header", res.finalText.startsWith("[INSIGHT:"));
  check("ladder strips citations from shipped text", !res.finalText.includes("[F:"));

  const report = aggregateFidelity([{ insight, prose: res.finalText } as FidelityEntry], contract);
  check("fidelity report has a claim-sentence denominator", report.claimSentences > 0, report);

  console.log(`\n=== dry-run result: ${failures === 0 ? "GREEN" : `${failures} FAILURE(S)`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

// ── Live gate run ───────────────────────────────────────────────────────────
interface SampleResult {
  fixture: string;
  sample: number;
  cardsPlanned: number;
  cardsShipped: number;
  ladder: Record<LadderStage, number>;
  errorsInitial: number;
  /** Coverage of the model's PRE-ladder body, per granularity, mean over cards. */
  coverageSentence: number | null;
  coverageParagraph: number | null;
  claimSentencesForCoverage: { sentence: number; paragraph: number };
  citedClaimSentences: { sentence: number; paragraph: number };
  fabricationCount: number;
  fabricationClaimSentences: number;
  fabricationCategories: Record<string, number>;
  personaScores: number[];
  personaMean: number | null;
  proseRetention: number | null;
  costUsd: number;
  /** Fact ids the model cited, per the enforced stream (shipped text has citations stripped). */
  citedFactIds: string[];
  shipped: string;
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
  const { checkCitations, stripCitations, stripGrammarTokenLines } = await import(
    "@/lib/contract/citations"
  );
  const { createEnforcedContractStream } = await import("@/lib/contract/enforcedStream");
  const {
    buildVerbalizerUserTurn,
    getVerbalizerSystemPromptParts,
    maxTokensForInsights,
    selectCardInsights,
    VERBALIZER_PROMPT_VERSION,
  } = await import("@/lib/prompts/verbalizerPrompt");

  const fixtures = loadFixtures(args.only, args.fixturesReal);
  console.log(
    `\n=== CI-4 gate run: ${fixtures.length} fixtures x ${args.samples} samples ` +
      `(arming = CI4_GATE_ARMING_TABLE) ===`,
  );

  const samples: SampleResult[] = [];
  const legacyPersona: Array<{ fixture: string; scores: number[] }> = [];
  let generatorModel = "unknown";
  let judgeModel = "unknown";
  // USAGE-PRICED spend. summary.costUsd from the enforced stream covers only
  // the ladder's regenerations; the generation itself and the persona judge
  // were unpriced, which is how a run that cost ~$1 reported $0.20. Every
  // LLMResult carries its token counts — price them all against llmPricing.
  const { estimateCostUSD } = await import("@/lib/llmPricing");
  const priced = (r: { model: string; inputTokens: number; outputTokens: number; cacheCreationTokens?: number; cacheReadTokens?: number }) =>
    estimateCostUSD({ model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheCreationTokens: r.cacheCreationTokens, cacheReadTokens: r.cacheReadTokens }) ?? 0;
  const spend = { generationUsd: 0, judgeUsd: 0, ladderUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };

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
        spend.judgeUsd += priced(judge);
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
    const promptInput = {
      personalityId: "friendly",
      userRating: fixture.userRating ?? 1500,
      username: fixture.username,
      playerColorName: (fixture.playerColor === "b" ? "black" : "white") as "black" | "white",
    };

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
      for await (const evt of callLLMStream({
        tier: "flagship",
        system: legacyParts.stable,
        systemSuffix: legacyParts.perUser,
        cacheSystem: true,
        messages: [{ role: "user", content: legacyUser }],
        temperature: 0.7,
        maxTokens: 3000,
      })) {
        if (evt.type === "text") legacyText += evt.delta;
      }
      legacyPersona.push({ fixture: name, scores: await judgePersona(legacyText) });
    }

    for (let s = 0; s < args.samples; s++) {
      const vParts = getVerbalizerSystemPromptParts(promptInput);
      const vUserTurn = buildVerbalizerUserTurn({ contract, messageText: USER_MESSAGE });
      const cardsPlanned = selectCardInsights(contract).length;
      let rawText = "";
      let shippedText = "";
      let sampleGenerationUsd = 0;
      const t0 = Date.now();
      const enforced = createEnforcedContractStream({
        contract,
        emit: (text) => {
          shippedText += text;
        },
        correlationId: `ci4-gates-${name}-s${s}`,
        refereeMode: "full",
        citationGranularity: "sentence",
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
          sampleGenerationUsd = priced(evt.result);
          spend.generationUsd += sampleGenerationUsd;
          spend.inputTokens += evt.result.inputTokens;
          spend.outputTokens += evt.result.outputTokens;
          spend.cacheReadTokens += evt.result.cacheReadTokens ?? 0;
          spend.cacheCreationTokens += evt.result.cacheCreationTokens ?? 0;
        }
      }
      const summary = await enforced.end();
      spend.ladderUsd += summary.costUsd;

      // ── Citation coverage, both granularities, on the model's RAW body ────
      const cov = { sentence: { cited: 0, claims: 0 }, paragraph: { cited: 0, claims: 0 } };
      const perCard = { sentence: [] as number[], paragraph: [] as number[] };
      let rawChars = 0;
      let shippedChars = 0;
      const rawBlocks = parseInsightBlocks(rawText);
      const shippedBlocks = parseInsightBlocks(summary.finalText);
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
      }

      // ── Shipped fabrication (BEFORE-comparable machinery, this contract) ──
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
        ladder: summary.ladderDistribution,
        errorsInitial: summary.errorsInitialTotal,
        coverageSentence: round(mean(perCard.sentence)),
        coverageParagraph: round(mean(perCard.paragraph)),
        claimSentencesForCoverage: { sentence: cov.sentence.claims, paragraph: cov.paragraph.claims },
        citedClaimSentences: { sentence: cov.sentence.cited, paragraph: cov.paragraph.cited },
        fabricationCount: report.fabricationCount,
        fabricationClaimSentences: report.claimSentences,
        fabricationCategories,
        personaScores,
        personaMean: round(mean(personaScores), 2),
        proseRetention: rawChars > 0 ? round(shippedChars / rawChars) : null,
        costUsd: Number((summary.costUsd + sampleGenerationUsd).toFixed(4)),
        // Which facts the model actually leaned on (the shipped text has its
        // citations stripped, so this is the only record of them).
        citedFactIds: Array.from(new Set(summary.cards.flatMap((c) => c.citedFactIds))).sort(),
        shipped: summary.finalText,
      });
      const r = samples[samples.length - 1];
      console.log(
        `  ${name} s${s}: cards=${r.cardsShipped}/${r.cardsPlanned} ` +
          `ladder=${JSON.stringify(r.ladder)} cite=${r.coverageSentence}/${r.coverageParagraph} ` +
          `fab=${r.fabricationCount}/${r.fabricationClaimSentences} persona=${r.personaMean} ` +
          `retention=${r.proseRetention}`,
      );
    }
  }

  // ── Per-run and pooled aggregation ────────────────────────────────────────
  const runIndexes = Array.from(new Set(samples.map((s) => s.sample))).sort((a, b) => a - b);
  const summarise = (rows: SampleResult[]) => {
    const fabCount = rows.reduce((a, r) => a + r.fabricationCount, 0);
    const fabClaims = rows.reduce((a, r) => a + r.fabricationClaimSentences, 0);
    const covS = rows.map((r) => r.coverageSentence).filter((x): x is number => x !== null);
    const covP = rows.map((r) => r.coverageParagraph).filter((x): x is number => x !== null);
    const personas = rows.map((r) => r.personaMean).filter((x): x is number => x !== null);
    const ladder: Record<string, number> = {};
    const fabCats: Record<string, number> = {};
    for (const r of rows) {
      for (const [k, v] of Object.entries(r.ladder)) ladder[k] = (ladder[k] ?? 0) + v;
      for (const [k, v] of Object.entries(r.fabricationCategories)) {
        fabCats[k] = (fabCats[k] ?? 0) + v;
      }
    }
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
      ladderDistribution: ladder,
      proseRetentionMean: round(
        mean(rows.map((r) => r.proseRetention).filter((x): x is number => x !== null)),
      ),
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
        `fab=${r.fabricationRate}/100 retention=${r.proseRetentionMean}`,
    );
  }
  console.log(`\n=== pooled ===`);
  console.log(JSON.stringify(pooled, null, 2));

  const legacyPersonaMean = args.legacy
    ? round(
        mean(
          legacyPersona
            .map((l) => mean(l.scores))
            .filter((x): x is number => x !== null),
        ),
        2,
      )
    : null;
  if (legacyPersonaMean !== null) {
    console.log(`\nlegacy (PROMPT_VERSION ${PROMPT_VERSION}) persona, same day: ${legacyPersonaMean}`);
  }

  console.log(`\n=== CI-4 gates ===`);
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

  const payload = {
    date: new Date().toISOString().slice(0, 10),
    mode: "ci4_gate_run_multisample",
    label: args.label,
    fixturesSource: args.fixturesReal ? "fixtures-real (real Stockfish depth 16 / MultiPV 3)" : "fixtures (hand-authored evals)",
    model: { generator: generatorModel, judge: judgeModel },
    spend: {
      ...spend,
      totalUsd: Number((spend.generationUsd + spend.judgeUsd + spend.ladderUsd).toFixed(4)),
      note: "usage-priced against llmPricing (generation + persona judge + ladder regenerations)",
    },
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
    },
    legacyPersonaMean,
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
    },
    samples,
    legacyPersona,
  };

  console.log(
    `\nSPEND (usage-priced): generation $${spend.generationUsd.toFixed(3)} + judge $${spend.judgeUsd.toFixed(3)} + ladder $${spend.ladderUsd.toFixed(3)} = $${(spend.generationUsd + spend.judgeUsd + spend.ladderUsd).toFixed(3)}` +
      `  (in ${spend.inputTokens} / out ${spend.outputTokens} / cache-read ${spend.cacheReadTokens} / cache-write ${spend.cacheCreationTokens} tokens)`,
  );
  const outPath =
    args.output ?? path.join(RESULTS_DIR, `contract-ci4-gates-${payload.date}.json`);
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
