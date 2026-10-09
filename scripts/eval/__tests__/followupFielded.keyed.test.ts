import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { NextRequest } from "next/server";
import {
  flagsNow,
  recordTurn,
  writeFollowUpResults,
  type FollowUpTurn,
} from "../lib/followUpRecord";
import type { RealFixture } from "../lib/fixtureContract";
import { pctl } from "../replay/oracle";
import { countProseWords } from "@/lib/coach/moment";
import { EVAL_RE, SAN_TOKEN_RE } from "@/lib/contract/followUpReferee";

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
 * Writes scripts/eval/results/followup-fielded-<startedAt>.json through the
 * results contract (scripts/eval/lib/followUpRecord.ts), which the replay
 * gate reads back with no key. With COACH_FOLLOWUP_LEAN=1 in the
 * environment the run is the lean one, recorded as such.
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
/** Moves and evaluations written in the prose (the 3.6 measurement), read as the referee reads them. */
const prose = (s: string) =>
  s.replace(/^\[(?:CONTINUATION|PLAYED):[^\]]*\]$/gm, "");
const words = countProseWords;
const sansOf = (s: string) =>
  Array.from(prose(s).matchAll(SAN_TOKEN_RE)).map((m) => m[0]);
const evalsOf = (s: string) =>
  Array.from(prose(s).matchAll(EVAL_RE)).map((m) => m[0]);
/** The mode a turn ran in, from the flags recorded before it. */
const modeOf = (t: FollowUpTurn) =>
  t.flags.COACH_FOLLOWUP_PROMPT === "fielded" ? "fielded" : "v1";

describe.skipIf(!RUN)("fielded keyed probe (FIELDED_PROBE=1)", () => {
  const turns: FollowUpTurn[] = [];
  let startedAt = "";

  beforeAll(() => {
    startedAt = new Date().toISOString();
    process.env.ANTHROPIC_API_KEY = KEY!;
    process.env.MASTERMIND_VALIDATORS_ENABLED = VALIDATORS ? "true" : "false";
    mockSession.mockResolvedValue({ session: { uid: "probe" } });
  });

  afterAll(() => {
    const summary = Object.fromEntries(
      ["fielded", "v1"].map((mode) => {
        const rows = turns.filter((t) => modeOf(t) === mode);
        const fieldedRows = rows.filter((t) => t.fielded);
        return [
          mode,
          {
            answers: rows.length,
            fielded: fieldedRows.length,
            v1Fallback: fieldedRows.filter(
              (t) => t.fielded?.served === "v1_fallback"
            ).length,
            regenerated: fieldedRows.filter((t) => t.fielded?.retryCount === 1)
              .length,
            clauses: fieldedRows.reduce(
              (n, t) => n + Number(t.fielded?.clauses ?? 0),
              0
            ),
            referee: rows.reduce((n, t) => n + t.refereeDrops.length, 0),
            sanInProse: rows.reduce((n, t) => n + sansOf(t.served).length, 0),
            evalsInProse: rows.reduce(
              (n, t) => n + evalsOf(t.served).length,
              0
            ),
            medianWords: pctl(
              rows.map((t) => words(t.served)),
              0.5
            ),
            medianMs: pctl(
              rows.map((t) => t.harnessMs),
              0.5
            ),
          },
        ];
      })
    );
    const out = writeFollowUpResults("followup-fielded", startedAt, turns, {
      summary,
    });
    if (out) console.log(`wrote ${out}`);
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
        ) as RealFixture;
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
            const flags = flagsNow();
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
            const turn = recordTurn({
              probe: "followup-fielded",
              seq: turns.length + 1,
              fixture,
              fx,
              playerColor,
              moveIndex: fx.moveHistory.length,
              question: q,
              kind,
              flags,
              status: res.status,
              json,
              logged,
              harnessMs: Date.now() - t0,
            });
            turns.push(turn);
            const answer = turn.served;
            const drops = turn.refereeDrops;
            const counter = turn.fielded;
            const row = { words: words(answer) };
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
