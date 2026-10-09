/**
 * The key-less replay gate (pathway 3.7), in the merge gate: the move
 * oracle, the results contract the keyed probes write through, and the gate
 * itself over synthetic runs and over the repo's own committed corpus, with
 * the network trapped and no key.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getFenAtHalfMove } from "@/lib/contract/chessFormat";
import { verifyClientEvals } from "@/lib/coach/clientEvals";
import { __setFetchForTesting } from "@/lib/grounding/chessdb";
import type { PositionEval } from "@/types/eval";
import { readCsv } from "../lib/csv";
import { loadRealFixture, type RealFixture } from "../lib/fixtureContract";
import {
  FOLLOWUP_RESULTS_SCHEMA,
  RECORDED_FLAGS,
  currentVersions,
  followUpResultsV1,
  followUpTurnV1,
  recordTurn,
  writeFollowUpResults,
  type FollowUpResults,
  type FollowUpTurn,
  type ProbeName,
  type RecordedFlag,
} from "../lib/followUpRecord";
import {
  evalFigures,
  pctl,
  plyTable,
  proofTokens,
  readMoves,
} from "../replay/oracle";
import {
  REPLAY_MANIFEST,
  type Acknowledgement,
  type FlippableFlag,
} from "../replay/manifest";
import {
  installOfflineGuards,
  loadGateInput,
  renderReport,
  runGate,
  type DeclaredRun,
  type GateInput,
  type GateReport,
} from "../replay/gate";

const REPO = process.cwd();
const FX7 = loadRealFixture(REPO, "07_knight_fork")!;
const FX10 = loadRealFixture(REPO, "10_queenless_endgame")!;
const M7 = FX7.moveHistory;
const T7 = plyTable(M7, FX7.gameEval.positions);
const INTENT60 = JSON.parse(
  fs.readFileSync(
    path.join(REPO, "src/lib/coach/__tests__/fixtures/intent-60.json"),
    "utf8"
  )
) as {
  rows: {
    id: number;
    q: string;
    origin: string;
    moveIndex: number;
    expect: { rule: string | null; intent: string; grammar: string };
  }[];
};

const classes = (text: string, t = T7) =>
  readMoves(text, t).map((m) => [m.mention, m.cls]);

// ── Synthetic runs ──────────────────────────────────────────────────────────

function flags(
  set: Partial<Record<RecordedFlag, string>> = {}
): Record<RecordedFlag, string> {
  const f = {} as Record<RecordedFlag, string>;
  for (const k of RECORDED_FLAGS) f[k] = set[k] ?? "";
  return f;
}

interface TurnSpec {
  seq: number;
  probe?: ProbeName;
  served?: string;
  question?: string;
  kind?: string;
  origin?: string;
  validators?: boolean;
  set?: Partial<Record<RecordedFlag, string>>;
  status?: number;
  ga?: Record<string, unknown>;
  pipeline?: Record<string, unknown>;
  fielded?: Record<string, unknown>;
  elapsedMs?: number;
  moveIndex?: number;
  fixture?: string;
  fx?: RealFixture;
}

function turn(s: TurnSpec): FollowUpTurn {
  const validators = s.validators ?? false;
  const ga = {
    analysis: s.served ?? "Calm development keeps the balance.",
    followUpPrompt: "1.3",
    timing: {
      elapsedMs: s.elapsedMs ?? 4000,
      prepMs: validators ? 300 : 0,
      llmMs: 3500,
      refereeMs: 2,
      retryCount: 0,
    },
    ...(validators
      ? {
          pipeline: {
            finalOutcome: "passed_initial",
            retryCount: 0,
            classifierCostUsd: 0,
            servedDraft: false,
            category: "game_review",
            ...s.pipeline,
          },
        }
      : {}),
    ...s.ga,
  };
  return recordTurn({
    probe: s.probe ?? "followup-fielded",
    seq: s.seq,
    fixture: s.fixture ?? "07_knight_fork",
    fx: s.fx ?? FX7,
    playerColor: "w",
    moveIndex: s.moveIndex ?? M7.length,
    question: s.question ?? "Why was 8. Nc7+ a mistake?",
    kind: s.kind ?? "finding",
    ...(s.origin ? { origin: s.origin } : {}),
    flags: flags({
      MASTERMIND_VALIDATORS_ENABLED: validators ? "true" : "false",
      ...s.set,
    }),
    status: s.status ?? 200,
    json: { gameAnalysis: ga },
    logged: s.fielded ? [["followup_fielded", s.fielded]] : [],
    harnessMs: (s.elapsedMs ?? 4000) + 40,
  });
}

function results(
  probe: ProbeName,
  turns: FollowUpTurn[],
  o: {
    startedAt?: string;
    versions?: Partial<FollowUpResults["versions"]>;
  } = {}
): FollowUpResults {
  return followUpResultsV1.parse({
    schema: FOLLOWUP_RESULTS_SCHEMA,
    schemaVersion: 1,
    probe,
    startedAt: o.startedAt ?? "2026-10-09T08:00:00.000Z",
    gitSha: null,
    dirty: null,
    environment: "in-process",
    machine: { platform: "linux", node: "v22.22.0", cpus: 4 },
    tier: "fast",
    versions: { ...currentVersions(), ...o.versions },
    summary: {},
    turns,
  });
}

const declared = (file: string, r: FollowUpResults): DeclaredRun => ({
  file,
  results: r,
});

let base: GateInput;
let guard: ReturnType<typeof installOfflineGuards>;

function withRuns(...runs: DeclaredRun[]): GateInput {
  return { ...base, declared: runs, notRead: [], loadFailures: [] };
}

const failed = (r: GateReport, check: string) =>
  r.failures.filter((f) => f.check === check);

beforeAll(async () => {
  guard = installOfflineGuards();
  base = await loadGateInput({ repoRoot: REPO });
  // The contracts the referee is given are built once here, offline.
  await runGate(base);
}, 120_000);

afterAll(() => {
  // Nothing in this file reached the network.
  expect(guard.attempts).toEqual([]);
  guard.restore();
});

// ── The oracle ──────────────────────────────────────────────────────────────

describe("plyTable", () => {
  it("07: the game board at ply 14 with its computed moves, the board after d1c1 at ply 15", () => {
    const game14 = getFenAtHalfMove(M7, 14);
    expect(T7.boards.get(14)?.has(game14)).toBe(true);
    const edges = T7.edges.get(game14)!;
    expect(edges.has("Nc7")).toBe(true);
    expect(edges.has("Qxc1")).toBe(true);
    expect(edges.has("Nd6")).toBe(true);
    // The board after d1c1 is the next ply's: the one Black's 8th is played on.
    const afterQxc1 = Array.from(T7.boards.get(15)!).find((f) =>
      f.startsWith("r1b1kbnr/pp1ppppp/2n5/1N6/4P3/5N2/P1P2PPP/2Q1KB1R b")
    );
    expect(afterQxc1).toBeDefined();
    expect(T7.edges.get(afterQxc1!)?.has("Rb8")).toBe(true);
    expect(T7.gameReplayed).toBe(true);
  });

  it("04: the game stops at Qxz9, and a move past it is unmeasured, not past", () => {
    const fx = loadRealFixture(REPO, "04_invalid_san_truncation")!;
    const t = plyTable(fx.moveHistory, fx.gameEval.positions);
    expect(t.gameReplayed).toBe(false);
    expect(classes("25. Kf2 is no move of this game.", t)).toEqual([
      ["25. Kf2", "unmeasured"],
    ]);
  });

  it("03: the depth-0 sentinel adds no board", () => {
    const fx = loadRealFixture(REPO, "03_sentinel_timeout")!;
    const positions = fx.gameEval.positions;
    expect(positions[8].lines[0].depth).toBe(0);
    const t = plyTable(fx.moveHistory, positions);
    const without = plyTable(
      fx.moveHistory,
      positions.map((p, i) => (i === 8 ? { ...p, lines: [] } : p))
    );
    const flat = (x: typeof t) =>
      Array.from(x.boards.entries()).map(([k, v]) => [k, Array.from(v).sort()]);
    expect(flat(t)).toEqual(flat(without));
    // A sentinel that kept a line is still no line.
    const forged = positions.map((p, i) =>
      i === 8
        ? {
            ...p,
            lines: [{ pv: ["h7h6", "g5h4"], cp: 0, depth: 0, multiPv: 1 }],
          }
        : p
    ) as PositionEval[];
    expect(flat(plyTable(fx.moveHistory, forged))).toEqual(flat(without));
  });
});

describe("readMoves on 07", () => {
  it("reads the game and the engine's lines as computed", () => {
    expect(classes("8. Nc7+ Kd8 9. Nxa8 wins the rook.")).toEqual([
      ["8. Nc7+", "computed"],
      ["Kd8", "computed"],
      ["9. Nxa8", "computed"],
    ]);
    expect(classes("The engine plays 8. Qxc1 Rb8 9. Qf4 instead.")).toEqual([
      ["8. Qxc1", "computed"],
      ["Rb8", "computed"],
      ["9. Qf4", "computed"],
    ]);
    expect(
      classes("Take it back: **8. Qxc1** Rb8 and White is better.")
    ).toEqual([
      ["8. Qxc1", "computed"],
      ["Rb8", "computed"],
    ]);
  });

  it("finds the illegal move, and names the side it would be legal for", () => {
    expect(classes("The engine line shows 8... Kd7 here.")).toEqual([
      ["8... Kd7", "illegal"],
    ]);
    const r = readMoves("Then 8. Kd8 steps out of the check.", T7);
    expect(r).toEqual([
      expect.objectContaining({
        mention: "8. Kd8",
        cls: "illegal",
        detail: "legal for the other side at this number",
      }),
    ]);
    // Two dots end the sentence for the splitter, so "8.. Kd8" leaves a
    // bare Kd8 the referee owns, and the gate judges nothing.
    expect(readMoves("Then 8.. Kd8 follows.", T7)).toEqual([]);
  });

  it("a legal move the engine never computed is an alternative, its continuation off the line", () => {
    expect(classes("8. Nxa7 Qxd1+ loses at once.")).toEqual([
      ["8. Nxa7", "alternative"],
      ["Qxd1+", "offLine"],
    ]);
    // The stored third line plays b5d6 e7d6, so this one is computed.
    expect(classes("8. Nd6+ exd6 opens the e-file.")).toEqual([
      ["8. Nd6+", "computed"],
      ["exd6", "computed"],
    ]);
  });

  it("an unnumbered move must be the running board's next move", () => {
    expect(classes("8. Qxc1 Rb8 Nxa8 follows.")).toEqual([
      ["8. Qxc1", "computed"],
      ["Rb8", "computed"],
      ["Nxa8", "illegal"],
    ]);
    // Anything but whitespace between them ends the line.
    expect(classes("8. Qxc1, and then Nxa8 is gone.")).toEqual([
      ["8. Qxc1", "computed"],
    ]);
  });

  it("a numbered move past the game's end is past", () => {
    expect(classes("By 25. Kf2 it is over.")).toEqual([["25. Kf2", "past"]]);
  });

  it("skips token lines", () => {
    expect(
      readMoves("8. Qxc1 wins it back.\n\n[CONTINUATION:8:w]\n", T7)
    ).toHaveLength(1);
  });
});

describe("readMoves on 10", () => {
  it("19... d5 is legal at that ply and no line plays it", () => {
    const t = plyTable(FX10.moveHistory, FX10.gameEval.positions);
    expect(classes("When Black plays 19... d5 the center opens.", t)).toEqual([
      ["19... d5", "alternative"],
    ]);
  });
});

describe("a verified what-if", () => {
  it("makes its own line computed, and only it", () => {
    // 07 with the stored b5d6 line taken out, then sent back as a what-if.
    const positions = FX7.gameEval.positions.map((p, i) =>
      i === 14 ? { ...p, lines: p.lines.filter((l) => l.pv[0] !== "b5d6") } : p
    );
    const line = FX7.gameEval.positions[14].lines.find(
      (l) => l.pv[0] === "b5d6"
    )!;
    const v = verifyClientEvals(
      {
        index: 14,
        fen: getFenAtHalfMove(M7, 14),
        depth: 16,
        moves: [
          {
            role: "asked",
            uci: "b5d6",
            cp: line.cp,
            depth: 16,
            pv: line.pv,
          },
        ],
      },
      { playedMoves: M7, gameEval: FX7.gameEval as never }
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const text = "8. Nd6+ exd6 gives the knight away.";
    expect(classes(text, plyTable(M7, positions))).toEqual([
      ["8. Nd6+", "alternative"],
      ["exd6", "offLine"],
    ]);
    expect(classes(text, plyTable(M7, positions, v.value))).toEqual([
      ["8. Nd6+", "computed"],
      ["exd6", "computed"],
    ]);
  });
});

describe("evalFigures, proofTokens, pctl", () => {
  it("counts the figures in prose and none on a token line", () => {
    expect(
      evalFigures("It stands at +2.84, and M+3 follows.\n[CONTINUATION:8:w]\n")
    ).toEqual(["+2.84", "M+3"]);
  });

  it("draws a token the client can resolve, never a Maia one", () => {
    const p = proofTokens(
      [
        "Two lines.",
        "[PLAYED:8:w]",
        "[CONTINUATION:8:w]",
        "[CONTINUATION:30:w]",
        "[MAIA_CONTINUATION:8:w]",
        "As in [CONTINUATION:8:w] above.",
      ].join("\n"),
      M7,
      FX7.gameEval.positions
    );
    expect(p.onLine.map((t) => [t.token, t.kind, t.drawable])).toEqual([
      ["[PLAYED:8:w]", "played", true],
      ["[CONTINUATION:8:w]", "engine", true],
      ["[CONTINUATION:30:w]", "engine", false],
      ["[MAIA_CONTINUATION:8:w]", "maia", false],
    ]);
    expect(p.inline).toBe(1);
  });

  it("is the probes' own percentile", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(pctl(xs, 0.5)).toBe(6);
    expect(pctl(xs, 0.95)).toBe(10);
    expect(pctl([], 0.5)).toBeNull();
    const rows = readCsv(
      fs.readFileSync(path.join(REPO, REPLAY_MANIFEST.testerCsv.file), "utf8")
    );
    const col = rows[0].indexOf("chat_latency_ms");
    const ms = rows
      .slice(1)
      .filter((r) => r.length === rows[0].length)
      .map((r) => Number(r[col]));
    expect(ms).toHaveLength(24);
    expect(pctl(ms, 0.5)).toBe(5355);
    expect(pctl(ms, 0.95)).toBe(7573);
  });
});

// ── The results contract ────────────────────────────────────────────────────

describe("recordTurn", () => {
  const cases: [string, Record<string, unknown>, string][] = [
    [
      "page",
      {
        analysis: "",
        served: "page",
        actions: [{ kind: "flip" }],
        timing: { elapsedMs: 3 },
      },
      "page",
    ],
    [
      "template, routed",
      {
        analysis: "What changed: the queen left c1.",
        pipeline: {
          finalOutcome: "fallback_used",
          servedFallback: "template",
          servedDraft: false,
        },
      },
      "template",
    ],
    [
      "template, router off",
      {
        analysis: "What changed: the queen left c1.",
        pipeline: { finalOutcome: "fallback_used", servedDraft: false },
      },
      "template",
    ],
    [
      "referee line",
      {
        analysis: "I can't check that claim from the lines I have.",
        pipeline: {
          finalOutcome: "fallback_used",
          servedFallback: "referee_line",
          servedDraft: false,
        },
      },
      "referee_line",
    ],
    [
      "draft",
      {
        analysis: "8. Qxc1 wins the queen back.",
        pipeline: { finalOutcome: "fallback_used", servedDraft: true },
      },
      "draft",
    ],
    ["plain", { analysis: "8. Qxc1 wins the queen back." }, "model"],
    [
      "plain, validators on",
      {
        analysis: "8. Qxc1 wins the queen back.",
        pipeline: { finalOutcome: "passed_initial", servedDraft: false },
      },
      "model",
    ],
  ];
  for (const validators of [false, true])
    for (const [name, ga, servedBy] of cases)
      it(`${name} on the validators ${validators ? "on" : "off"} wing is ${servedBy}`, () => {
        const t = recordTurn({
          probe: "followup-fielded",
          seq: 1,
          fixture: "07_knight_fork",
          fx: FX7,
          playerColor: "w",
          moveIndex: 20,
          question: "Why was 8. Nc7+ a mistake?",
          kind: "finding",
          flags: flags({
            MASTERMIND_VALIDATORS_ENABLED: validators ? "true" : "false",
          }),
          status: 200,
          json: { gameAnalysis: ga },
          logged: [
            ["followup_fielded", { eligible: false, reason: "no_anchor" }],
            ["followup_fielded", { served: "fielded", omitted: ["proof"] }],
            [
              "followup_referee_dropped",
              { sentences: 3, dropped: ["san:Kd7"] },
            ],
          ],
          harnessMs: 4100,
        });
        expect(t.servedBy).toBe(servedBy);
        expect(t.served).toBe(ga.analysis);
        expect(t.refereeDrops).toEqual(["san:Kd7"]);
        expect(t.fielded?.served).toBe("fielded");
        expect(followUpTurnV1.safeParse(t).success).toBe(true);
      });

  it("writes a valid run under its start time, refuses an invalid one, and writes nothing for none", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-gate-write-"));
    try {
      const one = turn({ seq: 1 });
      const a = writeFollowUpResults(
        "followup-fielded",
        "2026-10-09T07:12:34.567Z",
        [one],
        { summary: {} },
        dir
      );
      expect(path.basename(a!)).toBe(
        "followup-fielded-2026-10-09T071234Z.json"
      );
      const b = writeFollowUpResults(
        "followup-fielded",
        "2026-10-09T07:12:35.001Z",
        [one],
        { summary: {} },
        dir
      );
      expect(fs.readdirSync(dir).sort()).toEqual([
        path.basename(a!),
        path.basename(b!),
      ]);
      expect(
        followUpResultsV1.safeParse(JSON.parse(fs.readFileSync(a!, "utf8")))
          .success
      ).toBe(true);
      expect(() =>
        writeFollowUpResults(
          "followup-fielded",
          "2026-10-09T07:12:36.000Z",
          [{ ...one, id: "not an id" }],
          { summary: {} },
          dir
        )
      ).toThrow(/does not match/);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(
        writeFollowUpResults(
          "followup-fielded",
          "2026-10-09T07:12:37.000Z",
          [],
          { summary: {} },
          dir
        )
      ).toBeNull();
      warn.mockRestore();
      expect(fs.readdirSync(dir)).toHaveLength(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("every keyed probe writes through the contract", () => {
    const dir = path.join(REPO, "scripts/eval/__tests__");
    const probes = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".keyed.test.ts"));
    expect(probes.length).toBeGreaterThanOrEqual(3);
    for (const f of probes)
      expect(fs.readFileSync(path.join(dir, f), "utf8"), f).toMatch(
        /import\s*\{[^}]*\bwriteFollowUpResults\b[^}]*\}\s*from\s*"\.\.\/lib\/followUpRecord"/
      );
  });

  it("the frozen v1 sample still parses", () => {
    const sample = JSON.parse(
      fs.readFileSync(
        path.join(
          REPO,
          "scripts/eval/__tests__/fixtures/followup-results-v1.sample.json"
        ),
        "utf8"
      )
    );
    const r = followUpResultsV1.safeParse(sample);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(
      r.data.turns.map((t) => t.flags.MASTERMIND_VALIDATORS_ENABLED)
    ).toEqual(["false", "true"]);
    expect(r.data.turns.every((t) => t.fixture === "07_knight_fork")).toBe(
      true
    );
    // Written before COACH_COMPARE was recorded (pathway 3.5a): read as
    // unset, and a flag the contract does not know is still refused.
    expect(sample.turns[0].flags).not.toHaveProperty("COACH_COMPARE");
    expect(r.data.turns.map((t) => t.flags.COACH_COMPARE)).toEqual(["", ""]);
    const unknown = JSON.parse(JSON.stringify(sample));
    unknown.turns[0].flags.COACH_NO_SUCH_FLAG = "1";
    expect(followUpResultsV1.safeParse(unknown).success).toBe(false);
  });
});

// ── The gate ────────────────────────────────────────────────────────────────

describe("corpus", () => {
  it("fails a broken run by file and turn, and reads past a file with no marker", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-gate-corpus-"));
    try {
      const write = (name: string, body: unknown) => {
        const p = path.join(dir, name);
        fs.writeFileSync(
          p,
          typeof body === "string" ? body : JSON.stringify(body)
        );
        return p;
      };
      const ok = results("followup-fielded", [turn({ seq: 1 })]);
      const files = [
        write(
          "dup.json",
          results("followup-fielded", [turn({ seq: 1 }), turn({ seq: 1 })])
        ),
        write(
          "unknown.json",
          results("followup-fielded", [
            turn({ seq: 1, fixture: "99_no_such_game" }),
          ])
        ),
        write(
          "past-end.json",
          results("followup-fielded", [turn({ seq: 1, moveIndex: 21 })])
        ),
        write("newer.json", { ...ok, schemaVersion: 2 }),
        write("broken.json", "{ not json"),
        write("plain.json", { hello: "a file with no marker" }),
      ];
      const input = await loadGateInput({ repoRoot: REPO, extra: files });
      expect(input.notRead).toContain("extra/plain.json");
      const changed = {
        ...REPLAY_MANIFEST,
        storyProbe: { ...REPLAY_MANIFEST.storyProbe, sha256: "0".repeat(64) },
      };
      const r = await runGate(input, changed);
      const corpus = failed(r, "corpus").map(
        (f) => `${f.file} ${f.turn ?? "-"}: ${f.detail}`
      );
      expect(corpus).toEqual(
        expect.arrayContaining([
          "extra/newer.json -: schemaVersion 2 was written by a newer probe than this gate",
          "extra/broken.json -: not JSON",
          expect.stringMatching(
            /^scripts\/eval\/results\/followup-story-probe\.json -: the frozen corpus changed, re-pin it on purpose/
          ),
          "extra/dup.json followup-fielded:1: duplicate turn id",
          "extra/unknown.json followup-fielded:1: unknown fixture 99_no_such_game",
          "extra/past-end.json followup-fielded:1: moveIndex 21 is outside 0 to 20",
        ])
      );
      expect(corpus).toHaveLength(6);
      expect(renderReport(r)).toMatch(/Verdict: FAIL \(6 failures\)\n$/);

      // The file with no marker alone passes.
      const alone = await runGate(
        await loadGateInput({ repoRoot: REPO, extra: [files[5]] })
      );
      expect(alone.failures).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("legality", () => {
  const FILE = "scripts/eval/results/followup-fielded-test.json";
  const served =
    "8. Qxc1 was the move. The engine line shows 8... Kd7, and suddenly you're down massive material.";
  const run = (t: FollowUpTurn) =>
    withRuns(declared(FILE, results("followup-fielded", [t])));
  const unchanged = ((i: { reply: string }) => ({
    text: i.reply,
    applied: true,
    sentences: 0,
    dropped: [],
  })) as never;

  it("fails an illegal move HEAD's referee would keep", async () => {
    const r = await runGate(run(turn({ seq: 1, served })), REPLAY_MANIFEST, {
      referee: unchanged,
    });
    expect(failed(r, "legality")).toEqual([
      {
        check: "legality",
        file: FILE,
        turn: "followup-fielded:1",
        detail: "8... Kd7: illegal",
      },
    ]);
  });

  it("passes it as fixed since HEAD when the real referee drops its sentence", async () => {
    const r = await runGate(run(turn({ seq: 1, served })));
    expect(r.failures).toEqual([]);
    expect(r.fixedSinceHead).toEqual([
      expect.objectContaining({
        check: "legality",
        detail: "8... Kd7: illegal",
      }),
    ]);
    expect(renderReport(r)).toMatch(
      /Verdict: PASS \(0 acknowledged, 1 fixed since HEAD\)\n$/
    );
  });

  it("passes it acknowledged with a reason, and fails a stale acknowledgement", async () => {
    const ack: Acknowledgement = {
      file: FILE,
      turn: "followup-fielded:1",
      check: "legality",
      detail: "8... Kd7: illegal",
      reason: "a known slip kept on purpose for this test",
    };
    const acked = await runGate(
      run(turn({ seq: 1, served })),
      { ...REPLAY_MANIFEST, acknowledged: [ack] },
      { referee: unchanged }
    );
    expect(acked.failures).toEqual([]);
    expect(acked.acknowledged).toHaveLength(1);

    const stale = await runGate(run(turn({ seq: 1 })), {
      ...REPLAY_MANIFEST,
      acknowledged: [ack],
    });
    expect(failed(stale, "acknowledgements")).toEqual([
      expect.objectContaining({
        detail: "stale, it matches no finding (legality: 8... Kd7: illegal)",
      }),
    ]);

    const noReason = await runGate(
      run(turn({ seq: 1, served })),
      { ...REPLAY_MANIFEST, acknowledged: [{ ...ack, reason: " " }] },
      { referee: unchanged }
    );
    expect(failed(noReason, "legality")).toHaveLength(1);
    expect(failed(noReason, "acknowledgements")[0].detail).toMatch(
      /needs a reason/
    );
  });

  it("does not measure a turn whose fixture changed since the run", async () => {
    const t = { ...turn({ seq: 1, served }), fixtureDigest: "0".repeat(16) };
    const r = await runGate(run(t), REPLAY_MANIFEST, { referee: unchanged });
    expect(r.failures).toEqual([]);
    expect(renderReport(r)).toContain(
      "not measured: followup-fielded:1 (the fixture changed since the run)"
    );
  });
});

describe("routing, both wings", () => {
  const FILE = "scripts/eval/results/intent-router-test.json";
  const router = { COACH_INTENT_ROUTER: "1" };
  const byModel = {
    source: "model",
    rule: "model:verdict",
    intent: "verdict",
    grammar: "one_move",
    model: { outcome: "ok", intent: "verdict", costUsd: 0.0001 },
  };
  for (const validators of [false, true]) {
    const wing = validators ? "on" : "off";
    it(`a page question routed by the model is a finding, fixed once HEAD's rules route it (validators ${wing})`, async () => {
      const common = {
        probe: "intent-router" as const,
        origin: "ui:strip",
        validators,
        set: router,
        pipeline: { categorySource: "routed" },
        ga: { routing: byModel },
      };
      const r = await runGate(
        withRuns(
          declared(
            FILE,
            results("intent-router", [
              turn({
                ...common,
                seq: 1,
                question: "Why was 8. Nc7+ a blunder?",
                moveIndex: 15,
              }),
              turn({ ...common, seq: 2, question: "what is a good move?" }),
            ])
          )
        )
      );
      expect(r.fixedSinceHead).toEqual([
        expect.objectContaining({
          check: "routing.ui",
          turn: "intent-router:1",
        }),
      ]);
      expect(failed(r, "routing.ui")).toEqual([
        {
          check: "routing.ui",
          file: FILE,
          turn: "intent-router:2",
          detail: '"what is a good move?" routed by model with 1 routing call',
        },
      ]);
    });
  }

  it("a typed turn calling the router and the classifier makes two calls and fails", async () => {
    const r = await runGate(
      withRuns(
        declared(
          FILE,
          results("intent-router", [
            turn({
              probe: "intent-router",
              seq: 1,
              question: "what is a good move?",
              origin: "typed",
              validators: true,
              set: router,
              ga: { routing: byModel },
            }),
          ])
        )
      )
    );
    expect(failed(r, "routing.calls")).toEqual([
      expect.objectContaining({
        turn: "intent-router:1",
        detail: "2 routing calls on one turn",
      }),
    ]);
    expect(renderReport(r)).toContain(
      "routing calls per typed turn: recorded max 2"
    );
  });
});

describe("flips", () => {
  const words = (n: number) =>
    `${Array.from({ length: n }, () => "calm").join(" ")}.`;
  const leanRun = (
    validators: boolean,
    o: { n?: number; ms?: number; words?: number; versions?: string } = {}
  ) =>
    declared(
      `scripts/eval/results/followup-fielded-lean-${validators ? "on" : "off"}.json`,
      results(
        "followup-fielded",
        Array.from({ length: o.n ?? 20 }, (_, i) =>
          turn({
            seq: i + 1,
            validators,
            set: { COACH_FOLLOWUP_LEAN: "1" },
            served: words(o.words ?? 58),
            elapsedMs: o.ms ?? 4800,
          })
        ),
        o.versions ? { versions: { followUpPrompt: o.versions } } : {}
      )
    );
  const lean = {
    ...REPLAY_MANIFEST,
    flipped: ["COACH_FOLLOWUP_LEAN"] as FlippableFlag[],
  };
  const flipFailures = (r: GateReport) =>
    failed(r, "flips").map((f) => f.detail);

  it("lean passes at p50 4800 ms and 58 words on both wings", async () => {
    const r = await runGate(withRuns(leanRun(false), leanRun(true)), lean);
    expect(r.failures).toEqual([]);
    expect(renderReport(r)).toContain(
      "validators on: scripts/eval/results/followup-fielded-lean-on.json, 20 turns, route p50 4800 ms, median words at rest 58"
    );
  });

  it("lean fails short of the bar", async () => {
    expect(
      flipFailures(
        await runGate(withRuns(leanRun(false, { n: 19 }), leanRun(true)), lean)
      )
    ).toEqual([
      "COACH_FOLLOWUP_LEAN: 19 target turns on the validators off wing, the bar reads at least 20",
    ]);
    expect(
      flipFailures(
        await runGate(
          withRuns(leanRun(false), leanRun(true, { ms: 5000 })),
          lean
        )
      )
    ).toEqual([
      "COACH_FOLLOWUP_LEAN: route p50 5000 ms on the validators on wing, the bar is under 5000 ms",
    ]);
    expect(
      flipFailures(
        await runGate(
          withRuns(leanRun(false, { words: 61 }), leanRun(true)),
          lean
        )
      )
    ).toEqual([
      "COACH_FOLLOWUP_LEAN: median words at rest 61 on the validators off wing, the bar is 60 or fewer",
    ]);
    expect(flipFailures(await runGate(withRuns(leanRun(false)), lean))).toEqual(
      [
        "COACH_FOLLOWUP_LEAN: no followup-fielded run at the target configuration (v1+lean) on the validators on wing",
      ]
    );
    expect(
      flipFailures(
        await runGate(
          withRuns(leanRun(false), leanRun(true, { versions: "1.2" })),
          lean
        )
      )
    ).toEqual([
      "COACH_FOLLOWUP_LEAN: the run is stale (versions.followUpPrompt 1.2, HEAD 1.3)",
    ]);
  });

  it("the same data unflipped passes", async () => {
    const r = await runGate(
      withRuns(leanRun(false, { n: 19, ms: 5000, words: 61 }))
    );
    expect(r.failures).toEqual([]);
  });

  it("an injected reader returning on is treated as flipped", async () => {
    const r = await runGate(withRuns(leanRun(false)), REPLAY_MANIFEST, {
      flagReaders: { COACH_FOLLOWUP_LEAN: () => true },
    });
    expect(renderReport(r)).toContain(
      "COACH_FOLLOWUP_LEAN: flipped (code default), target v1+lean"
    );
    expect(flipFailures(r)).toEqual([
      "COACH_FOLLOWUP_LEAN: no followup-fielded run at the target configuration (v1+lean) on the validators on wing",
    ]);
  });

  describe("fielded", () => {
    const fieldedManifest = {
      ...REPLAY_MANIFEST,
      flipped: ["COACH_FOLLOWUP_PROMPT=fielded"] as FlippableFlag[],
    };
    const fieldedRun = (validators: boolean, odd?: Partial<TurnSpec>) =>
      declared(
        `scripts/eval/results/followup-fielded-${validators ? "on" : "off"}.json`,
        results(
          "followup-fielded",
          Array.from({ length: 20 }, (_, i) =>
            turn({
              seq: i + 1,
              validators,
              set: { COACH_FOLLOWUP_PROMPT: "fielded" },
              served:
                "8. Qxc1 takes the queen back at once.\n\n[CONTINUATION:8:w]\n\nLesson: Loose pieces first.",
              fielded: { served: "fielded", omitted: [] },
              ...(i === 0 ? odd : {}),
            })
          )
        )
      );
    it("passes clean fielded answers on both wings", async () => {
      const r = await runGate(
        withRuns(fieldedRun(false), fieldedRun(true)),
        fieldedManifest
      );
      expect(r.failures).toEqual([]);
    });
    for (const validators of [false, true]) {
      const wing = validators ? "on" : "off";
      it(`fails a figure, an undrawable token or an off-line move in a fielded answer (validators ${wing})`, async () => {
        const runs = (odd: Partial<TurnSpec>) =>
          validators
            ? withRuns(fieldedRun(false), fieldedRun(true, odd))
            : withRuns(fieldedRun(false, odd), fieldedRun(true));
        const file = `scripts/eval/results/followup-fielded-${wing}.json`;
        const one = async (odd: Partial<TurnSpec>) =>
          failed(await runGate(runs(odd), fieldedManifest), "flips").map(
            (f) => `${f.file} ${f.turn}: ${f.detail}`
          );
        expect(
          await one({ served: "8. Qxc1 holds at +2.84 for White." })
        ).toEqual([
          `${file} followup-fielded:1: COACH_FOLLOWUP_PROMPT=fielded: eval figure +2.84 in a fielded answer's prose`,
        ]);
        expect(
          await one({ served: "8. Qxc1 keeps control.\n\n[CONTINUATION:30:w]" })
        ).toEqual([
          `${file} followup-fielded:1: COACH_FOLLOWUP_PROMPT=fielded: [CONTINUATION:30:w] cannot be drawn`,
        ]);
        expect(await one({ served: "8. Nxa7 Qxd1+ loses at once." })).toEqual([
          `${file} followup-fielded:1: COACH_FOLLOWUP_PROMPT=fielded: Qxd1+ is off the line in a fielded answer`,
        ]);
        // The same figure on a turn the v1 prompt answered is reported only.
        expect(
          await one({
            served: "8. Qxc1 holds at +2.84 for White.",
            fielded: { served: "v1_fallback" },
          })
        ).toEqual([]);
      });
    }
  });

  it("the router fails when a wing lacks one of the six no-board and acknowledgement rows", async () => {
    const six = INTENT60.rows.filter((r) => r.expect.grammar !== "one_move");
    expect(six.map((r) => r.id)).toEqual([43, 44, 45, 46, 47, 50]);
    const routerRun = (validators: boolean, rows = six) =>
      declared(
        `scripts/eval/results/intent-router-${validators ? "on" : "off"}.json`,
        results(
          "intent-router",
          rows.map((r, i) =>
            turn({
              probe: "intent-router",
              seq: i + 1,
              question: r.q,
              kind: `intent-60:${r.id}`,
              origin: r.origin,
              moveIndex: r.moveIndex,
              validators,
              set: { COACH_INTENT_ROUTER: "1" },
              served: "Keep the pieces working together.",
              pipeline: { categorySource: "routed" },
              ga: {
                routing: {
                  source: "rule",
                  rule: "test",
                  intent: r.expect.intent,
                  grammar: r.expect.grammar,
                },
              },
            })
          )
        )
      );
    const m = {
      ...REPLAY_MANIFEST,
      flipped: ["COACH_INTENT_ROUTER"] as FlippableFlag[],
    };
    expect(
      (await runGate(withRuns(routerRun(false), routerRun(true)), m)).failures
    ).toEqual([]);
    const r = await runGate(
      withRuns(routerRun(false), routerRun(true, six.slice(0, 5))),
      m
    );
    expect(failed(r, "flips").map((f) => f.detail)).toEqual([
      "COACH_INTENT_ROUTER: intent-60 row #50 is missing on the validators on wing",
    ]);
  });
});

describe("clocks and determinism", () => {
  const fast = (validators: boolean) =>
    declared(
      `scripts/eval/results/followup-fielded-fast-${validators ? "on" : "off"}.json`,
      results(
        "followup-fielded",
        Array.from({ length: 5 }, (_, i) =>
          turn({ seq: i + 1, validators, elapsedMs: 1000 })
        )
      )
    );

  it("never pools the tester's client-http clock with a route clock", async () => {
    const r = await runGate(withRuns(fast(false), fast(true)));
    const route = r.latency.filter((g) => g.clock === "route");
    expect(route.length).toBeGreaterThan(0);
    expect(route.some((g) => g.group.startsWith("tester csv"))).toBe(false);
    const elapsed = route.filter((g) => g.group.endsWith("elapsedMs"));
    expect(elapsed.map((g) => [g.n, g.p50])).toEqual([
      [5, 1000],
      [5, 1000],
    ]);
    expect(r.latency.filter((g) => g.clock === "client-http")).toEqual([
      {
        group: "tester csv",
        clock: "client-http",
        n: 24,
        p50: 5355,
        p95: 7573,
      },
    ]);
  });

  it("gives the same bytes for the same input", async () => {
    const input = withRuns(fast(false), fast(true));
    const a = renderReport(await runGate(input), { verbose: true });
    const b = renderReport(await runGate(input), { verbose: true });
    expect(a).toBe(b);
    expect(a).not.toMatch(/\/home\/|\/tmp\//);
  });
});

describe("the repo's own corpus, offline and with no key", () => {
  it("passes and states the day-one figures", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("no network in the replay gate test");
    });
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    try {
      const input = await loadGateInput({ repoRoot: REPO });
      const r = await runGate(input);
      expect(r.failures).toEqual([]);
      const text = renderReport(r);
      for (const line of [
        "story probe   scripts/eval/results/followup-story-probe.json  sha256 62d49fc13190ed68 ok  4 rows",
        "tester csv    scripts/synthetic-tester/runs/rmom5mxo6-4cc2b5.csv  sha256 e2a6ba254ceddf7b ok  24 rows",
        "engine probe  invariant failures 0, 12 of 12 ok",
        "raw: 60 computed, 3 alternatives, 0 off the line, 2 illegal, 0 past (illegal 8... Kd7, 18... Rf7)",
        "HEAD's referee: 11 of 67 sentences dropped without stories, 0 of 65 with stories",
        "refereed: 57 computed, 1 alternative, 0 off the line, 0 illegal, 0 past",
        "alternatives: raw 8... Qxc1, 18... Re8, 19... d5, refereed 19... d5",
        "eval figures in prose: 8 raw, 8 refereed",
        "token lines: 0 raw",
        "words at rest: median 215 raw, 201 refereed (6 answers)",
        "tester csv, client-http clock, pre-pathway baseline: 24 turns, p50 5355 ms, p95 7573 ms",
        "tester csv: 24 answers at rest, median 211 words, max 307",
        "evaluateMoves headless depth 12 median 105 ms, max 146 ms",
        "rules over intent-60: 43 of 60 by rule (the fixture pins 43), UI 20 of 20 with and without an anchor",
        "UI questions by rule: intent-60 20 of 20, no routing call (route.router.test.ts)",
        "Flag-off byte-identical: held by route.golden.test.ts in the merge gate",
      ])
        expect(text).toContain(line);
      // Day one holds no declared run and no flip. A committed run or a
      // flip changes these two lines on purpose.
      if (input.declared.length === 0) {
        expect(text).toContain("declared runs none");
        for (const probe of [
          "intent-router",
          "followup-fielded",
          "followup-perspective",
        ])
          expect(text).toContain(`${probe}: no run yet.`);
      }
      if (REPLAY_MANIFEST.flipped.length === 0)
        expect(text).toContain("flipped: none");
      expect(text).toMatch(
        /Verdict: PASS \(0 acknowledged, \d+ fixed since HEAD\)\n$/
      );
    } finally {
      spy.mockRestore();
      vi.unstubAllEnvs();
    }
  }, 60_000);
});

describe("the offline guard", () => {
  it("records a fetch and throws", async () => {
    const inner = installOfflineGuards();
    await expect(
      fetch("https://api.anthropic.com/v1/messages")
    ).rejects.toThrow("network disabled in the replay gate");
    expect(inner.attempts).toEqual(["api.anthropic.com"]);
    inner.restore();
    // Back to the file's own guard, with chessdb stubbed again.
    __setFetchForTesting((() =>
      Promise.reject(new Error("offline"))) as unknown as typeof fetch);
  });
});
