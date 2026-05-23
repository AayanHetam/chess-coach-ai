#!/usr/bin/env node
/**
 * Synthetic tester for Chess Masti AI — Phase 1 entry point.
 *
 * Plan: SYNTHETIC_TESTER_PLAN.md (repo root). Per-row CSV append,
 * one /api/enhanced-analysis per game, many /api/chat per game.
 */
import { readFileSync, readdirSync, statSync, mkdirSync, existsSync } from "fs";
import { join, basename, resolve } from "path";
import { execSync } from "child_process";
import { createHash, randomUUID } from "crypto";
import { config as loadDotenv } from "dotenv";
import { Chess } from "chess.js";

import { mintSessionCookie, makeRunUid } from "./auth";
import { StockfishEngine } from "./stockfish";
import { evaluateGame, pickCheckpoints } from "./checkpoints";
import { CostTracker } from "./costTracker";
import {
  analyzeGame,
  chatFollowUp,
  generatePersonaQuestion,
  buildGameEval,
  analyzeCategoryTurn,
} from "./client";
import { CsvWriter, writeMeta, type Row, type RunMeta } from "./output";
import { validateAIResponse } from "../../src/lib/aiResponseValidator";
import {
  pickGenerator,
  mulberry32,
  makeMockLlmCall,
  type LlmCall,
  type GeneratorContextBase,
  type GeneratorFixtures,
  type GeneratorResult,
} from "./generators";
import {
  loadAllFixtures,
  loadPersonaSystemPrompts,
} from "./generators/loaders";
import type { QuestionCategory } from "../../src/lib/mastermind/categorization/categoryClassifier";

const SCRIPT_DIR = resolve(__dirname);
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");

// ── CLI ────────────────────────────────────────────────────────────────────
interface Args {
  games: number;
  questions: number;
  personas: string[];
  baseUrl: string;
  concurrency: number;
  dryRun: boolean;
  maxCost: number;
  seed: number;
  personality: string;
  minPlies: number;
  gamesFile?: string;
  stockfishDepth: number;
  personaTemperature: number;
  // Stage C category-dispatch flags. When forceCategory or categoryMix
  // is set, the run uses pickGenerator() instead of the legacy
  // game × checkpoint × persona loop. See CATEGORY_GENERATOR_DESIGN.md.
  forceCategory?: string;
  categoryMix?: string;
  mockLlm: boolean;
  samples?: number;
}

function parseArgs(argv: string[]): Args {
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        // --key=value form
        const key = a.slice(2, eq);
        const val = a.slice(eq + 1);
        opts[key] = val;
      } else {
        // --key value form (boolean if next token is also --flag)
        const key = a.slice(2);
        const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
        opts[key] = val;
      }
    }
  }
  const seed = opts.seed ? parseInt(opts.seed, 10) : (Date.now() >>> 0);
  return {
    games: opts.games ? parseInt(opts.games, 10) : 3,
    questions: opts.questions ? parseInt(opts.questions, 10) : 2,
    personas:
      !opts.personas || opts.personas === "all"
        ? ALL_PERSONAS
        : opts.personas.split(",").map((s) => s.trim()),
    baseUrl: opts["base-url"] || "http://127.0.0.1:3000",
    concurrency: opts.concurrency ? parseInt(opts.concurrency, 10) : 1,
    dryRun: opts["dry-run"] === "true",
    maxCost: opts["max-cost"] ? parseFloat(opts["max-cost"]) : 5.0,
    seed,
    personality: opts.personality || "friendly",
    minPlies: opts["min-plies"] !== undefined ? parseInt(opts["min-plies"], 10) : 30,
    gamesFile: opts["games-file"],
    stockfishDepth: opts["sf-depth"] ? parseInt(opts["sf-depth"], 10) : 14,
    personaTemperature: opts["persona-temp"] ? parseFloat(opts["persona-temp"]) : 0.3,
    forceCategory: opts["force-category"],
    categoryMix: opts["category-mix"],
    mockLlm: opts["mock-llm"] === "true",
    samples: opts.samples ? parseInt(opts.samples, 10) : undefined,
  };
}

// Stage C category-balanced default per CATEGORY_GENERATOR_DESIGN.md §11
// (O7-ratified): 60 turns total across the six categories.
const BALANCED_DEFAULT_COUNTS: Record<QuestionCategory, number> = {
  game_review: 12,
  opponent_prep: 12,
  position_analysis: 12,
  improvement_strategy: 12,
  meta_motivational: 12,
  concept_explanation: 8,
};

