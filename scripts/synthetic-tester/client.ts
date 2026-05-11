import type { GameEval, PositionEval } from "../../src/types/eval";
import { EngineName, MoveClassification } from "../../src/types/enums";
import type { PerPlyState } from "./checkpoints";
import type { CostTracker } from "./costTracker";
import { classifyBySwing } from "./checkpoints";

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
}

export async function analyzeGame(args: AnalyzeArgs): Promise<ChatMastiResponse> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${args.baseUrl}/api/enhanced-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: args.cookie },
      body: JSON.stringify({
        moveHistory: args.moveHistory,
        fen: args.fen,
        gameEval: args.gameEval,
        playerColor: args.playerColor,
        userRating: args.userRating,
        personalityId: args.personalityId,
        playerColorName: args.playerColor === "w" ? "white" : "black",
      }),
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
      headers: { "Content-Type": "application/json", Cookie: args.cookie },
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
    const json = (await res.json()) as { gameAnalysis?: { analysis?: string; validationScore?: number } };
    return {
      ok: true,
      status: res.status,
      responseText: json.gameAnalysis?.analysis,
      validationScore: json.gameAnalysis?.validationScore,
      latencyMs,
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

export function buildGameEval(states: PerPlyState[], depth = 14): GameEval {
  const positions: PositionEval[] = states.map((s) => {
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
