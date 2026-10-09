/**
 * The per-intent table and the turn route it gives (pathway PR 3.4).
 */
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_LOW_CONFIDENCE_CATEGORY } from "@/lib/mastermind/categorization/categoryClassifier";
import type { RouterOutcome } from "@/lib/mastermind/categorization/intentRouter";
import { POSITION_ANCHORED_VALIDATOR_CATEGORIES } from "@/lib/mastermind/validators";
import {
  finishTurnRoute,
  FOLLOWUP_GRAMMAR_VERSION,
  INTENT_ROUTER_VERSION,
  INTENT_TABLE,
  isIntentRouterEnabled,
  routingEcho,
  servesTemplate,
  type TurnRoute,
} from "../intentTable";
import type { LiveIntent } from "../intentRules";
import { PAGE_TURN_KINDS } from "../pageActions";
import { QUESTION_INTENTS, type QuestionIntent } from "../questionIntent";

const NONE: LiveIntent = { intent: "unknown", rule: "none", source: "none" };
const ruled = (intent: QuestionIntent, rule: string): LiveIntent => ({
  intent,
  rule,
  source: "rule",
});
const ok = (intent: QuestionIntent, confidence = 0.9): RouterOutcome => ({
  outcome: "ok",
  intent,
  confidence,
  ms: 210,
  costUsd: 0.0006,
  provider: "anthropic",
});

describe("the table", () => {
  it("every intent has a row", () => {
    expect(Object.keys(INTENT_TABLE).sort()).toEqual(
      [...QUESTION_INTENTS].sort()
    );
  });

  it("only plan maps into the position-anchored validator categories", () => {
    const anchored = QUESTION_INTENTS.filter((i) =>
      POSITION_ANCHORED_VALIDATOR_CATEGORIES.has(INTENT_TABLE[i].category)
    );
    expect(anchored).toEqual(["plan"]);
  });

  it("every acknowledgement row has a capability or is the greeting", () => {
    for (const i of QUESTION_INTENTS) {
      const row = INTENT_TABLE[i];
      if (row.grammar !== "acknowledgement") {
        expect(row.capability, i).toBeUndefined();
        continue;
      }
      if (i === "greeting") expect(row.capability).toBeUndefined();
      else expect(row.capability, i).toBe(i);
    }
  });

  it("allowed actions are page kinds, and only on rows the page serves", () => {
    for (const i of QUESTION_INTENTS) {
      const row = INTENT_TABLE[i];
      for (const k of row.allowedActions) expect(PAGE_TURN_KINDS).toContain(k);
      if (!row.servedByPage) expect(row.allowedActions, i).toEqual([]);
    }
    expect(
      [
        ...INTENT_TABLE.action.allowedActions,
        ...INTENT_TABLE.preference.allowedActions,
      ].sort()
    ).toEqual([...PAGE_TURN_KINDS].sort());
  });

  it("unknown is the classifier's own failure default", () => {
    expect(INTENT_TABLE.unknown.category).toBe(DEFAULT_LOW_CONFIDENCE_CATEGORY);
    expect(INTENT_TABLE.unknown.grammar).toBe("one_move");
  });

  it("concept is the one no-board row, and the budgets follow the grammars", () => {
    for (const i of QUESTION_INTENTS) {
      const row = INTENT_TABLE[i];
      expect(row.grammar === "no_board", i).toBe(i === "concept");
      expect(row.factPack === "reference", i).toBe(i === "concept");
      const budget =
        row.grammar === "one_move"
          ? "v1"
          : row.grammar === "no_board"
            ? "words"
            : "openingWords";
      expect(row.budget, i).toBe(budget);
    }
  });
});

