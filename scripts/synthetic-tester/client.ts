import type { GameEval, PositionEval } from "../../src/types/eval";
import { EngineName, MoveClassification } from "../../src/types/enums";
import type { PerPlyState } from "./checkpoints";
import type { CostTracker } from "./costTracker";
import { classifyBySwing } from "./checkpoints";
import type { EngineScore } from "./stockfish";

/* ──────────────────────────────────────────────────────────────────────────
 * Vercel Deployment Protection bypass
 *
 * Vercel preview deploys are gated behind an SSO login wall by default;
 * automation needs the "Protection Bypass for Automation" secret. When
 * VERCEL_AUTOMATION_BYPASS_SECRET is set AND the request target is a
 * *.vercel.app preview URL, inject the two documented bypass headers.
 *
 * The secret never appears in logs. Only the variable NAME is logged
 * on startup ("VERCEL_AUTOMATION_BYPASS_SECRET set; ..."), never the value.
 * The harness does not redact header values from third-party logging
 * — if a request gets logged elsewhere, the secret would leak — but
 * the harness itself does not log request headers.
 *
 * Reference: https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation
 * ────────────────────────────────────────────────────────────────────────── */

const VERCEL_PREVIEW_HOST_RE = /\.vercel\.app$/i;

export function vercelBypassHeaders(baseUrl: string): Record<string, string> {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!secret) return {};
  try {
    const host = new URL(baseUrl).hostname;
    if (!VERCEL_PREVIEW_HOST_RE.test(host)) return {};
  } catch {
    return {};
  }
  // Send protection-bypass header only. x-vercel-set-bypass-cookie:true
  // caused an infinite redirect loop in dry-run testing 2026-05-23 (50
  // redirects to the same URL before fetch gave up). The cookie-set
  // mechanism is designed for browser flows where the cookie persists
  // across the SPA's subsequent requests; the harness is one-shot fetch
  // per turn and re-presents the bypass header each time, so the cookie
  // doesn't buy anything.
  return {
    "x-vercel-protection-bypass": secret,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Chess Masti server clients
 * ────────────────────────────────────────────────────────────────────────── */

export interface ChatMastiResponse {
  ok: boolean;
  status: number;
  errorMessage?: string;
  contextId?: string;
  initialAnalysis?: string;
  responseText?: string;
  validationScore?: number;
  latencyMs: number;
  /** Stage C pipeline metadata captured from gameAnalysis.pipeline.
   *  Present when the route's flag-on path ran AND VERCEL_ENV=preview
   *  (production responses don't include telemetry). */
  pipeline?: {
    finalOutcome?: string;
    retryCount?: number;
    totalCostUsd?: number;
    category?: string;
    classifierConfidence?: number;
    prepMs?: number;
    timedOut?: boolean;
    telemetry?: unknown[]; // per-event TelemetryEvent objects; opaque to harness
  };
}

export interface AnalyzeArgs {
  baseUrl: string;
  cookie: string;
  moveHistory: string[];
  fen: string;
  gameEval: GameEval;
  playerColor: "w" | "b";
  userRating: number;
  personalityId: string;
  /** Optional extra body fields — used by Stage C category-dispatch turns
   *  to pass opponentUsername / username / userMessage / opponentPlatform
   *  through to the route. Merged into the JSON body. */
  bodyExtensions?: Record<string, unknown>;
}

export async function analyzeGame(args: AnalyzeArgs): Promise<ChatMastiResponse> {
  const t0 = Date.now();
  try {
    // Boundary invariant: production's getEvaluateGameParams produces
    // positions.length === moveHistory.length + 1 (positions[0] = starting
    // state, positions[N] = after the Nth move). The route's
    // deriveMastermindMoveContext relies on this; violating it silently
    // routes through the (β) skip path with no eval validation. This is
    // the third surface of the same off-by-one in three days — fail loud
    // in dev/test/CI so the fourth surface (if any) shows up immediately.
    // See MASTERMIND_CONTEXT/cleanup_followups.md off-by-one entry.
    if (
      args.moveHistory.length > 0 &&
      args.gameEval.positions.length !== args.moveHistory.length + 1
    ) {
      throw new Error(
        `gameEval shape contract violated: positions.length=${args.gameEval.positions.length}, ` +
          `expected moveHistory.length + 1 = ${args.moveHistory.length + 1}. ` +
          `See MASTERMIND_CONTEXT/cleanup_followups.md off-by-one entry.`,
      );
    }
    const body: Record<string, unknown> = {
      moveHistory: args.moveHistory,
      fen: args.fen,
      gameEval: args.gameEval,
      playerColor: args.playerColor,
      userRating: args.userRating,
      personalityId: args.personalityId,
      playerColorName: args.playerColor === "w" ? "white" : "black",
      ...(args.bodyExtensions ?? {}),
    };
    const res = await fetch(`${args.baseUrl}/api/enhanced-analysis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: args.cookie,
        ...vercelBypassHeaders(args.baseUrl),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, errorMessage: text.slice(0, 500), latencyMs };
    }
    const json = (await res.json()) as { gameAnalysis?: { contextId?: string; analysis?: string; validationScore?: number } };
    return {
      ok: true,
      status: res.status,
      contextId: json.gameAnalysis?.contextId,
      initialAnalysis: json.gameAnalysis?.analysis,
      validationScore: json.gameAnalysis?.validationScore,
      latencyMs,
    };
  } catch (err) {
    return { ok: false, status: 0, errorMessage: String(err), latencyMs: Date.now() - t0 };
  }
}

/**
 * Stage C category-dispatch client. Used by run.ts for the four
 * non-position generators (opponent_prep, improvement_strategy,
 * meta_motivational, concept_explanation). POSTs to
 * /api/enhanced-analysis with userMessage + body extensions, no
 * position fields. The route's flag-on wing handles the
 * pipeline + classifier dispatch.
 */
export interface CategoryTurnArgs {
  baseUrl: string;
  cookie: string;
  userMessage: string;
  userRating: number;
  personalityId: string;
  bodyExtensions: Record<string, unknown>;
}

export async function analyzeCategoryTurn(args: CategoryTurnArgs): Promise<ChatMastiResponse> {
  const t0 = Date.now();
  try {
    const body: Record<string, unknown> = {
      userMessage: args.userMessage,
      userRating: args.userRating,
      personalityId: args.personalityId,
      ...args.bodyExtensions,
    };
    const res = await fetch(`${args.baseUrl}/api/enhanced-analysis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: args.cookie,
        ...vercelBypassHeaders(args.baseUrl),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, errorMessage: text.slice(0, 500), latencyMs };
    }
    const json = (await res.json()) as {
      gameAnalysis?: {
        contextId?: string;
        analysis?: string;
        validationScore?: number;
        pipeline?: {
          finalOutcome?: string;
          retryCount?: number;
          totalCostUsd?: number;
          category?: string;
          classifierConfidence?: number;
          prepMs?: number;
          timedOut?: boolean;
          telemetry?: unknown[];
        };
      };
    };
    return {
      ok: true,
      status: res.status,
      contextId: json.gameAnalysis?.contextId,
      initialAnalysis: json.gameAnalysis?.analysis,
      responseText: json.gameAnalysis?.analysis,
      validationScore: json.gameAnalysis?.validationScore,
      latencyMs,
      pipeline: json.gameAnalysis?.pipeline,
    };
  } catch (err) {
    return { ok: false, status: 0, errorMessage: String(err), latencyMs: Date.now() - t0 };
  }
}

