import { callLLM, LLMResult } from "@/lib/llmProvider";
import { ParserCall } from "../validators/evalClaim";
import {
  CATEGORY_CLASSIFIER_SYSTEM,
  buildCategoryClassifierUserTurn,
} from "./categoryPrompts";

export type QuestionCategory =
  | "game_review"
  | "opponent_prep"
  | "position_analysis"
  | "concept_explanation"
  | "improvement_strategy"
  | "meta_motivational";

export interface CategorizedQuestion {
  category: QuestionCategory;
  confidence: number;
  rationale: string;
}

export const CLASSIFIER_LOW_CONFIDENCE_THRESHOLD = 0.5;

/**
 * Default fallback when the parser returns malformed output or the parsed
 * confidence falls below the threshold. `meta_motivational` is chosen because
 * it carries the lowest citation-rate floor (20%) per §5.3.2 — an ambiguous
 * question routed to a high-floor category would cause spurious gate
 * failures.
 */
export const DEFAULT_LOW_CONFIDENCE_CATEGORY: QuestionCategory = "meta_motivational";

const ALL_CATEGORIES: ReadonlyArray<QuestionCategory> = [
  "game_review",
  "opponent_prep",
  "position_analysis",
  "concept_explanation",
  "improvement_strategy",
  "meta_motivational",
];

const HAIKU_INPUT_PRICE_PER_M = 1.0;
const HAIKU_OUTPUT_PRICE_PER_M = 5.0;
const HAIKU_CACHE_READ_PRICE_PER_M = 0.1;

function estimateHaikuCost(r: LLMResult): number {
  const cacheRead = r.cacheReadTokens ?? 0;
  const inputUncached = (r.inputTokens - cacheRead) / 1_000_000;
  const cacheReadM = cacheRead / 1_000_000;
  const output = r.outputTokens / 1_000_000;
  return (
    inputUncached * HAIKU_INPUT_PRICE_PER_M +
    cacheReadM * HAIKU_CACHE_READ_PRICE_PER_M +
    output * HAIKU_OUTPUT_PRICE_PER_M
  );
}

export const defaultClassifierParserCall: ParserCall = async ({ system, user }) => {
  const result = await callLLM({
    tier: "fast",
    system,
    messages: [{ role: "user", content: user }],
    temperature: 0,
    maxTokens: 200,
    cacheSystem: true,
  });
  const costUsd = estimateHaikuCost(result);
  return { raw: result.content, costUsd, result };
};

function tryParse(raw: string): CategorizedQuestion | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fenced ? fenced[1].trim() : trimmed;
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate.category !== "string") return null;
    if (!ALL_CATEGORIES.includes(candidate.category as QuestionCategory)) return null;
    if (typeof candidate.confidence !== "number") return null;
    if (candidate.confidence < 0 || candidate.confidence > 1) return null;
    const rationale = typeof candidate.rationale === "string" ? candidate.rationale : "";
    return {
      category: candidate.category as QuestionCategory,
      confidence: candidate.confidence,
      rationale,
    };
  } catch {
    return null;
  }
}

export interface ClassifyQuestionOpts {
  question: string;
  parseCall?: ParserCall;
  lowConfidenceThreshold?: number;
}

/**
 * Classify a coaching question into one of six categories via a Haiku
 * sub-call. Returns the parser's category when confidence ≥ threshold;
 * routes to DEFAULT_LOW_CONFIDENCE_CATEGORY otherwise.
 *
 * Malformed parser output (invalid JSON, unknown category, out-of-range
 * confidence) is treated as confidence=0 and routed to the default
 * category — fail-soft so a classifier hiccup doesn't break the
 * downstream pipeline.
 *
 * Cost is captured by the parseCall return value; the route handler
 * sums it into the per-turn telemetry.
 */
export async function classifyQuestion(
  opts: ClassifyQuestionOpts
): Promise<CategorizedQuestion> {
  const parseCall = opts.parseCall ?? defaultClassifierParserCall;
  const threshold = opts.lowConfidenceThreshold ?? CLASSIFIER_LOW_CONFIDENCE_THRESHOLD;

  const result = await parseCall({
    system: CATEGORY_CLASSIFIER_SYSTEM,
    user: buildCategoryClassifierUserTurn(opts.question),
  });

  const parsed = tryParse(result.raw);
  if (!parsed) {
    return {
      category: DEFAULT_LOW_CONFIDENCE_CATEGORY,
      confidence: 0,
      rationale: "parser_json_invalid_or_unknown_category",
    };
  }

  if (parsed.confidence < threshold) {
    return {
      category: DEFAULT_LOW_CONFIDENCE_CATEGORY,
      confidence: parsed.confidence,
      rationale: `low_confidence_default (parser said "${parsed.category}" with confidence ${parsed.confidence}; routed to ${DEFAULT_LOW_CONFIDENCE_CATEGORY})`,
    };
  }

  return parsed;
}

export function isQuestionCategory(s: string): s is QuestionCategory {
  return ALL_CATEGORIES.includes(s as QuestionCategory);
}

export const QUESTION_CATEGORIES = ALL_CATEGORIES;
