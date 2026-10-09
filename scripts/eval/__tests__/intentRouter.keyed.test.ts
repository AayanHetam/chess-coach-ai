import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { NextRequest } from "next/server";

/**
 * Keyed probe for PR 3.4 (`COACH_INTENT_ROUTER=1`): the router, the
 * classifier it replaces on the chat route, and the route itself, over the
 * sixty-question fixture (src/lib/coach/__tests__/fixtures/intent-60.json,
 * fixture 07), before the flag flips.
 *
 *   1. The router over all sixty: accuracy against `accept` on the rows
 *      left to it, agreement with the rules on the rows a rule reads, p50
 *      and p95 latency, the timeout rate at 1.5 s, and the cost.
 *   2. The real classifier over all sixty: agreement with the table's
 *      category, every disagreement labelled as position-validator coverage
 *      lost or gained.
 *   3. The real route on both validator wings, for the no-board and
 *      acknowledgement rows and four one-move controls: words, whether a
 *      token line was written, referee drops, and which fallback was served.
 *
 * Skipped unless INTENT_ROUTER_PROBE=1 and an ANTHROPIC_API_KEY is in the
 * environment or .env.local. Only the session and the context cache are
 * stubbed. A reading harness, not a gate: the results file is for a
 * person, and its text is the fixture's, never a user's.
 *
 *   INTENT_ROUTER_PROBE=1 npx vitest run scripts/eval/__tests__/intentRouter.keyed.test.ts
 *
 * Writes scripts/eval/results/intent-router-probe-<date>.json. The flag
 * does not flip before that file is committed.
 */

const REPO_ROOT = process.cwd();

function apiKey(): string | null {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    for (const line of fs
      .readFileSync(path.join(REPO_ROOT, ".env.local"), "utf8")
      .split("\n")) {
      if (line.startsWith("ANTHROPIC_API_KEY="))
        return line
          .slice("ANTHROPIC_API_KEY=".length)
          .trim()
          .replace(/^['"]|['"]$/g, "");
    }
  } catch {
    /* no .env.local */
  }
  return null;
}

const KEY = apiKey();
const RUN = process.env.INTENT_ROUTER_PROBE === "1" && !!KEY;

const { mockSession, mockGetAnalysisContext, logged } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockGetAnalysisContext: vi.fn(),
  logged: [] as Array<[string, Record<string, unknown>]>,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mockSession }));
vi.mock("@/lib/analysisContextCache", async (orig) => ({
  ...(await orig<object>()),
  getAnalysisContext: mockGetAnalysisContext,
}));
vi.mock("@/lib/logging", () => {
  const log = {
    debug: vi.fn(),
    info: vi.fn((event: string, data: Record<string, unknown>) =>
      logged.push([event, data])
    ),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return {
    logger: { child: vi.fn(() => log) },
    withRequestContext: (_: string, fn: () => unknown) => fn(),
    extractRequestId: () => "intent-router-probe",
    logErrorToSentry: vi.fn(),
  };
});

interface Row {
  id: number;
  q: string;
  origin: string;
  fp?: string;
  moveIndex: number;
  expect: {
    rule: string | null;
    intent: string;
    accept?: string[];
    grammar: string;
    category: string;
  };
}

const FIXTURE = JSON.parse(
  fs.readFileSync(
    path.join(REPO_ROOT, "src/lib/coach/__tests__/fixtures/intent-60.json"),
    "utf8"
  )
) as { fixture: string; playerColor: "w" | "b"; rows: Row[] };

/** The rows the route is asked: every no-board and acknowledgement row, and four one-move controls. */
const ROUTE_CONTROLS = [2, 38, 49, 53];

const prose = (s: string) =>
  s.replace(/^\[(?:CONTINUATION|PLAYED):[^\]]*\]$/gm, "");
const words = (s: string) => prose(s).split(/\s+/).filter(Boolean).length;
const pctl = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
};

