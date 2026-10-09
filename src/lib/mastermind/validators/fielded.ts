/**
 * The validators a fielded follow-up runs (pathway 3.1), beside the moment
 * checks (lib/coach/momentChecks.ts), which do the eval and the feature
 * parsers' work on fields: a fielded answer has no evaluation and no move
 * of a line in its prose, so neither parser is called.
 *
 * - `fieldedProseValidator`: the user-history and scout citation checks
 *   over the served prose, when their data is present. Their spans go to
 *   the referee, which drops the sentence each one is about. A parser that
 *   throws is no verdict, never a failed turn.
 * - `relationalShadow`: the relational parser over the two prose lines,
 *   counted and never acted on (the arming rule: a check acts only once a
 *   measurement says it is right), run after the response.
 *
 * `index.ts` is not touched: these call the validators it already exports.
 */
import { after } from "next/server";
import type { ValidatorDataSources } from "./index";
import type { ParserCall } from "./evalClaim";
import { validateRelationalClaim } from "./relationalClaim";
import { validateScoutCitation } from "./scoutCitation";
import { validateUserHistoryCitation } from "./userHistoryCitation";
import type { ValidatorResult } from "./types";

const NO_VERDICT: ValidatorResult = {
  issues: [],
  passed: true,
  telemetry: [],
  costUsd: 0,
};

/** The prose validator for a fielded turn, or undefined when it has nothing to check against. */
export function fieldedProseValidator(o: {
  dataSources: ValidatorDataSources;
  correlationId: string;
  parseCall?: ParserCall;
}):
  | ((text: string, signal?: AbortSignal) => Promise<ValidatorResult>)
  | undefined {
  const { scout, userHistory } = o.dataSources;
  if (!scout && !userHistory) return undefined;
  return async (text, signal) => {
    const runs: Promise<ValidatorResult>[] = [];
    if (userHistory)
      runs.push(
        validateUserHistoryCitation({
          llmResponse: text,
          games: userHistory.games,
          userName: userHistory.userName,
          nowMs: userHistory.nowMs,
          correlationId: o.correlationId,
          parseCall: o.parseCall,
          signal,
        }).catch(() => NO_VERDICT)
      );
    if (scout)
      runs.push(
        validateScoutCitation({
          llmResponse: text,
          scout: scout.scout,
          collisions: scout.collisions,
          opponentUsername: scout.opponentUsername,
          primaryTimeClass: scout.primaryTimeClass,
          correlationId: o.correlationId,
          parseCall: o.parseCall,
          signal,
        }).catch(() => NO_VERDICT)
      );
    const results = await Promise.all(runs);
    const issues = results.flatMap((r) => r.issues);
    return {
      issues,
      passed: issues.every((i) => i.severity !== "error"),
      telemetry: results.flatMap((r) => r.telemetry),
      costUsd: results.reduce((sum, r) => sum + r.costUsd, 0),
    };
  };
}

/** What the relational shadow saw: counts only, never a span or a board. */
export interface RelationalShadowResult {
  contradicted: { idea: number; happens: number; unmapped: number };
  /** Claims the parser checked, when it said so. */
  checked: number | null;
  parserFailed: boolean;
  costUsd: number;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** The relational parser over the idea and what happens, counted by field. */
export async function relationalShadow(o: {
  idea: string;
  happens: string;
  fen: string;
  correlationId: string;
  parseCall?: ParserCall;
}): Promise<RelationalShadowResult> {
  const result = await validateRelationalClaim({
    llmResponse: `${o.idea}\n${o.happens}`,
    fen: o.fen,
    correlationId: o.correlationId,
    parseCall: o.parseCall,
    signal: AbortSignal.timeout(10_000),
  });
  const contradicted = { idea: 0, happens: 0, unmapped: 0 };
  const idea = norm(o.idea);
  const happens = norm(o.happens);
  for (const issue of result.issues) {
    const span = norm(issue.llm_span ?? "");
    if (span && idea.includes(span)) contradicted.idea += 1;
    else if (span && happens.includes(span)) contradicted.happens += 1;
    else contradicted.unmapped += 1;
  }
  const passedEvent = result.telemetry.find(
    (t) => t.check_name === "relational_claim" && t.fire_reason === "passed"
  );
  const checkedRaw = (passedEvent?.actual as { claims_checked?: unknown })
    ?.claims_checked;
  return {
    contradicted,
    checked: typeof checkedRaw === "number" ? checkedRaw : null,
    parserFailed: result.telemetry.some(
      (t) => t.fire_reason === "parser_json_invalid"
    ),
    costUsd: result.costUsd,
  };
}

/** `after()` where a request is in flight, a microtask elsewhere (tests, scripts). */
function safeAfter(fn: () => Promise<void> | void): void {
  try {
    after(fn);
  } catch {
    void Promise.resolve()
      .then(fn)
      .catch(() => undefined);
  }
}

/** Run the shadow after the response is sent; it never fails the turn. */
export function deferRelationalShadow(
  o: Parameters<typeof relationalShadow>[0] & {
    onDone: (r: RelationalShadowResult) => void;
  }
): void {
  const { onDone, ...opts } = o;
  safeAfter(() =>
    relationalShadow(opts)
      .then(onDone)
      .catch(() => undefined)
  );
}