const CATEGORY_ORDER: QuestionCategory[] = [
  "game_review",
  "opponent_prep",
  "position_analysis",
  "improvement_strategy",
  "meta_motivational",
  "concept_explanation",
];

const ALL_PERSONAS = [
  "confused_beginner",
  "tilted_intermediate",
  "curious_advanced",
  "trick_questioner",
  "hinglish_learner",
];

// ── persona loader ─────────────────────────────────────────────────────────
interface PersonaSpec {
  name: string;
  version: number;
  date_calibrated: string;
  source: string;
  systemPrompt: string;
  fileHash: string;
  filePath: string;
}

function loadPersona(name: string): PersonaSpec {
  const path = join(SCRIPT_DIR, "personas", `${name}.md`);
  const raw = readFileSync(path, "utf8");
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) throw new Error(`persona ${name}: missing frontmatter`);
  const fm: Record<string, string> = {};
  for (const line of fmMatch[1].split("\n")) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/);
    if (m) fm[m[1]] = m[2];
  }
  const body = fmMatch[2];
  const sysMatch = body.match(/# System prompt\n([\s\S]*?)(?:\n# |$)/);
  const systemPrompt = (sysMatch?.[1] || body).trim();
  return {
    name,
    version: parseInt(fm.version || "1", 10),
    date_calibrated: fm.date_calibrated || "",
    source: fm.source || "scaffold",
    systemPrompt,
    fileHash: createHash("sha256").update(raw).digest("hex").slice(0, 16),
    filePath: path,
  };
}

// ── games loader ───────────────────────────────────────────────────────────
interface LoadedGame {
  id: number;
  filename: string;
  pgn: string;
  white: string;
  black: string;
  plies: number;
}