describe.skipIf(!RUN)(
  "intent router keyed probe (INTENT_ROUTER_PROBE=1)",
  () => {
    const router: Record<string, unknown>[] = [];
    const classifier: Record<string, unknown>[] = [];
    const route: Record<string, unknown>[] = [];

    beforeAll(() => {
      process.env.ANTHROPIC_API_KEY = KEY!;
      mockSession.mockResolvedValue({ session: { uid: "probe" } });
    });

    afterAll(() => {
      const date = new Date().toISOString().slice(0, 10);
      const out = path.join(
        REPO_ROOT,
        `scripts/eval/results/intent-router-probe-${date}.json`
      );
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const routerRows = router.filter((r) => r.rule === null);
      const ruleRows = router.filter((r) => r.rule !== null);
      const ms = router.map((r) => r.ms as number);
      const summary = {
        router: {
          rows: router.length,
          accuracyOnRouterRows: `${routerRows.filter((r) => r.accepted).length}/${routerRows.length}`,
          agreementOnRuleRows: `${ruleRows.filter((r) => r.agrees).length}/${ruleRows.length}`,
          p50Ms: pctl(ms, 0.5),
          p95Ms: pctl(ms, 0.95),
          timeoutRate:
            router.filter((r) => r.outcome === "timeout").length /
            Math.max(1, router.length),
          outcomes: router.reduce<Record<string, number>>((o, r) => {
            const k = String(r.outcome);
            o[k] = (o[k] ?? 0) + 1;
            return o;
          }, {}),
          costUsd: router.reduce((n, r) => n + (r.costUsd as number), 0),
        },
        classifier: {
          rows: classifier.length,
          agreesWithTable: classifier.filter((r) => r.agrees).length,
          coverageLost: classifier.filter((r) => r.coverage === "lost").length,
          coverageGained: classifier.filter((r) => r.coverage === "gained")
            .length,
          costUsd: classifier.reduce(
            (n, r) => n + ((r.costUsd as number) ?? 0),
            0
          ),
        },
        route: {
          turns: route.length,
          tokenLines: route.filter((r) => r.tokenLine).length,
          refereeDrops: route.reduce(
            (n, r) => n + (r.drops as unknown[]).length,
            0
          ),
          servedFallback: route.filter((r) => r.servedFallback).length,
        },
      };
      fs.writeFileSync(
        out,
        JSON.stringify(
          {
            date,
            tier: "fast",
            fixture: FIXTURE.fixture,
            summary,
            router,
            classifier,
            route,
          },
          null,
          2
        )
      );
      console.log(`wrote ${out}`);
    });

    it(
      "routes, classifies and answers the sixty",
      async () => {
        const { routeIntentByModel } = await import(
          "@/lib/mastermind/categorization/intentRouter"
        );
        const { classifyQuestion } = await import(
          "@/lib/mastermind/categorization/categoryClassifier"
        );
        const { POSITION_ANCHORED_VALIDATOR_CATEGORIES } = await import(
          "@/lib/mastermind/validators"
        );
        const { intentFromModel } = await import("@/lib/coach/intentRules");
        const { buildCoachContract } = await import("@/lib/contract/builder");
        const { toCompactContract } = await import("@/lib/contract/followUp");
        const { selectCardInsights } = await import(
          "@/lib/prompts/verbalizerPrompt"
        );
        const { getCoachChatSystemPromptParts } = await import(
          "@/lib/prompts/coachChatPrompt"
        );
        const { buildCompactGameContext } = await import(
          "@/lib/coach/compactGameContext"
        );
        const { getFenAtHalfMove } = await import("@/lib/contract/chessFormat");
        const { __resetMastermindEnvCacheForTests } = await import("@/env");
        const { POST } = await import("@/app/api/chat/route");

        // 1. The router, the question alone.
        for (const r of FIXTURE.rows) {
          const o = await routeIntentByModel({ question: r.q });
          const read = o.intent ? intentFromModel(o.intent, r.q).intent : null;
          router.push({
            id: r.id,
            q: r.q,
            rule: r.expect.rule,
            outcome: o.outcome,
            intent: o.intent ?? null,
            confidence: o.confidence ?? null,
            tableIntent: read,
            accepted:
              r.expect.rule === null && o.outcome === "ok" && !!o.intent
                ? (r.expect.accept ?? []).includes(o.intent)
                : null,
            agrees:
              r.expect.rule !== null ? o.intent === r.expect.intent : null,
            ms: o.ms,
            costUsd: o.costUsd,
          });
        }

        // 2. The classifier, against the table's category.
        for (const r of FIXTURE.rows) {
          const c = await classifyQuestion({ question: r.q }).catch((e) => ({
            category: "error" as const,
            confidence: 0,
            rationale: String(e),
            costUsd: 0,
          }));
          const was = POSITION_ANCHORED_VALIDATOR_CATEGORIES.has(
            c.category as never
          );
          const now = POSITION_ANCHORED_VALIDATOR_CATEGORIES.has(
            r.expect.category as never
          );
          classifier.push({
            id: r.id,
            q: r.q,
            classifier: c.category,
            confidence: c.confidence,
            table: r.expect.category,
            agrees: c.category === r.expect.category,
            coverage: was && !now ? "lost" : !was && now ? "gained" : null,
            costUsd: c.costUsd ?? 0,
          });
        }

        // 3. The route, on both wings, under the flag.
        const fx = JSON.parse(
          fs.readFileSync(
            path.join(
              REPO_ROOT,
              `src/lib/contract/__tests__/fixtures-real/${FIXTURE.fixture}.json`
            ),
            "utf8"
          )
        );
        const playerColor = FIXTURE.playerColor;
        const finalFen = getFenAtHalfMove(
          fx.moveHistory,
          fx.moveHistory.length
        );
        const contract = await buildCoachContract({
          moveHistory: fx.moveHistory,
          gameEval: fx.gameEval,
          playerColor,
          username: fx.username,
          userRating: fx.userRating,
          gameHeaders: fx.gameHeaders,
          identity: { fen: finalFen, playerColor },
        });
        const served = selectCardInsights(contract).map((i) => i.factIdPrefix);
        const parts = getCoachChatSystemPromptParts({
          personalityId: "friendly",
          userRating: fx.userRating ?? 1200,
          username: fx.username ?? "probe",
          playerColorName: playerColor === "w" ? "white" : "black",
        });
        mockGetAnalysisContext.mockReturnValue({
          contextId: "probe",
          gameContext: "",
          compactGameContext: buildCompactGameContext(
            fx.moveHistory,
            fx.gameEval,
            playerColor
          ),
          playedMoves: fx.moveHistory,
          systemPrompt: `${parts.stable}\n\n${parts.perUser}`,
          systemPromptStable: parts.stable,
          systemPromptSuffix: parts.perUser,
          fewShotExamples: "",
          fen: finalFen,
          skillLevel: "intermediate",
          playerColor,
          moveCount: Math.ceil(fx.moveHistory.length / 2),
          createdAt: Date.now(),
          initialAnalysis: "Your review is above.",
          gameEval: fx.gameEval,
          compactContract: toCompactContract(contract, served),
        });
        const rows = FIXTURE.rows.filter(
          (r) =>
            r.expect.grammar !== "one_move" || ROUTE_CONTROLS.includes(r.id)
        );
        process.env.COACH_INTENT_ROUTER = "1";
        for (const validators of ["true", "false"]) {
          process.env.MASTERMIND_VALIDATORS_ENABLED = validators;
          __resetMastermindEnvCacheForTests();
          for (const r of rows) {
            logged.length = 0;
            const t0 = Date.now();
            const res = await POST(
              new NextRequest("http://x/api/chat", {
                method: "POST",
                body: JSON.stringify({
                  contextId: "probe",
                  userMessage: r.q,
                  moveIndex: r.moveIndex,
                }),
                headers: { "Content-Type": "application/json" },
              })
            );
            const json = await res.json();
            const answer: string = json.gameAnalysis?.analysis ?? "";
            const row = {
              id: r.id,
              q: r.q,
              validators: validators === "true",
              routing: json.gameAnalysis?.routing ?? null,
              answer,
              words: words(answer),
              tokenLine: /^\[(?:CONTINUATION|PLAYED):/m.test(answer),
              drops: logged
                .filter(([e]) => e === "followup_referee_dropped")
                .flatMap(([, d]) => d.dropped as string[]),
              servedFallback:
                json.gameAnalysis?.pipeline?.servedFallback ?? null,
              category: json.gameAnalysis?.pipeline?.category ?? null,
              elapsedMs: Date.now() - t0,
            };
            route.push(row);
            console.log(
              `\n===== #${r.id} | ${row.validators ? "validators on" : "validators off"} | ${r.q}\n${answer}\n-- words ${row.words} | grammar ${row.routing?.grammar} | drops ${row.drops.join(",") || "none"} | fallback ${row.servedFallback ?? "none"}`
            );
            expect(res.status).toBe(200);
          }
        }
      },
      30 * 60 * 1000
    );
  }
);
