import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { NextRequest } from "next/server";

/**
 * Keyed probe for PR 3.1 (`COACH_FOLLOWUP_PROMPT=fielded`): the fielded
 * follow-up against the v1 prompt on the same turns, before the flag flips.
 *
 * Drives the REAL chat route with the REAL provider (fast tier), the real
 * referee, the real moment checks and the real facts; only the session and
 * the context cache are stubbed. Over real fixtures, it asks every review
 * finding's question, one reply by the opponent, one question about a
 * move's evaluation, a walkthrough and an unanchored question (the two
 * controls, which must be the v1 turn), in both modes.
 *
 * Skipped unless FIELDED_PROBE=1 and an ANTHROPIC_API_KEY is in the
 * environment or .env.local. FIELDED_PROBE_VALIDATORS=1 runs the
 * validators-on wing (the classifier and the relational shadow then cost
 * calls too). A reading harness, not a gate: the results file is for a
 * person, and its spans are fixtures', never a user's.
 *
 *   FIELDED_PROBE=1 npx vitest run scripts/eval/__tests__/followupFielded.keyed.test.ts
 *
 * Writes scripts/eval/results/followup-fielded-probe-<date>.json.
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
const RUN = process.env.FIELDED_PROBE === "1" && !!KEY;
const VALIDATORS = process.env.FIELDED_PROBE_VALIDATORS === "1";

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
    extractRequestId: () => "fielded-probe",
    logErrorToSentry: vi.fn(),
  };
});

const FIXTURES = [
  "07_knight_fork",
  "05_long_game_six_mistakes",
  "10_queenless_endgame",
];

/** A move written as the page writes it: "8. Nc7+", "8... Kd8". */
const label = (index: number, san: string) =>
  `${Math.floor(index / 2) + 1}${index % 2 === 0 ? "." : "..."} ${san}`;
/** Moves and evaluations written in the prose (the 3.6 measurement). */
const SAN_RE =
  /\b(?:\d+\.{1,3}\s*)?(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O(?:-O)?|[a-h]x[a-h][1-8])\b/g;
const EVAL_RE = /(?<![A-Za-z0-9.])[+-]\d+(?:\.\d{1,2})?(?![A-Za-z0-9.%])/g;
const prose = (s: string) =>
  s.replace(/^\[(?:CONTINUATION|PLAYED):[^\]]*\]$/gm, "");
const words = (s: string) => prose(s).split(/\s+/).filter(Boolean).length;