describe("finishTurnRoute", () => {
  it("a rule decides with confidence 1 and its own id", () => {
    const r = finishTurnRoute({
      live: ruled("concept", "concept"),
      model: null,
      question: "What is a minority attack?",
      anchored: false,
    });
    expect(r).toMatchObject({
      version: INTENT_ROUTER_VERSION,
      source: "rule",
      rule: "concept",
      intent: "concept",
      grammar: "no_board",
      category: "concept_explanation",
      confidence: 1,
      factPack: "reference",
    });
    expect(r.row).toBe(INTENT_TABLE.concept);
    expect(r.model).toBeUndefined();
  });

  it("an anchored turn is always one move, with the anchor's facts", () => {
    for (const i of QUESTION_INTENTS) {
      const r = finishTurnRoute({
        live: ruled(i, "x"),
        model: null,
        question: "q",
        anchored: true,
      });
      expect(r.grammar, i).toBe("one_move");
      expect(r.factPack, i).toBe("anchor");
      expect(r.capability, i).toBeUndefined();
      expect(r.category, i).toBe(INTENT_TABLE[i].category);
    }
  });

  it("a mode entry carries its capability, a greeting none", () => {
    expect(
      finishTurnRoute({
        live: ruled("quiz", "quiz"),
        model: null,
        question: "Test me",
        anchored: false,
      })
    ).toMatchObject({ grammar: "acknowledgement", capability: "quiz" });
    const g = finishTurnRoute({
      live: ruled("greeting", "greeting"),
      model: null,
      question: "thanks!",
      anchored: false,
    });
    expect(g.grammar).toBe("acknowledgement");
    expect(g.capability).toBeUndefined();
  });

  it("the router's ok names the rule and the confidence", () => {
    const r = finishTurnRoute({
      live: NONE,
      model: ok("plan", 0.8),
      question: "is my king safe?",
      anchored: false,
    });
    expect(r).toMatchObject({
      source: "model",
      rule: "model:plan",
      intent: "plan",
      confidence: 0.8,
      category: "position_analysis",
      grammar: "one_move",
      factPack: "board",
    });
    expect(r.model).toEqual(ok("plan", 0.8));
  });

  it("the router's order or setting is the unknown row", () => {
    for (const intent of ["action", "preference"] as const) {
      const r = finishTurnRoute({
        live: NONE,
        model: ok(intent),
        question: "next move?",
        anchored: false,
      });
      expect(r).toMatchObject({
        source: "model",
        rule: `model:${intent}`,
        intent: "unknown",
        grammar: "one_move",
        category: "meta_motivational",
      });
      expect(r.veto).toBeUndefined();
    }
  });

  it("the router's concept beside a board word is the unknown row, with the veto", () => {
    const r = finishTurnRoute({
      live: NONE,
      model: ok("concept"),
      question: "why are doubled pawns bad?",
      anchored: false,
    });
    expect(r).toMatchObject({
      intent: "unknown",
      rule: "model:concept",
      grammar: "one_move",
      veto: "concept_on_board",
    });
    expect(
      finishTurnRoute({
        live: NONE,
        model: ok("concept"),
        question: "What is an outpost?",
        anchored: false,
      })
    ).toMatchObject({ intent: "concept", grammar: "no_board" });
  });

  it("the rules' veto rides along whatever the router says", () => {
    const vetoed: LiveIntent = { ...NONE, veto: "concept_on_board" };
    expect(
      finishTurnRoute({
        live: vetoed,
        model: ok("plan"),
        question: "what's a pin in this position?",
        anchored: false,
      })
    ).toMatchObject({ intent: "plan", veto: "concept_on_board" });
    expect(
      finishTurnRoute({
        live: vetoed,
        model: { outcome: "timeout", ms: 1500, costUsd: 0 },
        question: "what's a pin in this position?",
        anchored: false,
      })
    ).toMatchObject({ intent: "unknown", veto: "concept_on_board" });
  });

  it.each(["low_confidence", "invalid", "timeout", "threw"] as const)(
    "a router %s is the default row",
    (outcome) => {
      const model: RouterOutcome = {
        outcome,
        ...(outcome === "low_confidence"
          ? { intent: "plan" as const, confidence: 0.3 }
          : {}),
        ms: 40,
        costUsd: 0,
      };
      const r = finishTurnRoute({
        live: NONE,
        model,
        question: "hmm",
        anchored: false,
      });
      expect(r).toMatchObject({
        source: "default",
        rule: `model_${outcome}`,
        intent: "unknown",
        grammar: "one_move",
        category: DEFAULT_LOW_CONFIDENCE_CATEGORY,
        confidence: 0,
        factPack: "board",
      });
      expect(r.model).toBe(model);
    }
  );

  it("no router asked (an empty question) is the default row with no rule", () => {
    expect(
      finishTurnRoute({
        live: NONE,
        model: null,
        question: "",
        anchored: false,
      })
    ).toMatchObject({ source: "default", rule: "none", intent: "unknown" });
  });
});

