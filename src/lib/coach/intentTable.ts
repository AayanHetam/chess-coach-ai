/**
 * One row per intent: what a follow-up turn is given once its intent is
 * known (pathway PR 3.4, behind `COACH_INTENT_ROUTER`).
 *
 * A row names the answer's grammar, its budget, its fact pack, the page
 * orders it may carry, whether the page serves it, and the category the
 * validators read. An anchored turn is always the one-move grammar,
 * whatever its row. Every row whose facts have not landed (positional
 * annotations, the book, the tablebase, memory, master games) is the plain
 * one-move turn, and `pendingSource` counts the demand for each.
 *
 * Only `plan` maps into the position-anchored validator categories: a turn
 * about several moves, no move or an alternative stays outside them (the
 * 2026-05-26 rollback).
 *
 * Pure and client-safe: no prompt module, no API route
 * (lib/coach/__tests__/whatIfClientChain.test.ts keeps it that way).
 */
import type { QuestionCategory } from "@/lib/mastermind/categorization/categoryClassifier";
import type { RouterOutcome } from "@/lib/mastermind/categorization/intentRouter";
import type { PageTurnKind } from "./pageActions";
import type { QuestionIntent } from "./questionIntent";
import { intentFromModel, type LiveIntent } from "./intentRules";

export const INTENT_ROUTER_VERSION = "router-1";

/**
 * The version of the grammars' text (lib/prompts/followUpGrammar.ts, which
 * re-exports it). It lives here so the routing echo can carry it without
 * this module reaching the prompt text.
 */
export const FOLLOWUP_GRAMMAR_VERSION = "grammar-1";

/**
 * `COACH_INTENT_ROUTER=1` (server, read per call, off until its flip): the
 * router decides the turn's grammar, fact pack and category.
 */
export function isIntentRouterEnabled(): boolean {
  const v = (process.env.COACH_INTENT_ROUTER ?? "").trim().toLowerCase();
  return v === "1" || v === "on" || v === "true";
}

export type FollowUpGrammar = "one_move" | "no_board" | "acknowledgement";
export type AckCapability = "try_it" | "quiz" | "defend_it";
export type PendingSource =
  | "second_score"
  | "positional_annotations"
  | "opening_book"
  | "tablebase"
  | "master_repository"
  | "account_memory"
  | "mode";

export interface IntentRow {
  /** For an unanchored turn. An anchored turn is always one_move. */
  grammar: FollowUpGrammar;
  /** "v1": followUpTurnReminder's own choice. */
  budget: "v1" | "words" | "openingWords";
  /** The anchor and the subject moments win over it. */
  factPack: "board" | "reference";
  allowedActions: readonly PageTurnKind[];
  /** No model call when the request lists the kind (pathway 2.4). */
  servedByPage: boolean;
  category: QuestionCategory;
  capability?: AckCapability;
  pendingSource?: PendingSource;
}

const ONE_MOVE = {
  grammar: "one_move",
  budget: "v1",
  factPack: "board",
  allowedActions: [],
  servedByPage: false,
} as const;
const ACK = {
  grammar: "acknowledgement",
  budget: "openingWords",
  factPack: "board",
  allowedActions: [],
  servedByPage: false,
} as const;

export const INTENT_TABLE: Readonly<Record<QuestionIntent, IntentRow>> = {
  verdict: { ...ONE_MOVE, category: "game_review" },
  what_if: { ...ONE_MOVE, category: "game_review" },
  compare: {
    ...ONE_MOVE,
    category: "game_review",
    pendingSource: "second_score",
  },
  plan: {
    ...ONE_MOVE,
    category: "position_analysis",
    pendingSource: "positional_annotations",
  },
  perspective: { ...ONE_MOVE, category: "game_review" },
  opening: {
    ...ONE_MOVE,
    category: "concept_explanation",
    pendingSource: "opening_book",
  },
  endgame: { ...ONE_MOVE, category: "game_review", pendingSource: "tablebase" },
  concept: {
    grammar: "no_board",
    budget: "words",
    factPack: "reference",
    allowedActions: [],
    servedByPage: false,
    category: "concept_explanation",
  },
  action: {
    ...ONE_MOVE,
    servedByPage: true,
    category: "meta_motivational",
    allowedActions: [
      "flip_board",
      "go_to_move",
      "go_to_start",
      "go_to_end",
      "step",
      "back",
      "back_to_game",
      "replay_line",
    ],
  },
  walkthrough: { ...ONE_MOVE, category: "game_review" },
  try_it: {
    ...ACK,
    capability: "try_it",
    category: "meta_motivational",
    pendingSource: "mode",
  },
  quiz: {
    ...ACK,
    capability: "quiz",
    category: "meta_motivational",
    pendingSource: "mode",
  },
  defend_it: {
    ...ACK,
    capability: "defend_it",
    category: "meta_motivational",
    pendingSource: "mode",
  },
  master_game: {
    ...ONE_MOVE,
    category: "concept_explanation",
    pendingSource: "master_repository",
  },
  progress: {
    ...ONE_MOVE,
    category: "improvement_strategy",
    pendingSource: "account_memory",
  },
  preference: {
    ...ONE_MOVE,
    servedByPage: true,
    allowedActions: ["side", "my_side"],
    category: "meta_motivational",
  },
  greeting: { ...ACK, category: "meta_motivational" },
  // The classifier's own failure default (DEFAULT_LOW_CONFIDENCE_CATEGORY).
  unknown: { ...ONE_MOVE, category: "meta_motivational" },
};