describe.skipIf(!RUN)("fielded keyed probe (FIELDED_PROBE=1)", () => {
  const results: Record<string, unknown>[] = [];

  beforeAll(() => {
    process.env.ANTHROPIC_API_KEY = KEY!;
    process.env.MASTERMIND_VALIDATORS_ENABLED = VALIDATORS ? "true" : "false";
    mockSession.mockResolvedValue({ session: { uid: "probe" } });
  });

  afterAll(() => {
    const date = new Date().toISOString().slice(0, 10);
    const out = path.join(
      REPO_ROOT,
      `scripts/eval/results/followup-fielded-probe-${date}.json`
    );
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const by = (mode: string) => results.filter((r) => r.mode === mode);
    /** How many items the rows hold under `k` (each row's list, counted). */
    const count = (rows: Record<string, unknown>[], k: string) =>
      rows.reduce(
        (n, r) => n + ((r[k] as unknown[] | undefined)?.length ?? 0),
        0
      );
    const summary = Object.fromEntries(
      ["fielded", "v1"].map((mode) => {
        const rows = by(mode);
        const fieldedRows = rows.filter((r) => r.counter);
        return [
          mode,
          {
            answers: rows.length,
            fielded: fieldedRows.length,
            v1Fallback: fieldedRows.filter(
              (r) => (r.counter as { served?: string }).served === "v1_fallback"
            ).length,
            regenerated: fieldedRows.filter(
              (r) => (r.counter as { retryCount?: number }).retryCount === 1
            ).length,
            clauses: fieldedRows.reduce(
              (n, r) =>
                n + Number((r.counter as { clauses?: number }).clauses ?? 0),
              0
            ),
            referee: count(rows, "drops"),
            sanInProse: count(rows, "sans"),
            evalsInProse: count(rows, "evals"),
            medianWords: [...rows.map((r) => r.words as number)].sort(
              (a, b) => a - b
            )[Math.floor(rows.length / 2)],
            medianMs: [...rows.map((r) => r.elapsedMs as number)].sort(
              (a, b) => a - b
            )[Math.floor(rows.length / 2)],
          },
        ];
      })
    );
    fs.writeFileSync(
      out,
      JSON.stringify(
        { date, tier: "fast", validators: VALIDATORS, summary, results },
        null,
        2
      )
    );
    console.log(`wrote ${out}`);
  });

  it(
    "asks every question in fielded and v1",
    async () => {
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
      __resetMastermindEnvCacheForTests();

      for (const fixture of FIXTURES) {
        const fx = JSON.parse(
          fs.readFileSync(
            path.join(
              REPO_ROOT,
              `src/lib/contract/__tests__/fixtures-real/${fixture}.json`
            ),
            "utf8"
          )
        );
        const playerColor: "w" | "b" = fx.playerColor === "b" ? "b" : "w";
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
        const compact = toCompactContract(contract, served);
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
          compactContract: compact,
        });

        // The questions: every finding, the opponent's reply to the first,
        // one evaluation question, and the two controls.
        const questions: { kind: string; q: string }[] = [];
        for (const ins of compact.insights) {
          const index = (ins.moveNumber - 1) * 2 + (ins.color === "w" ? 0 : 1);
          questions.push({
            kind: "finding",
            q: `Why was ${label(index, ins.playedSan)} a mistake?`,
          });
        }
        const first = compact.insights[0];
        if (first) {
          const reply =
            (first.moveNumber - 1) * 2 + (first.color === "w" ? 1 : 2);
          if (fx.moveHistory[reply])
            questions.push({
              kind: "opponent",
              q: `What was the idea behind ${label(reply, fx.moveHistory[reply])}?`,
            });
          const index =
            (first.moveNumber - 1) * 2 + (first.color === "w" ? 0 : 1);
          questions.push({
            kind: "eval",
            q: `What was the eval after ${label(index, first.playedSan)}?`,
          });
          questions.push({
            kind: "walkthrough",
            q: `Walk me through ${label(index, first.playedSan)} step by step.`,
          });
        }
        questions.push({ kind: "unanchored", q: "What should I study next?" });

        for (const { kind, q } of questions) {
          for (const mode of ["fielded", "v1"] as const) {
            process.env.COACH_FOLLOWUP_PROMPT =
              mode === "fielded" ? "fielded" : "";
            logged.length = 0;
            const t0 = Date.now();
            const res = await POST(
              new NextRequest("http://x/api/chat", {
                method: "POST",
                body: JSON.stringify({
                  contextId: "probe",
                  userMessage: q,
                  moveIndex: fx.moveHistory.length,
                }),
                headers: { "Content-Type": "application/json" },
              })
            );
            const json = await res.json();
            const answer: string = json.gameAnalysis?.analysis ?? "";
            const drops = logged
              .filter(([e]) => e === "followup_referee_dropped")
              .flatMap(([, d]) => d.dropped as string[]);
            const counter =
              logged.find(([e]) => e === "followup_fielded")?.[1] ?? null;
            const row = {
              fixture,
              kind,
              question: q,
              mode,
              prompt: json.gameAnalysis?.followUpPrompt,
              anchor: json.gameAnalysis?.anchor ?? null,
              answer,
              words: words(answer),
              sans: Array.from(prose(answer).matchAll(SAN_RE)).map((m) => m[0]),
              evals: Array.from(prose(answer).matchAll(EVAL_RE)).map(
                (m) => m[0]
              ),
              drops,
              counter,
              elapsedMs: Date.now() - t0,
              timing: json.gameAnalysis?.timing ?? null,
            };
            results.push(row);
            console.log(
              `\n===== ${fixture} | ${kind} | ${mode.toUpperCase()} | ${q}\n${answer}\n-- words ${row.words} | drops ${drops.join(",") || "none"} | ${counter ? JSON.stringify({ served: counter.served, parse: counter.parse, retry: counter.retryCount, omitted: counter.omitted }) : "v1"}`
            );
            expect(res.status).toBe(200);
          }
        }
      }
    },
    30 * 60 * 1000
  );
});
