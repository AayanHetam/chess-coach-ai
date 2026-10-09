/**
 * The live rules' coverage over the sixty-question fixture (pathway PR
 * 3.4), with no key and no model: every question the page writes is routed
 * by rule, every rule-routed row gets its exact row, the rules never claim
 * a row they leave to the router, and the two false-positive classes (an
 * order read from a question, a concept read from a question about the
 * board) never reach an order, a setting or the no-board grammar.
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { resolveQuestionAnchor } from "../questionAnchor";
import { intentFromModel, resolveLiveIntent } from "../intentRules";
import { finishTurnRoute, INTENT_TABLE } from "../intentTable";
import type { QuestionIntent } from "../questionIntent";
import type { RouterOutcome } from "@/lib/mastermind/categorization/intentRouter";

interface Row {
  id: number;
  q: string;
  origin: "ui:strip" | "ui:pill" | "ui:takeover" | "ui:masters" | "typed";
  fp?: "order" | "scope";
  moveIndex: number;
  expect: {
    rule: string | null;
    intent: QuestionIntent;
    accept?: QuestionIntent[];
    grammar: string;
    category: string;
  };
}

const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/intent-60.json"), "utf8")
) as { fixture: string; playerColor: "w" | "b"; rows: Row[] };
const GAME = JSON.parse(
  fs.readFileSync(
    path.join(
      process.cwd(),
      `src/lib/contract/__tests__/fixtures-real/${FIXTURE.fixture}.json`
    ),
    "utf8"
  )
) as { moveHistory: string[] };
const MOVES = GAME.moveHistory;
const ROWS = FIXTURE.rows;
const COLOR = FIXTURE.playerColor;

/** The rules' count over the fixture. A rise is a deliberate re-pin. */
const RULE_ROUTED = 43;

function anchorOf(r: Row) {
  return resolveQuestionAnchor(r.q, MOVES, COLOR, r.moveIndex);
}

function liveOf(r: Row, anchored = true) {
  const anchor = anchored ? anchorOf(r) : null;
  return {
    anchor,
    live: resolveLiveIntent(r.q, { anchor, moves: MOVES, playerColor: COLOR }),
  };
}

function routeOf(r: Row, model: RouterOutcome | null = null) {
  const { anchor, live } = liveOf(r);
  return finishTurnRoute({ live, model, question: r.q, anchored: !!anchor });
}

const ok = (intent: QuestionIntent): RouterOutcome => ({
  outcome: "ok",
  intent,
  confidence: 0.9,
  ms: 1,
  costUsd: 0,
});

describe("the sixty questions, by rule", () => {
  it("holds sixty rows with distinct ids", () => {
    expect(ROWS).toHaveLength(60);
    expect(new Set(ROWS.map((r) => r.id)).size).toBe(60);
  });

  it("every question the page writes is routed by rule, with its anchor and without one", () => {
    const ui = ROWS.filter((r) => r.origin.startsWith("ui:"));
    expect(ui.length).toBe(20);
    for (const r of ui) {
      expect(r.expect.rule, `#${r.id}`).not.toBeNull();
      for (const anchored of [true, false]) {
        const { live } = liveOf(r, anchored);
        expect(
          { source: live.source, rule: live.rule, intent: live.intent },
          `#${r.id} ${anchored ? "anchored" : "no anchor"}`
        ).toEqual({
          source: "rule",
          rule: r.expect.rule,
          intent: r.expect.intent,
        });
      }
    }
  });

  it("every row with a rule gets its exact rule, intent, grammar and category", () => {
    for (const r of ROWS.filter((x) => x.expect.rule !== null)) {
      const t = routeOf(r);
      expect(
        {
          source: t.source,
          rule: t.rule,
          intent: t.intent,
          grammar: t.grammar,
          category: t.category,
        },
        `#${r.id} ${r.q}`
      ).toEqual({
        source: "rule",
        rule: r.expect.rule,
        intent: r.expect.intent,
        grammar: r.expect.grammar,
        category: r.expect.category,
      });
    }
  });

  it("a row left to the router is never claimed by a rule", () => {
    for (const r of ROWS.filter((x) => x.expect.rule === null)) {
      const { anchor, live } = liveOf(r);
      expect(live.source, `#${r.id} ${r.q}`).toBe("none");
      expect(live.rule, `#${r.id}`).toBe("none");
      expect(anchor, `#${r.id}`).toBeNull();
    }
  });

  it("no false-positive row is an order, a setting or a concept, or loses the board", () => {
    const fp = ROWS.filter((r) => r.fp);
    expect(fp.length).toBe(14);
    for (const r of fp) {
      const models: (RouterOutcome | null)[] = [
        null,
        ...(r.expect.accept ?? []).map(ok),
      ];
      for (const model of models) {
        const t = routeOf(r, model);
        const label = `#${r.id} ${r.q} (${model?.intent ?? "rules"})`;
        expect(["action", "preference", "concept"], label).not.toContain(
          t.intent
        );
        expect(t.grammar, label).toBe("one_move");
      }
    }
  });

  it(`routes exactly ${RULE_ROUTED} of the sixty by rule`, () => {
    const ruled = ROWS.filter((r) => liveOf(r).live.source === "rule").length;
    expect(
      ruled,
      ruled > RULE_ROUTED
        ? `The rules now route ${ruled} rows: re-pin RULE_ROUTED and the fixture's rules on purpose.`
        : `The rules route ${ruled} rows, fewer than ${RULE_ROUTED}: a rule stopped matching.`
    ).toBe(RULE_ROUTED);
    expect(ROWS.filter((r) => r.expect.rule !== null).length).toBe(RULE_ROUTED);
  });

  // The first accepted label is the expected row. A later one shares its
  // grammar and category, unless the table sets it aside (an order the
  // router named), which is the unknown row.
  it("each accepted router label gives the expected grammar and category", () => {
    for (const r of ROWS.filter((x) => x.expect.rule === null)) {
      const accept = r.expect.accept ?? [];
      expect(accept.length, `#${r.id}`).toBeGreaterThan(0);
      for (let i = 0; i < accept.length; i++) {
        const label = accept[i];
        const t = routeOf(r, ok(label));
        const read = intentFromModel(label, r.q);
        const tag = `#${r.id} ${r.q} as ${label}`;
        expect(t.source, tag).toBe("model");
        expect(t.intent, tag).toBe(read.intent);
        expect(t.grammar, tag).toBe(r.expect.grammar);
        if (i === 0) expect(t.intent, tag).toBe(r.expect.intent);
        if (i > 0 && read.overridden && read.intent !== r.expect.intent) {
          expect(t.intent, tag).toBe("unknown");
          expect(t.category, tag).toBe(INTENT_TABLE.unknown.category);
        } else expect(t.category, tag).toBe(r.expect.category);
      }
    }
  });

  it("prints the per-intent coverage table", () => {
    const table: Record<string, { rule: number; router: number }> = {};
    for (const r of ROWS) {
      const k = r.expect.rule === null ? r.expect.accept![0] : r.expect.intent;
      table[k] ??= { rule: 0, router: 0 };
      if (r.expect.rule === null) table[k].router += 1;
      else table[k].rule += 1;
    }
    for (const k of Object.keys(table))
      expect(INTENT_TABLE[k as QuestionIntent]).toBeDefined();
    console.table(table);
  });
});