/** What one follow-up turn is given, and why. */
export interface TurnRoute {
  version: typeof INTENT_ROUTER_VERSION;
  source: "rule" | "model" | "default";
  rule: string;
  intent: QuestionIntent;
  row: IntentRow;
  grammar: FollowUpGrammar;
  capability?: AckCapability;
  category: QuestionCategory;
  confidence: number;
  factPack: "anchor" | "board" | "reference";
  veto?: "concept_on_board";
  /** The router's answer, when it was asked. */
  model?: RouterOutcome;
}

/**
 * The turn's route from the live rules and, when no rule decided, the
 * router's outcome. A router that failed, or that was not asked, gives the
 * default row: unknown, one move, the v1 turn.
 */
export function finishTurnRoute(i: {
  live: LiveIntent;
  model: RouterOutcome | null;
  question: string;
  anchored: boolean;
}): TurnRoute {
  let source: TurnRoute["source"];
  let rule: string;
  let intent: QuestionIntent;
  let confidence: number;
  let veto = i.live.veto;
  if (i.live.source === "rule") {
    source = "rule";
    rule = i.live.rule;
    intent = i.live.intent;
    confidence = 1;
  } else if (i.model?.outcome === "ok" && i.model.intent) {
    const read = intentFromModel(i.model.intent, i.question);
    source = "model";
    rule = `model:${i.model.intent}`;
    intent = read.intent;
    confidence = i.model.confidence ?? 0;
    if (read.overridden === "concept_on_board") veto = "concept_on_board";
  } else {
    source = "default";
    rule = i.model ? `model_${i.model.outcome}` : "none";
    intent = "unknown";
    confidence = 0;
  }
  const row = INTENT_TABLE[intent];
  const grammar: FollowUpGrammar = i.anchored ? "one_move" : row.grammar;
  return {
    version: INTENT_ROUTER_VERSION,
    source,
    rule,
    intent,
    row,
    grammar,
    ...(grammar === "acknowledgement" && row.capability
      ? { capability: row.capability }
      : {}),
    category: row.category,
    confidence,
    factPack: i.anchored ? "anchor" : row.factPack,
    ...(veto ? { veto } : {}),
    ...(i.model ? { model: i.model } : {}),
  };
}

/**
 * Whether a rejected turn with no draft may be served the position
 * template: only a one-move turn whose move context has an eval, so no
 * answer says "The position is balanced" without one.
 */
export function servesTemplate(
  r: TurnRoute,
  ev: { cp?: number | null; mate?: number | null }
): boolean {
  return (
    r.grammar === "one_move" &&
    (typeof ev.cp === "number" || typeof ev.mate === "number")
  );
}

/** The route's `routing` echo: what decided the turn, with no content. */
export interface RoutingEcho {
  version: typeof INTENT_ROUTER_VERSION;
  grammarVersion: typeof FOLLOWUP_GRAMMAR_VERSION;
  source: TurnRoute["source"];
  rule: string;
  intent: QuestionIntent;
  grammar: FollowUpGrammar;
  category: QuestionCategory;
  factPack: TurnRoute["factPack"] | "subject";
  veto?: "concept_on_board";
  model?: {
    outcome: RouterOutcome["outcome"];
    intent?: QuestionIntent;
    confidence?: number;
    costUsd: number;
  };
}

export function routingEcho(
  r: TurnRoute,
  subjectMoments: boolean
): RoutingEcho {
  return {
    version: r.version,
    grammarVersion: FOLLOWUP_GRAMMAR_VERSION,
    source: r.source,
    rule: r.rule,
    intent: r.intent,
    grammar: r.grammar,
    category: r.category,
    factPack: subjectMoments ? "subject" : r.factPack,
    ...(r.veto ? { veto: r.veto } : {}),
    ...(r.model
      ? {
          model: {
            outcome: r.model.outcome,
            ...(r.model.intent ? { intent: r.model.intent } : {}),
            ...(typeof r.model.confidence === "number"
              ? { confidence: r.model.confidence }
              : {}),
            costUsd: r.model.costUsd,
          },
        }
      : {}),
  };
}