export interface ChatArgs {
  baseUrl: string;
  cookie: string;
  contextId: string;
  userMessage: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
}

export async function chatFollowUp(args: ChatArgs): Promise<ChatMastiResponse> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${args.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: args.cookie,
        ...vercelBypassHeaders(args.baseUrl),
      },
      body: JSON.stringify({
        contextId: args.contextId,
        userMessage: args.userMessage,
        conversationHistory: args.conversationHistory,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, errorMessage: text.slice(0, 500), latencyMs };
    }
    const json = (await res.json()) as {
      gameAnalysis?: {
        analysis?: string;
        validationScore?: number;
        pipeline?: {
          finalOutcome?: string;
          retryCount?: number;
          totalCostUsd?: number;
          category?: string;
          classifierConfidence?: number;
          prepMs?: number;
          timedOut?: boolean;
          telemetry?: unknown[];
        };
      };
    };
    return {
      ok: true,
      status: res.status,
      responseText: json.gameAnalysis?.analysis,
      validationScore: json.gameAnalysis?.validationScore,
      latencyMs,
      pipeline: json.gameAnalysis?.pipeline,
    };
  } catch (err) {
    return { ok: false, status: 0, errorMessage: String(err), latencyMs: Date.now() - t0 };
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Anthropic — student persona generation (Haiku)
 * ────────────────────────────────────────────────────────────────────────── */

const STUDENT_MODEL = "claude-haiku-4-5-20251001";

export interface PersonaArgs {
  apiKey: string;
  systemPrompt: string;
  contextBlock: string;
  temperature: number;
  costTracker: CostTracker;
}

export interface PersonaResult {
  ok: boolean;
  text: string;
  inputTokens: number;
  outputTokens: number;
  errorMessage?: string;
  modelId: typeof STUDENT_MODEL;
}

export async function generatePersonaQuestion(args: PersonaArgs): Promise<PersonaResult> {
  // Ballpark estimate so we can pre-flight against the cost cap.
  const estIn = Math.ceil((args.systemPrompt.length + args.contextBlock.length) / 4);
  const estOut = 80;
  if (args.costTracker.exceedsCap(args.costTracker.estimate(STUDENT_MODEL, estIn, estOut))) {
    return { ok: false, text: "", inputTokens: 0, outputTokens: 0, modelId: STUDENT_MODEL, errorMessage: "cost_cap_would_exceed" };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": args.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: STUDENT_MODEL,
        max_tokens: 200,
        temperature: args.temperature,
        system: args.systemPrompt,
        messages: [{ role: "user", content: args.contextBlock }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, text: "", inputTokens: 0, outputTokens: 0, modelId: STUDENT_MODEL, errorMessage: `${res.status} ${text.slice(0, 200)}` };
    }
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (json.content?.find((b) => b.type === "text")?.text || "").trim().replace(/^["']|["']$/g, "");
    const inputTokens = json.usage?.input_tokens ?? estIn;
    const outputTokens = json.usage?.output_tokens ?? estOut;
    args.costTracker.addUsage(STUDENT_MODEL, inputTokens, outputTokens);
    return { ok: true, text, inputTokens, outputTokens, modelId: STUDENT_MODEL };
  } catch (err) {
    return { ok: false, text: "", inputTokens: 0, outputTokens: 0, modelId: STUDENT_MODEL, errorMessage: String(err) };
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Stockfish-state → GameEval (server expects this shape; see PositionEvalInput
 * in src/app/api/enhanced-analysis/route.ts:26)
 * ────────────────────────────────────────────────────────────────────────── */

export function buildGameEval(
  states: PerPlyState[],
  startingScore: EngineScore,
  depth = 14,
): GameEval {
  // Production's getEvaluateGameParams (src/lib/chess.ts:11-12) pushes the
  // starting FEN into the fens array before any move's "after" FEN, so
  // engine.evaluateGame produces positions.length === moveHistory.length + 1
  // with positions[0] = starting state. The route's deriveMastermindMoveContext
  // relies on this convention (positions[lastIdx] where lastIdx =
  // moveHistory.length returns the after-last-move eval). Harness must match
  // it for stockfishEval to thread through to the eval_claim validator. The
  // starting PositionEval mirrors production's shape: lines[0] with cp/mate
  // from the engine, no moveClassification (production leaves index 0
  // unchanged through getMovesClassification — moveClassification.ts:37).
  const startingCp = startingScore.kind === "cp" ? startingScore.cp : undefined;
  const startingMate = startingScore.kind === "mate" ? startingScore.mate : undefined;
  const startingPosition: PositionEval = {
    lines: [
      {
        pv: [],
        cp: startingCp,
        mate: startingMate,
        depth,
        multiPv: 1,
      },
    ],
  };
  const movePositions: PositionEval[] = states.map((s) => {
    const cp = s.rawScoreAfter.kind === "cp" ? s.rawScoreAfter.cp : undefined;
    const mate = s.rawScoreAfter.kind === "mate" ? s.rawScoreAfter.mate : undefined;
    const cls: MoveClassification = classifyBySwing(s.swing);
    return {
      moveClassification: cls,
      lines: [
        {
          pv: [],
          cp,
          mate,
          depth,
          multiPv: 1,
        },
      ],
    };
  });
  const positions: PositionEval[] = [startingPosition, ...movePositions];
  return {
    positions,
    accuracy: { white: 0, black: 0 },
    settings: {
      engine: EngineName.Stockfish17,
      depth,
      multiPv: 1,
      date: new Date().toISOString(),
    },
  };
}
