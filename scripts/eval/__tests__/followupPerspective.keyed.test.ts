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

/**
 * Keyed probe for PR 2.5 (perspective): does the coach answer a turn about
 * the other side about that side, with the player still "you", and does
 * the referee delete nothing it was given?
 *
 * Drives the REAL chat route with the REAL provider (fast tier), the real
 * referee and the real facts, only the session and the context cache
 * stubbed, over real fixtures, each question asked with COACH_PERSPECTIVE
 * on and off. Validators are off so every drop is the referee's.
 *
 * Skipped unless PERSPECTIVE_PROBE=1 and an ANTHROPIC_API_KEY is in the
 * environment or .env.local. A reading harness, not a gate: n is small,
 * the slip counter is a heuristic, and the results file is for a person.
 *
 *   PERSPECTIVE_PROBE=1 npx vitest run scripts/eval/__tests__/followupPerspective.keyed.test.ts
 *
 * Writes scripts/eval/results/followup-perspective-<startedAt>.json through
 * the results contract (scripts/eval/lib/followUpRecord.ts), which the
 * replay gate reads back with no key.
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
const RUN = process.env.PERSPECTIVE_PROBE === "1" && !!KEY;

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
    extractRequestId: () => "perspective-probe",
    logErrorToSentry: vi.fn(),
  };
});

interface Case {
  fixture: string;
  /** The player's side, as the review confirmed it. */
  player: "white" | "black";
  question: string;
  perspective?: "w" | "b";
  history?: { role: "user" | "assistant"; content: string }[];
}

// Each rule the resolver reads, both player colours, and the field and
// history paths. Fixture 07: Black's 7... Qxc1, White's 8. Nc7+.
const CASES: Case[] = [
  {
    fixture: "07_knight_fork",
    player: "white",
    question: "From Black's side, what went wrong?",
  },
  {
    fixture: "07_knight_fork",
    player: "white",
    question: "What was my opponent thinking with Qxc1?",
  },
  {
    fixture: "07_knight_fork",
    player: "white",
    question: "How should Black have played?",
  },
  {
    fixture: "07_knight_fork",
    player: "white",
    question: "What was Black's worst move?",
  },
  {
    fixture: "07_knight_fork",
    player: "white",
    question: "Why was Black's move 7 bad?",
  },
  {
    fixture: "07_knight_fork",
    player: "white",
    question: "Why was move 7 bad?",
    perspective: "b",
  },
  {
    fixture: "07_knight_fork",
    player: "white",
    question: "And what about move 8?",
    history: [
      { role: "user", content: "From Black's side, what went wrong?" },
      {
        role: "assistant",
        content: "Black grabbed one pawn too many with the queen.",
      },
    ],
  },
  {
    fixture: "07_knight_fork",
    player: "black",
    question: "From White's side, where did White go wrong?",
  },
  {
    fixture: "05_long_game_six_mistakes",
    player: "white",
    question: "What was my opponent's biggest mistake?",
  },
  {
    fixture: "05_long_game_six_mistakes",
    player: "black",
    question: "Through my opponent's eyes, what went wrong?",
  },
];

/** "your queen", "your 12th move", "your 7... Qxc1", "you took": a heuristic for slips about the subject. */
const SLIP_RE =
  /\byour\s+(?:queen|rook|bishop|knight|king|pawn|pieces?|\d+(?:st|nd|rd|th)\s+move|\d+\.{1,3}\s*\S+)|\byou\s+(?:took|captured|grabbed|played|moved|blundered)\b/gi;
const words = (s: string) =>
  s
    .replace(/^\[(?:CONTINUATION|PLAYED):[^\]]*\]$/gm, "")
    .split(/\s+/)
    .filter(Boolean).length;

describe.skipIf(!RUN)("perspective keyed probe (PERSPECTIVE_PROBE=1)", () => {
  const turns: FollowUpTurn[] = [];
  let startedAt = "";

  beforeAll(() => {
    startedAt = new Date().toISOString();
    process.env.ANTHROPIC_API_KEY = KEY!;
    process.env.MASTERMIND_VALIDATORS_ENABLED = "false";
    mockSession.mockResolvedValue({ session: { uid: "probe" } });
  });

  afterAll(() => {
    const on = turns.filter((t) => t.flags.COACH_PERSPECTIVE === "1");
    const out = writeFollowUpResults("followup-perspective", startedAt, turns, {
      summary: {
        answers: turns.length,
        slipsOn: on.reduce(
          (n, t) => n + Array.from(t.served.matchAll(SLIP_RE)).length,
          0
        ),
        dropsOn: on.reduce((n, t) => n + t.refereeDrops.length, 0),
        overBudgetOn: on.filter((t) => words(t.served) > 110).length,
      },
    });
    if (out) console.log(`wrote ${out}`);
  });

  it(
    "asks every case with the flag on and off",
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

      for (const c of CASES) {
        const fx = JSON.parse(
          fs.readFileSync(
            path.join(
              REPO_ROOT,
              `src/lib/contract/__tests__/fixtures-real/${c.fixture}.json`
            ),
            "utf8"
          )
        ) as RealFixture;
        const playerColor = c.player === "white" ? "w" : "b";
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
          playerColorName: c.player,
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

        for (const arm of ["on", "off"] as const) {
          process.env.COACH_PERSPECTIVE = arm === "on" ? "1" : "";
          logged.length = 0;
          const flags = flagsNow();
          const t0 = Date.now();
          const res = await POST(
            new NextRequest("http://x/api/chat", {
              method: "POST",
              body: JSON.stringify({
                contextId: "probe",
                userMessage: c.question,
                moveIndex: fx.moveHistory.length,
                ...(c.perspective ? { perspective: c.perspective } : {}),
                ...(c.history ? { conversationHistory: c.history } : {}),
              }),
              headers: { "Content-Type": "application/json" },
            })
          );
          const json = await res.json();
          const turn = recordTurn({
            probe: "followup-perspective",
            seq: turns.length + 1,
            fixture: c.fixture,
            fx,
            playerColor,
            moveIndex: fx.moveHistory.length,
            question: c.question,
            kind: "perspective",
            request: {
              perspective: c.perspective,
              conversationHistory: c.history,
            },
            flags,
            status: res.status,
            json,
            logged,
            harnessMs: Date.now() - t0,
          });
          turns.push(turn);
          const answer = turn.served;
          const drops = turn.refereeDrops;
          const row = {
            words: words(answer),
            slips: Array.from(answer.matchAll(SLIP_RE)).map((m) => m[0]),
          };
          console.log(
            `\n===== ${c.fixture} | ${c.player} | ${arm.toUpperCase()} | ${c.question}\n${answer}\n-- words ${row.words} | slips ${row.slips.length} | drops ${drops.join(",") || "none"}`
          );
          expect(res.status).toBe(200);
        }
      }
    },
    15 * 60 * 1000
  );
});