describe("servesTemplate", () => {
  const route = (live: LiveIntent, anchored = false): TurnRoute =>
    finishTurnRoute({ live, model: null, question: "q", anchored });
  const oneMove = route(ruled("verdict", "verdict:anchor"), true);

  it("a one-move turn with an eval may be served the template", () => {
    expect(servesTemplate(oneMove, { cp: -211 })).toBe(true);
    expect(servesTemplate(oneMove, { cp: 0 })).toBe(true);
    expect(servesTemplate(oneMove, { mate: 3 })).toBe(true);
  });

  it("never without an eval, so nothing says balanced", () => {
    // The engine's timeout sentinel: a number, but no search behind it.
    expect(servesTemplate(oneMove, { cp: 0, depth: 0 })).toBe(false);
    expect(servesTemplate(oneMove, { cp: -211, depth: 16 })).toBe(true);
    expect(servesTemplate(oneMove, {})).toBe(false);
    expect(servesTemplate(oneMove, { cp: null })).toBe(false);
    expect(servesTemplate(oneMove, { cp: null, mate: null })).toBe(false);
  });

  it("never on a turn that is not about one move", () => {
    expect(servesTemplate(route(ruled("concept", "concept")), { cp: 30 })).toBe(
      false
    );
    expect(
      servesTemplate(route(ruled("greeting", "greeting")), { cp: 30 })
    ).toBe(false);
    expect(servesTemplate(route(ruled("try_it", "try_it")), { mate: 2 })).toBe(
      false
    );
  });
});

describe("routingEcho", () => {
  it("carries what decided the turn and nothing of its content", () => {
    const r = finishTurnRoute({
      live: { ...NONE, veto: "concept_on_board" },
      model: ok("plan", 0.62),
      question: "what's a pin in this position?",
      anchored: false,
    });
    expect(routingEcho(r, false)).toEqual({
      version: "router-1",
      grammarVersion: FOLLOWUP_GRAMMAR_VERSION,
      source: "model",
      rule: "model:plan",
      intent: "plan",
      grammar: "one_move",
      category: "position_analysis",
      factPack: "board",
      veto: "concept_on_board",
      model: {
        outcome: "ok",
        intent: "plan",
        confidence: 0.62,
        costUsd: 0.0006,
      },
    });
  });

  it("a rule-routed turn has no model, and the subject moments name the fact pack", () => {
    const r = finishTurnRoute({
      live: ruled("perspective", "perspective:side"),
      model: null,
      question: "from Black's side, what went wrong?",
      anchored: false,
    });
    const echo = routingEcho(r, true);
    expect(echo.factPack).toBe("subject");
    expect(echo).not.toHaveProperty("model");
    expect(echo).not.toHaveProperty("veto");
    expect(routingEcho(r, false).factPack).toBe("board");
  });

  it("a failed router echoes its outcome and cost alone", () => {
    const r = finishTurnRoute({
      live: NONE,
      model: { outcome: "invalid", ms: 90, costUsd: 0.0004 },
      question: "hmm",
      anchored: false,
    });
    expect(routingEcho(r, false).model).toEqual({
      outcome: "invalid",
      costUsd: 0.0004,
    });
  });
});

describe("isIntentRouterEnabled", () => {
  const prior = process.env.COACH_INTENT_ROUTER;
  afterEach(() => {
    if (prior === undefined) delete process.env.COACH_INTENT_ROUTER;
    else process.env.COACH_INTENT_ROUTER = prior;
  });

  it.each([
    [undefined, false],
    ["", false],
    ["0", false],
    ["off", false],
    ["yes", false],
    ["1", true],
    ["on", true],
    ["true", true],
    [" TRUE ", true],
  ])("%s reads %s", (value, on) => {
    if (value === undefined) delete process.env.COACH_INTENT_ROUTER;
    else process.env.COACH_INTENT_ROUTER = value;
    expect(isIntentRouterEnabled()).toBe(on);
  });
});
