/**
 * The follow-up's intent router (pathway PR 3.4, behind `COACH_INTENT_ROUTER`).
 *
 * One Haiku call for a question no rule reads (lib/coach/intentRules.ts),
 * in the category classifier's place on the chat route. It names one of
 * the eighteen intents and its confidence through an enum schema, with the
 * question alone in the user turn, and is aborted at 1.5 s because the
 * answer waits on it on both validator wings. It never throws: a timeout,
 * a throw, an answer that does not parse and a low confidence are each an
 * outcome, and the route gives every outcome but `ok` the default row.
 */
import { callLLM, type LLMProvider, type LLMResult } from "@/lib/llmProvider";
import { recordLLMCall } from "@/lib/llmStatsAggregator";
import {
  QUESTION_INTENTS,
  type QuestionIntent,
} from "@/lib/coach/questionIntent";
import {
  CLASSIFIER_LOW_CONFIDENCE_THRESHOLD,
  estimateHaikuCost,
} from "./categoryClassifier";
import {
  buildIntentRouterUserTurn,
  INTENT_ROUTER_SYSTEM,
} from "./intentRouterPrompt";

/** Half the classifier's budget: the router gates the answer on both wings. */
export const INTENT_ROUTER_TIMEOUT_MS = 1_500;

export const INTENT_ROUTE_SCHEMA: {
  name: "coach_intent";
  schema: Record<string, unknown>;
} = {
  name: "coach_intent",
  schema: {
    type: "object",
    properties: {
      intent: { type: "string", enum: [...QUESTION_INTENTS] },
      confidence: { type: "number" },
    },
    required: ["intent", "confidence"],
    additionalProperties: false,
  },
};

export interface RouterOutcome {
  outcome: "ok" | "low_confidence" | "invalid" | "timeout" | "threw";
  /** The router's intent, on `ok`, and on `low_confidence` for the log only. */
  intent?: QuestionIntent;
  confidence?: number;
  ms: number;
  costUsd: number;
  provider?: LLMProvider;
}

export type IntentRouterCall = (a: {
  system: string;
  user: string;
  signal: AbortSignal;
}) => Promise<{ raw: string; costUsd?: number; result?: LLMResult }>;

export const defaultIntentRouterCall: IntentRouterCall = async ({
  system,
  user,
  signal,
}) => {
  const result = await callLLM({
    tier: "fast",
    system,
    messages: [{ role: "user", content: user }],
    temperature: 0,
    maxTokens: 40,
    cacheSystem: true,
    outputSchema: INTENT_ROUTE_SCHEMA,
    signal,
  });
  recordLLMCall(result);
  return { raw: result.content, costUsd: estimateHaikuCost(result), result };
};

const KNOWN = new Set<string>(QUESTION_INTENTS);

/** The router's JSON, checked field by field, or null when it is not one. */
export function parseIntentRouterOutput(
  raw: string
): { intent: QuestionIntent; confidence: number } | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fenced ? fenced[1].trim() : trimmed;
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return null;
    const c = parsed as Record<string, unknown>;
    if (typeof c.intent !== "string" || !KNOWN.has(c.intent)) return null;
    if (
      typeof c.confidence !== "number" ||
      !Number.isFinite(c.confidence) ||
      c.confidence < 0 ||
      c.confidence > 1
    )
      return null;
    return { intent: c.intent as QuestionIntent, confidence: c.confidence };
  } catch {
    return null;
  }
}

/**
 * Ask the router once. The abort travels to the provider call as its fetch
 * signal, so a slow answer is cut off, and callLLM does not fall back to
 * OpenAI after an abort. Never throws.
 */
export async function routeIntentByModel(o: {
  question: string;
  call?: IntentRouterCall;
  timeoutMs?: number;
}): Promise<RouterOutcome> {
  const call = o.call ?? defaultIntentRouterCall;
  const timeoutMs = o.timeoutMs ?? INTENT_ROUTER_TIMEOUT_MS;
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  (timer as unknown as { unref?: () => void }).unref?.();
  let got: Awaited<ReturnType<IntentRouterCall>>;
  try {
    got = await call({
      system: INTENT_ROUTER_SYSTEM,
      user: buildIntentRouterUserTurn(o.question),
      signal: controller.signal,
    });
  } catch {
    return {
      outcome: controller.signal.aborted ? "timeout" : "threw",
      ms: Date.now() - t0,
      costUsd: 0,
    };
  } finally {
    clearTimeout(timer);
  }
  const ms = Date.now() - t0;
  const costUsd =
    typeof got?.costUsd === "number" && Number.isFinite(got.costUsd)
      ? got.costUsd
      : 0;
  const provider = got?.result?.provider;
  const base = { ms, costUsd, ...(provider ? { provider } : {}) };
  const parsed = parseIntentRouterOutput(
    typeof got?.raw === "string" ? got.raw : ""
  );
  if (!parsed) return { outcome: "invalid", ...base };
  if (parsed.confidence < CLASSIFIER_LOW_CONFIDENCE_THRESHOLD)
    return { outcome: "low_confidence", ...parsed, ...base };
  return { outcome: "ok", ...parsed, ...base };
}
