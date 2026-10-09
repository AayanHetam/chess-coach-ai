import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { NextRequest } from "next/server";
import { Chess } from "chess.js";
import {
  flagsNow,
  recordTurn,
  writeFollowUpResults,
  type FollowUpTurn,
} from "../lib/followUpRecord";
import { loadRealFixture, type RealFixture } from "../lib/fixtureContract";
import { pctl } from "../replay/oracle";
import { countProseWords } from "@/lib/coach/moment";
import { EVAL_RE } from "@/lib/contract/followUpReferee";
import {
  compareTwo,
  compareVerdictWords,
  type CompareVerdict,
} from "@/lib/coach/compareVerdict";
import {
  FOLLOWUP_BUDGET,
  FOLLOWUP_LEAN_BUDGET,
} from "@/lib/prompts/followUpPrompt";

/**
 * Keyed probe for pathway 3.5a (`COACH_COMPARE`): a follow-up comparing two
 * moves, answered with the compare's clause, block and reminder, before
 * the server flag flips.
 *
 * Drives the REAL chat route with the REAL provider (fast tier), the real
 * referee and the real anchor block. Only the session and the context
 * cache are stubbed, with COACH_COMPARE, COACH_INTENT_ROUTER and
 * COACH_WHATIF_EVALS on. The two moves' numbers stand in for the client's
 * search: each pair is two lines of the fixture's own multi-line sweep at
 * that position (one search, one depth), sent as a compare payload the
 * route verifies as it would the page's. The pairs: fixture 07's two (8.
 * Qxc1 or 8. Nd6+, and 8. Qxc1 or the game's 8. Nc7+), a Black-to-move
 * pair, a pawn pair and a close pair, each in v1 and lean, each beside the
 * same words with no payload (the control).
 *
 * Counted per answer: both moves named, words, the referee's drops by
 * kind, figures and percentages served, token lines, and whether the
 * preference it states agrees with the block's verdict. The flip criteria
 * are printed in the summary: no disagreement, no figure served, both
 * moves named in every answer, and the median words within the budget's
 * `words`.
 *
 * Skipped unless COMPARE_PROBE=1 and an ANTHROPIC_API_KEY is in the
 * environment or .env.local. COMPARE_PROBE_VALIDATORS=1 runs the
 * validators-on wing. A reading harness, not a gate: its spans are
 * fixtures', never a user's.
 *
 *   COMPARE_PROBE=1 npx vitest run scripts/eval/__tests__/followupCompare.keyed.test.ts
 *
 * Writes scripts/eval/results/followup-compare-<startedAt>.json through the
 * results contract (scripts/eval/lib/followUpRecord.ts), which the replay
 * gate reads back with no key.
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
const RUN = process.env.COMPARE_PROBE === "1" && !!KEY;
const VALIDATORS = process.env.COMPARE_PROBE_VALIDATORS === "1";

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
    extractRequestId: () => "compare-probe",
    logErrorToSentry: vi.fn(),
  };
});

interface Pair {
  name: string;
  fixture: string;
  /** Plies before the position the two moves are played from. */
  index: number;
  /** The two moves, UCI, in the order the question names them. */
  first: string;
  second: string;
  /** The question, as the player would type it. */
  q: string;
}

const PAIRS: Pair[] = [
  {
    name: "07-qxc1-nd6",
    fixture: "07_knight_fork",
    index: 14,
    first: "d1c1",
    second: "b5d6",
    q: "8. Qxc1 or 8. Nd6+?",
  },
  {
    name: "07-qxc1-played",
    fixture: "07_knight_fork",
    index: 14,
    first: "d1c1",
    second: "b5c7",
    q: "8. Qxc1 or 8. Nc7+?",
  },
  {
    name: "black-to-move",
    fixture: "01_mate_for_white_midgame",
    index: 13,
    first: "f7e6",
    second: "f7e7",
    q: "7... Ke6 or 7... Ke7?",
  },
  {
    name: "pawn-pair",
    fixture: "04_invalid_san_truncation",
    index: 4,
    first: "d2d4",
    second: "h2h3",
    q: "d4 or h3 here?",
  },
  {
    name: "close-pair",
    fixture: "08_quiet_positional",
    index: 14,
    first: "c1e3",
    second: "f1e1",
    q: "8. Be3 or 8. Re1?",
  },
];

const prose = (s: string) =>
  s.replace(/^\[(?:CONTINUATION|PLAYED):[^\]]*\]$/gm, "");
const tokenLines = (s: string) =>
  s.split("\n").filter((l) => /^\[(?:CONTINUATION|PLAYED):[^\]]*\]$/.test(l))
    .length;