function loadGames(args: Args): LoadedGame[] {
  let pgns: { filename: string; pgn: string }[];
  if (args.gamesFile) {
    const text = readFileSync(args.gamesFile, "utf8");
    pgns = text
      .split(/(?=^\[Event )/m)
      .map((c) => c.trim())
      .filter(Boolean)
      .map((pgn, i) => ({ filename: `${basename(args.gamesFile!)}#${i + 1}`, pgn }));
  } else {
    const dir = join(SCRIPT_DIR, "games");
    pgns = readdirSync(dir)
      .filter((f) => f.endsWith(".pgn"))
      .sort()
      .map((f) => ({ filename: f, pgn: readFileSync(join(dir, f), "utf8") }));
  }

  const out: LoadedGame[] = [];
  for (const { filename, pgn } of pgns) {
    const g = new Chess();
    let ok = false;
    try {
      g.loadPgn(pgn, { strict: false });
      ok = true;
    } catch {
      ok = false;
    }
    if (!ok) continue;
    const plies = g.history().length;
    if (plies < args.minPlies) continue;
    const headers = g.header();
    out.push({
      id: out.length,
      filename,
      pgn,
      white: headers.White || "?",
      black: headers.Black || "?",
      plies,
    });
    if (out.length >= args.games) break;
  }
  return out;
}

// ── prompt builder for student persona ─────────────────────────────────────
function buildPersonaContext(args: {
  game: LoadedGame;
  persona: string;
  ply: number;
  fenAfter: string;
  lastMove: string;
  recentSan: string;
  classification: string;
  initialAnalysis: string;
}): string {
  const moveNumber = Math.ceil(args.ply / 2);
  const sideThatMoved = args.ply % 2 === 1 ? "White" : "Black";
  return [
    `Game: ${args.game.white} vs ${args.game.black}`,
    `Move number: ${moveNumber} (${sideThatMoved} just played ${args.lastMove})`,
    `FEN after move: ${args.fenAfter}`,
    `Recent moves: ${args.recentSan}`,
    `Engine classification: ${args.classification}`,
    "",
    "The chess coach has already given you this analysis of the game:",
    args.initialAnalysis.slice(0, 1200),
    "",
    "Reply with ONE question/comment about the position above move " +
      moveNumber +
      ", in your persona's voice. Reply with ONLY the message text.",
  ].join("\n");
}

function recentSan(history: string[], upToPly: number, n = 8): string {
  const start = Math.max(0, upToPly - n);
  const parts: string[] = [];
  for (let i = start; i < upToPly; i++) {
    if (i % 2 === 0) parts.push(`${Math.floor(i / 2) + 1}.${history[i]}`);
    else parts.push(history[i]);
  }
  return parts.join(" ");
}

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Load env
  const envPath = join(REPO_ROOT, ".env.local");
  loadDotenv({ path: envPath, quiet: true });

  // Production guard
  if (args.baseUrl.includes("chessmasti.com")) {
    console.error("ABORT: refusing to run against chessmasti.com (production guard).");
    process.exit(2);
  }

  const sessionSecret = process.env.SESSION_SECRET || "";
  const anthropicKey = process.env.ANTHROPIC_API_KEY || "";
  // In mock-LLM mode no POST happens and no Anthropic call fires, so neither
  // secret is required. Outside mock-LLM mode the guards still abort fast.
  if (!args.mockLlm) {
    if (!sessionSecret) {
      console.error("ABORT: SESSION_SECRET not set in .env.local");
      process.exit(2);
    }
    if (!anthropicKey) {
      console.error("ABORT: ANTHROPIC_API_KEY not set in .env.local");
      process.exit(2);
    }
  }

  const runId = `r${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
  const runUid = makeRunUid(runId);
  const cookie = args.mockLlm
    ? "mock-cookie"
    : await mintSessionCookie(sessionSecret, {
        uid: runUid,
        email: "synthtest@chessmasti.local",
      });

  let appGitSha = "unknown";
  try {
    appGitSha = execSync("git rev-parse HEAD", { cwd: REPO_ROOT }).toString().trim();
  } catch { /* not a git repo or no git */ }

  // Load personas
  const personas: PersonaSpec[] = args.personas.map(loadPersona);
  console.log(`Loaded ${personas.length} personas: ${personas.map((p) => p.name).join(", ")}`);

  // Load games
  const games = loadGames(args);
  console.log(`Loaded ${games.length} games (min plies ${args.minPlies}).`);
  if (games.length === 0) {
    console.error("ABORT: no games matched filters.");
    process.exit(2);
  }

  // Output paths
  const runsDir = join(SCRIPT_DIR, "runs");
  if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true });
  const csvPath = join(runsDir, `${runId}.csv`);
  const csv = new CsvWriter(csvPath);
  console.log(`Writing rows to ${csvPath}`);

  const meta: RunMeta = {
    run_id: runId,
    started_at: new Date().toISOString(),
    seed: args.seed,
    app_git_sha: appGitSha,
    base_url: args.baseUrl,
    cli_args: process.argv.slice(2),
    options: {
      games: args.games,
      questions: args.questions,
      personas: personas.map((p) => p.name),
      concurrency: args.concurrency,
      max_cost_usd: args.maxCost,
      personality_id: args.personality,
      min_plies: args.minPlies,
      stockfish_depth: args.stockfishDepth,
      persona_temperature: args.personaTemperature,
    },
    persona_files: Object.fromEntries(
      personas.map((p) => [
        p.name,
        {
          path: p.filePath.replace(REPO_ROOT + "/", ""),
          sha256: p.fileHash,
          version: p.version,
          date_calibrated: p.date_calibrated,
          source: p.source,
        },
      ])
    ),
  };
  writeMeta(runsDir, meta);

  if (args.dryRun) {
    console.log("DRY RUN — exiting without API calls. Meta written to", `${runId}.meta.json`);
    csv.close();
    return;
  }

  // Stage C category-dispatch branch. When --force-category or
  // --category-mix is set, the run skips the legacy game × checkpoint
  // × persona loop and uses pickGenerator() per turn instead. The
  // legacy flow continues to work when neither flag is set.
  if (args.forceCategory || args.categoryMix) {
    await runCategoryDispatchFlow({
      args,
      games,
      personas,
      runId,
      csv,
      meta,
      runsDir,
      cookie,
      anthropicKey,
      appGitSha,
    });
    return;
  }

  const cost = new CostTracker(args.maxCost);
  const startedAt = Date.now();
  let abortedReason: string | undefined;

  // Stockfish (one engine, reused across games)
  const sf = new StockfishEngine();
  await sf.init();

  try {
    GAME_LOOP: for (const game of games) {
      console.log(`\n[game ${game.id + 1}/${games.length}] ${game.white} vs ${game.black} (${game.plies} plies)`);
      const t0 = Date.now();
      const { states, chessjsHistory } = await evaluateGame(game.pgn, sf, args.stockfishDepth);
      console.log(`  stockfish: ${states.length} plies evaluated in ${Date.now() - t0}ms`);

      const checkpoints = pickCheckpoints(states, args.questions, args.seed + game.id);
      console.log(`  checkpoints: ${checkpoints.map((c) => `${c.ply}(${c.kind})`).join(", ")}`);

      const finalFen = states[states.length - 1].fenAfter;
      const playerColor: "w" | "b" = "w";
      const gameEval = buildGameEval(states, args.stockfishDepth);

      // ─── ONE enhanced-analysis per game ───
      console.log(`  → /api/enhanced-analysis ...`);
      const analyzeRes = await analyzeGame({
        baseUrl: args.baseUrl,
        cookie,
        moveHistory: chessjsHistory,
        fen: finalFen,
        gameEval,
        playerColor,
        userRating: 1500,
        personalityId: args.personality,
      });

      if (!analyzeRes.ok || !analyzeRes.contextId) {
        console.warn(`  ✗ analysis failed: ${analyzeRes.status} ${analyzeRes.errorMessage}`);
        for (const cp of checkpoints) {
          for (const persona of personas) {
            csv.appendRow(buildErrorRow({
              meta, csv, args, game, persona, cp,
              chessjsHistory, http_status: analyzeRes.status,
              errorMessage: `analysis_failed: ${analyzeRes.errorMessage || "?"}`,
              analysisLatencyMs: analyzeRes.latencyMs,
            }));
          }
        }
        continue GAME_LOOP;
      }
      const contextId = analyzeRes.contextId;
      const initialAnalysis = analyzeRes.initialAnalysis || "";
      console.log(`  ✓ contextId=${contextId} (${analyzeRes.latencyMs}ms)`);

      let firstRowOfGame = true;

      // ─── many /api/chat per game ───
      for (const cp of checkpoints) {
        for (const persona of personas) {
          if (cost.totalSpent() >= args.maxCost) {
            abortedReason = `cost cap $${args.maxCost} hit at $${cost.totalSpent().toFixed(4)}`;
            console.warn(`ABORT: ${abortedReason}`);
            break GAME_LOOP;
          }

          const lastMove = cp.state.sanMove;
          const recent = recentSan(chessjsHistory, cp.ply);
          const personaContext = buildPersonaContext({
            game, persona: persona.name, ply: cp.ply,
            fenAfter: cp.state.fenAfter, lastMove,
            recentSan: recent,
            classification: cp.classification,
            initialAnalysis,
          });

          const personaRes = await generatePersonaQuestion({
            apiKey: anthropicKey,
            systemPrompt: persona.systemPrompt,
            contextBlock: personaContext,
            temperature: args.personaTemperature,
            costTracker: cost,
          });

          if (!personaRes.ok) {
            csv.appendRow(buildErrorRow({
              meta, csv, args, game, persona, cp,
              chessjsHistory, http_status: 0,
              errorMessage: `persona_gen_failed: ${personaRes.errorMessage}`,
              analysisLatencyMs: firstRowOfGame ? analyzeRes.latencyMs : "",
              contextId,
            }));
            firstRowOfGame = false;
            continue;
          }

          const chatRes = await chatFollowUp({
            baseUrl: args.baseUrl,
            cookie,
            contextId,
            userMessage: personaRes.text,
            conversationHistory: [{ role: "assistant", content: initialAnalysis }],
          });

          let validatorScore: number | "" = "";
          let validatorIssueCount: number | "" = "";
          let validatorIssuesJson = "";
          if (chatRes.ok && chatRes.responseText) {
            try {
              const v = validateAIResponse(chatRes.responseText, cp.state.fenAfter);
              validatorScore = Number(v.score.toFixed(3));
              validatorIssueCount = v.issues.length;
              validatorIssuesJson = JSON.stringify(v.issues);
            } catch (err) {
              validatorIssuesJson = `[validator_error: ${String(err).slice(0, 200)}]`;
            }
          }

          const row: Row = {
            timestamp: new Date().toISOString(),
            run_id: runId,
            run_seed: args.seed,
            app_git_sha: appGitSha,
            game_id: game.id,
            white: game.white,
            black: game.black,
            persona: persona.name,
            persona_file_hash: persona.fileHash,
            ply: cp.ply,
            fen: cp.state.fenAfter,
            last_move: lastMove,
            last_n_moves: recent,
            checkpoint_kind: cp.kind,
            eval_before_cp: cp.state.evalBefore,
            eval_after_cp: cp.state.evalAfter,
            swing_cp: cp.state.swing,
            move_classification: cp.classification,
            student_question: personaRes.text,
            chat_response: chatRes.responseText || "",
            context_id: contextId,
            analysis_latency_ms: firstRowOfGame ? analyzeRes.latencyMs : "",
            chat_latency_ms: chatRes.latencyMs,
            model_chat: "claude-haiku-4-5",
            model_analysis: "claude-sonnet-4",
            personality_id: args.personality,
            base_url: args.baseUrl,
            validator_score: validatorScore,
            validator_issue_count: validatorIssueCount,
            validator_issues_json: validatorIssuesJson,
            prompt_tokens: personaRes.inputTokens,
            completion_tokens: personaRes.outputTokens,
            est_cost_usd: Number(cost.totalSpent().toFixed(6)),
            http_status: chatRes.status,
            error_message: chatRes.ok ? "" : (chatRes.errorMessage || ""),
            grade: "",
            failure_mode: "",
            notes: "",
          };
          csv.appendRow(row);
          firstRowOfGame = false;

          const ok = chatRes.ok ? "✓" : "✗";
          console.log(`    ${ok} ply ${cp.ply} ${persona.name}: "${personaRes.text.slice(0, 50)}..." → ${chatRes.responseText?.slice(0, 60).replace(/\n/g, " ") || `[ERR ${chatRes.status}]`}`);
        }
      }
    }
  } finally {
    sf.close();
  }

  meta.ended_at = new Date().toISOString();
  meta.totals = {
    rows_written: csv.count(),
    cost_usd_spent: Number(cost.totalSpent().toFixed(6)),
    aborted_reason: abortedReason,
  };
  writeMeta(runsDir, meta);
  csv.close();

  console.log(
    `\nDone. ${csv.count()} rows in ${((Date.now() - startedAt) / 1000).toFixed(1)}s, $${cost.totalSpent().toFixed(4)} spent.`
  );
}

function buildErrorRow(opts: {
  meta: RunMeta;
  csv: CsvWriter;
  args: Args;
  game: LoadedGame;
  persona: PersonaSpec;
  cp: ReturnType<typeof pickCheckpoints>[number];
  chessjsHistory: string[];
  http_status: number;
  errorMessage: string;
  analysisLatencyMs?: number | "";
  contextId?: string;
}): Row {
  const { meta, args, game, persona, cp, chessjsHistory } = opts;
  return {
    timestamp: new Date().toISOString(),
    run_id: meta.run_id,
    run_seed: args.seed,
    app_git_sha: meta.app_git_sha,
    game_id: game.id,
    white: game.white,
    black: game.black,
    persona: persona.name,
    persona_file_hash: persona.fileHash,
    ply: cp.ply,
    fen: cp.state.fenAfter,
    last_move: cp.state.sanMove,
    last_n_moves: recentSan(chessjsHistory, cp.ply),
    checkpoint_kind: cp.kind,
    eval_before_cp: cp.state.evalBefore,
    eval_after_cp: cp.state.evalAfter,
    swing_cp: cp.state.swing,
    move_classification: cp.classification,
    student_question: "",
    chat_response: "[ERROR]",
    context_id: opts.contextId || "",
    analysis_latency_ms: opts.analysisLatencyMs ?? "",
    chat_latency_ms: "",
    model_chat: "claude-haiku-4-5",
    model_analysis: "claude-sonnet-4",
    personality_id: args.personality,
    base_url: args.baseUrl,
    validator_score: "",
    validator_issue_count: "",
    validator_issues_json: "",
    prompt_tokens: "",
    completion_tokens: "",
    est_cost_usd: "",
    http_status: opts.http_status,
    error_message: opts.errorMessage,
    grade: "",
    failure_mode: "",
    notes: "",
  };
}

// ─────────────────────────────────────────────────────────────────────
// Stage C category-dispatch flow
// ─────────────────────────────────────────────────────────────────────

interface CategoryDispatchOpts {
  args: Args;
  games: LoadedGame[];
  personas: PersonaSpec[];
  runId: string;
  csv: CsvWriter;
  meta: RunMeta;
  runsDir: string;
  cookie: string;
  anthropicKey: string;
  appGitSha: string;
}

interface TurnSpec {
  turnIdx: number;
  category: QuestionCategory;
  /** For position-anchored categories: which (game, persona) hint to use. */
  gameAndPersonaHint?: { gameIdx: number; persona: string };
}

/**
 * Build the turn plan from args. Three modes (in priority order):
 *   1. --category-mix=cat:N,cat:N,... → custom counts per category.
 *   2. --force-category=X --samples=N → N samples of category X.
 *   3. --force-category=balanced (default for category-dispatch) →
 *      uses BALANCED_DEFAULT_COUNTS if --samples unset; otherwise N
 *      per category (uniform).
 */
function buildTurnPlan(args: Args, games: LoadedGame[], personas: PersonaSpec[]): TurnSpec[] {
  const counts: Record<QuestionCategory, number> = (() => {
    if (args.categoryMix) {
      const parsed: Partial<Record<QuestionCategory, number>> = {};
      for (const pair of args.categoryMix.split(",")) {
        const [k, v] = pair.split(":").map((s) => s.trim());
        if (!k || !v) continue;
        if (!CATEGORY_ORDER.includes(k as QuestionCategory)) {
          throw new Error(`--category-mix: unknown category "${k}". Use one of: ${CATEGORY_ORDER.join(",")}`);
        }
        parsed[k as QuestionCategory] = parseInt(v, 10);
      }
      const out = { ...BALANCED_DEFAULT_COUNTS, ...parsed } as Record<QuestionCategory, number>;
      // Zero out any category not explicitly mentioned.
      for (const c of CATEGORY_ORDER) if (!(c in parsed)) out[c] = 0;
      return out;
    }
    if (args.forceCategory && args.forceCategory !== "balanced") {
      if (!CATEGORY_ORDER.includes(args.forceCategory as QuestionCategory)) {
        throw new Error(`--force-category: unknown category "${args.forceCategory}". Use "balanced" or one of: ${CATEGORY_ORDER.join(",")}`);
      }
      const n = args.samples ?? 12;
      const out: Record<QuestionCategory, number> = {
        game_review: 0,
        opponent_prep: 0,
        position_analysis: 0,
        improvement_strategy: 0,
        meta_motivational: 0,
        concept_explanation: 0,
      };
      out[args.forceCategory as QuestionCategory] = n;
      return out;
    }
    // balanced (default for category-dispatch)
    if (args.samples !== undefined) {
      return CATEGORY_ORDER.reduce((acc, c) => ({ ...acc, [c]: args.samples }), {} as Record<QuestionCategory, number>);
    }
    return { ...BALANCED_DEFAULT_COUNTS };
  })();

  const plan: TurnSpec[] = [];
  let turnIdx = 0;
  for (const cat of CATEGORY_ORDER) {
    const n = counts[cat];
    for (let i = 0; i < n; i++) {
      const t: TurnSpec = { turnIdx, category: cat };
      if (cat === "game_review" || cat === "position_analysis") {
        // Deterministic (game, persona) pick via turnIdx. Stockfish runs
        // lazily in executeTurn when live mode requires it.
        const gameIdx = games.length > 0 ? turnIdx % games.length : 0;
        const personaIdx = personas.length > 0 ? turnIdx % personas.length : 0;
        t.gameAndPersonaHint = { gameIdx, persona: personas[personaIdx]?.name ?? "confused_beginner" };
      }
      plan.push(t);
      turnIdx++;
    }
  }
  return plan;
}

/**
 * Stub position context for mock-LLM mode (no stockfish, no game loading).
 * Matches the smoke-generators.ts stub so output is consistent across
 * the two dev entry points.
 */
function stubPositionContext(turn: TurnSpec) {
  const FEN_STUB = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
  return {
    fenAfter: FEN_STUB,
    fenBefore: FEN_STUB,
    moveHistory: ["e4", "e5", "Nf3", "Nc6"],
    gameEval: { positions: [], accuracy: { white: 0, black: 0 } } as any,
    playerColor: "w" as const,
    recentSan: "1.e4 e5 2.Nf3 Nc6",
    classification: turn.category === "game_review" ? "inaccuracy" : "book",
    initialAnalysis:
      "You're in an Italian/Ruy Lopez opening — White has the initiative with a3 + Bb5 to follow. Your last move was solid; consider d6 next to support e5.",
    persona: turn.gameAndPersonaHint?.persona ?? "confused_beginner",
    subcategory: turn.category as "game_review" | "position_analysis",
    gameId: `stub-game-${turn.turnIdx}`,
  };
}

function buildTurnRow(args: {
  meta: RunMeta;
  runId: string;
  appGitSha: string;
  baseUrl: string;
  personality: string;
  turn: TurnSpec;
  result: GeneratorResult;
  mockLlm: boolean;
  chatResponse?: string;
  http_status?: number | "";
  latencyMs?: number | "";
  errorMessage?: string;
}): Row {
  const { turn, result } = args;
  return {
    timestamp: new Date().toISOString(),
    run_id: args.runId,
    run_seed: args.meta.seed,
    app_git_sha: args.appGitSha,
    turn_idx: turn.turnIdx,
    category: turn.category,
    generator_metadata: JSON.stringify(result.metadata),
    body_extensions: JSON.stringify(result.bodyExtensions),
    mock_llm: args.mockLlm ? "true" : "false",
    game_id: turn.gameAndPersonaHint?.gameIdx ?? "",
    white: "",
    black: "",
    persona: result.personaUsed,
    persona_file_hash: "",
    ply: "",
    fen: "",
    last_move: "",
    last_n_moves: "",
    checkpoint_kind: "",
    eval_before_cp: "",
    eval_after_cp: "",
    swing_cp: "",
    move_classification: "",
    student_question: result.question,
    chat_response: args.chatResponse ?? "",
    context_id: "",
    analysis_latency_ms: "",
    chat_latency_ms: args.latencyMs ?? "",
    model_chat: args.mockLlm ? "mock" : "claude-haiku-4-5",
    model_analysis: args.mockLlm ? "mock" : "claude-sonnet-4",
    personality_id: args.personality,
    base_url: args.baseUrl,
    validator_score: "",
    validator_issue_count: "",
    validator_issues_json: "",
    prompt_tokens: "",
    completion_tokens: "",
    est_cost_usd: "",
    http_status: args.http_status ?? "",
    error_message: args.errorMessage ?? "",
    grade: "",
    failure_mode: "",
    notes: "",
  };
}

async function runCategoryDispatchFlow(opts: CategoryDispatchOpts): Promise<void> {
  const { args, games, personas, runId, csv, meta, runsDir, cookie, anthropicKey, appGitSha } = opts;

  console.log(`\n=== Stage C category-dispatch flow ===`);
  console.log(`  mode: ${args.forceCategory ? `force=${args.forceCategory}` : `mix=${args.categoryMix}`}`);
  console.log(`  mock-LLM: ${args.mockLlm}`);

  // Load category-generator fixtures + personas
  let fixtures: GeneratorFixtures;
  let personaPrompts: Record<string, string>;
  try {
    fixtures = loadAllFixtures();
    personaPrompts = loadPersonaSystemPrompts();
  } catch (err) {
    console.error("ABORT: failed to load fixtures / personas:", err instanceof Error ? err.message : String(err));
    csv.close();
    return;
  }
  console.log(`  fixtures: ${fixtures.opponents.length} opponents, ${fixtures.concepts.length} concepts, ${fixtures.lossSummaries.length} loss snippets, ${Object.keys(fixtures.userHistories).length} user histories`);

  const plan = buildTurnPlan(args, games, personas);
  console.log(`  plan: ${plan.length} turns`);
  const planSummary: Record<string, number> = {};
  for (const t of plan) planSummary[t.category] = (planSummary[t.category] ?? 0) + 1;
  for (const c of CATEGORY_ORDER) {
    if (planSummary[c]) console.log(`    ${c}: ${planSummary[c]}`);
  }

  const cost = new CostTracker(args.maxCost);
  const startedAt = Date.now();
  let abortedReason: string | undefined;

  // Real LLM call wrapper (only constructed when not in mock mode).
  const realLlmCall: LlmCall = async ({ systemPrompt, userPrompt }) => {
    const r = await generatePersonaQuestion({
      apiKey: anthropicKey,
      systemPrompt,
      contextBlock: userPrompt,
      temperature: args.personaTemperature,
      costTracker: cost,
    });
    return { ok: r.ok, text: r.text, errorMessage: r.errorMessage };
  };

  TURN_LOOP: for (const turn of plan) {
    if (cost.totalSpent() >= args.maxCost) {
      abortedReason = `cost cap $${args.maxCost} hit at $${cost.totalSpent().toFixed(4)}`;
      console.warn(`ABORT: ${abortedReason}`);
      break TURN_LOOP;
    }

    const gen = pickGenerator(turn.category);
    const llmCall: LlmCall = args.mockLlm ? makeMockLlmCall() : realLlmCall;
    const rng = mulberry32(args.seed + turn.turnIdx * 13 + 1);

    const baseCtx: GeneratorContextBase = {
      category: turn.category,
      rng,
      llmCall,
      personas: personaPrompts,
      fixtures,
    };

    let ctx: Parameters<typeof gen>[0] = baseCtx;
    if (turn.category === "game_review" || turn.category === "position_analysis") {
      // Stub position context for both mock and live modes in this commit.
      // Live mode will swap in real stockfish + analyzeGame in a follow-up;
      // surfacing as a known limitation (see commit body).
      ctx = { ...baseCtx, ...stubPositionContext(turn) };
    }

    let result: GeneratorResult;
    try {
      result = await gen(ctx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  turn ${turn.turnIdx} [${turn.category}] generator failed: ${msg}`);
      csv.appendRow(
        buildTurnRow({
          meta,
          runId,
          appGitSha,
          baseUrl: args.baseUrl,
          personality: args.personality,
          turn,
          result: {
            question: "",
            personaUsed: "",
            bodyExtensions: {},
            metadata: { error: msg },
          },
          mockLlm: args.mockLlm,
          errorMessage: `generator_failed: ${msg}`,
        }),
      );
      continue;
    }

    if (args.mockLlm) {
      csv.appendRow(
        buildTurnRow({
          meta,
          runId,
          appGitSha,
          baseUrl: args.baseUrl,
          personality: args.personality,
          turn,
          result,
          mockLlm: true,
        }),
      );
      console.log(`  turn ${turn.turnIdx} [${turn.category}] persona=${result.personaUsed} mock`);
      console.log(`    Q: ${result.question.slice(0, 100)}${result.question.length > 100 ? "..." : ""}`);
      continue;
    }

    // Live mode: POST to /api/enhanced-analysis with the generator's
    // question + body extensions. Position-anchored turns currently use
    // the same path; a follow-up will route them through the original
    // analyzeGame + chatFollowUp two-step (initial analysis + chat turn)
    // for full parity with the legacy flow.
    const apiRes = await analyzeCategoryTurn({
      baseUrl: args.baseUrl,
      cookie,
      userMessage: result.question,
      userRating: 1500,
      personalityId: args.personality,
      bodyExtensions: result.bodyExtensions,
    });

    let validatorScore: number | "" = "";
    let validatorIssueCount: number | "" = "";
    let validatorIssuesJson = "";
    if (apiRes.ok && apiRes.responseText) {
      try {
        const v = validateAIResponse(apiRes.responseText, "");
        validatorScore = Number(v.score.toFixed(3));
        validatorIssueCount = v.issues.length;
        validatorIssuesJson = JSON.stringify(v.issues);
      } catch (vErr) {
        validatorIssuesJson = `[validator_error: ${String(vErr).slice(0, 200)}]`;
      }
    }

    const row = buildTurnRow({
      meta,
      runId,
      appGitSha,
      baseUrl: args.baseUrl,
      personality: args.personality,
      turn,
      result,
      mockLlm: false,
      chatResponse: apiRes.responseText ?? "",
      http_status: apiRes.status,
      latencyMs: apiRes.latencyMs,
      errorMessage: apiRes.ok ? "" : (apiRes.errorMessage ?? ""),
    });
    row.validator_score = validatorScore;
    row.validator_issue_count = validatorIssueCount;
    row.validator_issues_json = validatorIssuesJson;
    row.est_cost_usd = Number(cost.totalSpent().toFixed(6));
    csv.appendRow(row);

    const ok = apiRes.ok ? "✓" : "✗";
    console.log(`  turn ${turn.turnIdx} [${turn.category}] ${ok} persona=${result.personaUsed} (${apiRes.latencyMs}ms)`);
  }

  meta.ended_at = new Date().toISOString();
  meta.totals = {
    rows_written: csv.count(),
    cost_usd_spent: Number(cost.totalSpent().toFixed(6)),
    aborted_reason: abortedReason,
  };
  writeMeta(runsDir, meta);
  csv.close();

  console.log(`\nDone (category-dispatch). ${csv.count()} rows in ${((Date.now() - startedAt) / 1000).toFixed(1)}s, $${cost.totalSpent().toFixed(4)} spent.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