const figures = (s: string) =>
  Array.from(prose(s).matchAll(EVAL_RE)).length +
  Array.from(prose(s).matchAll(/\d+(?:\.\d+)?\s*%/g)).length;
const bare = (san: string) => san.replace(/[+#!?]/g, "");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The move named in the prose as written, with or without its number. */
const names = (text: string, san: string) =>
  new RegExp(`(?<![A-Za-z0-9])${escape(bare(san))}(?![A-Za-z0-9])`).test(
    prose(text)
  );

type Preference = "copied" | "agrees" | "disagrees" | "absent";

/**
 * Whether the answer's stated preference is the block's: its long words
 * copied, the preferred move named after "prefer", the other named there
 * (or any preference stated where the engine has none), or nothing said.
 */
function preferenceOf(
  served: string,
  v: CompareVerdict,
  long: string,
  sanOf: (uci: string) => string
): Preference {
  const text = prose(served);
  if (text.includes(long)) return "copied";
  const sentences = text.split(/(?<=[.!?])\s+/);
  const says = (re: RegExp) => sentences.some((s) => re.test(s));
  const after = (san: string) =>
    new RegExp(
      `\\bprefer\\w*\\s+(?:\\d+\\s*\\.{1,3}\\s*)?${escape(bare(san))}(?![A-Za-z0-9])`,
      "i"
    );
  if (v.preferred) {
    const other = v.preferred === v.first ? v.second : v.first;
    if (says(after(sanOf(other)))) return "disagrees";
    if (says(after(sanOf(v.preferred)))) return "agrees";
    return "absent";
  }
  if (says(/\bprefer/i)) return "disagrees";
  if (says(/\btoo close\b|\bwinning after either\b|\blosing after either\b/i))
    return "agrees";
  return "absent";
}

describe.skipIf(!RUN)("compare keyed probe (COMPARE_PROBE=1)", () => {
  const turns: FollowUpTurn[] = [];
  const reads: Array<{
    id: string;
    pair: string;
    mode: "v1" | "lean";
    control: boolean;
    bothNamed: boolean;
    words: number;
    figures: number;
    tokenLines: number;
    drops: string[];
    preference: Preference | null;
    verdict: string | null;
  }> = [];
  let startedAt = "";

  beforeAll(() => {
    startedAt = new Date().toISOString();
    process.env.ANTHROPIC_API_KEY = KEY!;
    process.env.MASTERMIND_VALIDATORS_ENABLED = VALIDATORS ? "true" : "false";
    process.env.COACH_COMPARE = "1";
    process.env.COACH_INTENT_ROUTER = "1";
    process.env.COACH_WHATIF_EVALS = "1";
    mockSession.mockResolvedValue({ session: { uid: "probe" } });
  });

  afterAll(() => {
    const summary = Object.fromEntries(
      (["v1", "lean"] as const).map((mode) => {
        const budget = mode === "lean" ? FOLLOWUP_LEAN_BUDGET : FOLLOWUP_BUDGET;
        const rows = reads.filter((r) => r.mode === mode && !r.control);
        const controls = reads.filter((r) => r.mode === mode && r.control);
        const dropsByKind: Record<string, number> = {};
        for (const r of rows)
          for (const d of r.drops) {
            const k = d.split(":")[0];
            dropsByKind[k] = (dropsByKind[k] ?? 0) + 1;
          }
        const pref = (p: Preference) =>
          rows.filter((r) => r.preference === p).length;
        const medianWords = pctl(
          rows.map((r) => r.words),
          0.5
        );
        const out = {
          answers: rows.length,
          bothNamed: rows.filter((r) => r.bothNamed).length,
          medianWords,
          budgetWords: budget.words,
          figures: rows.reduce((n, r) => n + r.figures, 0),
          tokenLines: rows.reduce((n, r) => n + r.tokenLines, 0),
          dropsByKind,
          preference: {
            copied: pref("copied"),
            agrees: pref("agrees"),
            disagrees: pref("disagrees"),
            absent: pref("absent"),
          },
          controls: {
            answers: controls.length,
            medianWords: pctl(
              controls.map((r) => r.words),
              0.5
            ),
          },
        };
        return [
          mode,
          {
            ...out,
            flipReady:
              rows.length > 0 &&
              out.preference.disagrees === 0 &&
              out.figures === 0 &&
              out.bothNamed === rows.length &&
              medianWords !== null &&
              medianWords <= budget.words,
          },
        ];
      })
    );
    console.log(JSON.stringify(summary, null, 2));
    const out = writeFollowUpResults("followup-compare", startedAt, turns, {
      summary,
      extra: { reads },
    });
    if (out) console.log(`wrote ${out}`);
  });

  it(
    "asks every pair with its numbers and without, in v1 and lean",
    async () => {
      const { getCoachChatSystemPromptParts } = await import(
        "@/lib/prompts/coachChatPrompt"
      );
      const { buildCompactGameContext } = await import(
        "@/lib/coach/compactGameContext"
      );
      const { compactForFixture } = await import("../lib/fixtureContract");
      const { getFenAtHalfMove } = await import("@/lib/contract/chessFormat");
      const { __resetMastermindEnvCacheForTests } = await import("@/env");
      const { POST } = await import("@/app/api/chat/route");
      __resetMastermindEnvCacheForTests();

      for (const pair of PAIRS) {
        const fx = loadRealFixture(REPO_ROOT, pair.fixture) as RealFixture;
        const playerColor: "w" | "b" = fx.playerColor === "b" ? "b" : "w";
        const finalFen = getFenAtHalfMove(
          fx.moveHistory,
          fx.moveHistory.length
        );
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
            fx.gameEval as never,
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
          compactContract: await compactForFixture(fx, playerColor),
        });

        // The payload: the two lines of the sweep at that position, and
        // the review's best beside them where it is neither.
        const fen = getFenAtHalfMove(fx.moveHistory, pair.index);
        const lines = fx.gameEval.positions[pair.index].lines;
        const lineOf = (uci: string) => lines.find((l) => l.pv[0] === uci)!;
        const move = (role: string, uci: string) => {
          const l = lineOf(uci);
          return {
            role,
            uci,
            ...(typeof l.mate === "number" ? { mate: l.mate } : { cp: l.cp }),
            depth: l.depth,
            pv: l.pv.slice(0, 8),
          };
        };
        const best = lines[0].pv[0];
        const clientEvals = {
          index: pair.index,
          fen,
          depth: Math.min(...lines.map((l) => l.depth)),
          moves: [
            move("asked", pair.first),
            move("compared", pair.second),
            ...(best !== pair.first && best !== pair.second
              ? [move("best", best)]
              : []),
          ],
        };
        const sanOf = (uci: string) => {
          const g = new Chess(fen);
          return g.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci[4],
          }).san;
        };
        const label = (uci: string) =>
          `${Math.floor(pair.index / 2) + 1}${pair.index % 2 === 0 ? "." : "..."} ${sanOf(uci)}`;
        const verdict = compareTwo(
          { fen, moves: clientEvals.moves },
          pair.first,
          pair.second
        );
        const long = verdict ? compareVerdictWords(verdict, label, "long") : "";

        for (const mode of ["v1", "lean"] as const) {
          process.env.COACH_FOLLOWUP_LEAN = mode === "lean" ? "1" : "";
          for (const control of [false, true]) {
            logged.length = 0;
            const flags = flagsNow();
            const t0 = Date.now();
            const res = await POST(
              new NextRequest("http://x/api/chat", {
                method: "POST",
                body: JSON.stringify({
                  contextId: "probe",
                  userMessage: pair.q,
                  moveIndex: pair.index,
                  ...(control ? {} : { clientEvals }),
                }),
                headers: { "Content-Type": "application/json" },
              })
            );
            const json = await res.json();
            const turn = recordTurn({
              probe: "followup-compare",
              seq: turns.length + 1,
              fixture: pair.fixture,
              fx,
              playerColor,
              moveIndex: pair.index,
              question: pair.q,
              kind: control ? `control:${pair.name}` : `compare:${pair.name}`,
              request: control ? {} : { clientEvals },
              flags,
              status: res.status,
              json,
              logged,
              harnessMs: Date.now() - t0,
            });
            turns.push(turn);
            const served = turn.served;
            const read = {
              id: turn.id,
              pair: pair.name,
              mode,
              control,
              bothNamed:
                names(served, sanOf(pair.first)) &&
                names(served, sanOf(pair.second)),
              words: countProseWords(served),
              figures: figures(served),
              tokenLines: tokenLines(served),
              drops: turn.refereeDrops,
              preference:
                verdict && !control
                  ? preferenceOf(served, verdict, long, sanOf)
                  : null,
              verdict: long || null,
            };
            reads.push(read);
            console.log(
              `\n===== ${pair.name} | ${mode} | ${control ? "CONTROL" : "COMPARE"} | ${pair.q}\n${served}\n-- words ${read.words} | both named ${read.bothNamed} | figures ${read.figures} | tokens ${read.tokenLines} | drops ${read.drops.join(",") || "none"} | preference ${read.preference ?? "n/a"} | clientEvals ${JSON.stringify(turn.echo.clientEvals)}`
            );
            expect(res.status).toBe(200);
            if (!control)
              expect(
                (turn.echo.clientEvals as { compare?: boolean } | null)
                  ?.compare,
                pair.name
              ).toBe(true);
          }
        }
      }
    },
    30 * 60 * 1000
  );
});
