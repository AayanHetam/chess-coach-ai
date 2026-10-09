/**
 * Pathway 4.9 through the enforced stream and the serving path.
 *
 * With COACH_LADDER_NOTE off, the enforced stream's SSE bytes, the served
 * text and the cache key are pinned to hashes generated before the change
 * (golden/ladder-note-flag-off.json, written by GOLDEN_WRITE=<path> at
 * ff30930 and 72261a8, which agree). The stream reads no env: only the
 * serving path does, once per review. With it on, a card the ladder served
 * at sentence_drop carries one line, every other byte is the flag-off byte,
 * and the noted review is cached under its own key, so neither setting is
 * ever served the other's text. The rollback drill holds with the env on.
 *
 * The cases that need the change itself skip under GOLDEN_WRITE, so the
 * same file writes the golden at the base commit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const { mockLog } = vi.hoisted(() => ({
  mockLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/logging", () => ({
  logger: { child: () => mockLog },
}));

import { __resetContractEnvCacheForTests } from "@/env";
import { isContractServingArmed } from "@/lib/contract/servingGate";
import { createEnforcedContractStream } from "@/lib/contract/enforcedStream";
import type { EnforcedStreamOpts } from "@/lib/contract/enforcedStream";
import { serveContractAnalysis } from "@/lib/contract/contractServing";
import type { ContractServingArgs } from "@/lib/contract/contractServing";
import { renderInsightBlock } from "@/lib/contract/insightGrammar";
import type { ArmingTable } from "@/lib/contract/armingConfig";
import type { LadderDeps } from "@/lib/contract/ladder";
import type { CoachContract } from "@/lib/contract/types";
import {
  clearCache,
  generateContractCacheKey,
  getCachedResponse,
  setCachedResponse,
} from "@/lib/responseCache";
import type { LLMStreamEvent } from "@/lib/llmProvider";
import type { TurnMoment } from "@/lib/coach/turnMoment";
import { makeContract, makeInsight } from "./insightFactory";

const GOLDEN = path.join(__dirname, "golden", "ladder-note-flag-off.json");
const WRITING = !!process.env.GOLDEN_WRITE;

const NOTE_EVAL = "I left out an evaluation I couldn't check.";
const NOTE_TACTIC_EVAL =
  "I left out a tactic and an evaluation I couldn't check.";

/** ladder.test.ts's explicit table. */
const ENFORCE_TABLE: ArmingTable = {
  eval_display: "error",
  san_whitelist: "error",
  tactical_keyword: "error",
  forbidden_claim: "error",
  relational_claim: "error",
  citation_invalid: "error",
};

const CLEAN_LEDE =
  "You went for Bd3, but Ne6 was the star move [F:M1]. After Ne6 Qd7 Nxg7 the knight nets material at +3.20 [F:M1.pv0]. A fine fighting choice, just one square short.";
const BAD_EVAL = "The eval crashed to -9.50 after this.";
const CLEAN_WHY = [
  "[WHY]",
  "Idea: You wanted to develop the bishop and keep things calm.",
  "Problem: The knight had a stronger jump, and the bishop move let it slip.",
  "Find the knight's best square before you develop the bishop.",
  "[/WHY]",
].join("\n");

const insights = [
  makeInsight({
    factIdPrefix: "M1",
    moveNumber: 11,
    color: "w",
    topMistakeRank: 1,
  }),
  makeInsight({
    factIdPrefix: "M2",
    moveNumber: 14,
    color: "b",
    topMistakeRank: 2,
  }),
  makeInsight({
    factIdPrefix: "M3",
    moveNumber: 17,
    color: "w",
    topMistakeRank: 3,
  }),
  makeInsight({
    factIdPrefix: "M4",
    moveNumber: 20,
    color: "b",
    topMistakeRank: 4,
  }),
  makeInsight({
    factIdPrefix: "M5",
    moveNumber: 23,
    color: "w",
    topMistakeRank: 5,
  }),
];
const contract: CoachContract = makeContract(insights);

/** The cards a review can cache: clean, a lede drop, a [WHY] drop, a [THREATS] drop. */
const VERIFIED_CARDS = [
  renderInsightBlock(insights[0], `${CLEAN_LEDE}\n${CLEAN_WHY}`),
  renderInsightBlock(insights[1], `${CLEAN_LEDE} ${BAD_EVAL}\n${CLEAN_WHY}`),
  renderInsightBlock(
    insights[2],
    [
      CLEAN_LEDE,
      "[WHY]",
      "Idea: You wanted to develop the bishop and keep things calm.",
      "Problem: The knight had a stronger jump. Bd3 hung the bishop to a pin. It slid to -9.50 at once.",
      "Find the knight's best square before you develop the bishop.",
      "[/WHY]",
    ].join("\n")
  ),
  renderInsightBlock(
    insights[3],
    `${CLEAN_LEDE}\n${CLEAN_WHY}\n[THREATS]\nThe queen is loose. ${BAD_EVAL}\n[/THREATS]`
  ),
];

/** Every shape: the verified cards, a templated card and an unanchored one. */
const STREAM_MESSAGE =
  "Let's walk through the key moments.\n\n" +
  [
    ...VERIFIED_CARDS,
    renderInsightBlock(
      insights[4],
      "The eval crashed to -9.50 which loses everything for -9.50 reasons."
    ),
    "[INSIGHT:30:w:blunder:+1.00:-1.00:Qh5:Qd1]\nA card the plan never asked for.\n[/INSIGHT]",
  ].join("\n\n") +
  "\n\nThat's the game.";

const SERVING_MESSAGE =
  "Let's walk through the key moments.\n\n" +
  VERIFIED_CARDS.join("\n\n") +
  "\n\nThat's the game.";

function chunks(message: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < message.length; i += 13)
    out.push(message.slice(i, i + 13));
  return out;
}

/** No network: the edit fails visibly and the regen throws, so a gutted card is templated. */
function offlineDeps(): LadderDeps {
  return {
    correctImpl: async (o) => ({
      correctedText: o.rawText,
      mode: "footnoted",
      costUsd: 0,
    }),
    callLLMImpl: async () => {
      throw new Error("network disabled in ladder-note tests");
    },
  };
}

const sha = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");

/** The enforced stream as the rollback drill encodes it, SSE bytes and the text. */
async function streamSse(
  table: ArmingTable | undefined,
  extra: Partial<EnforcedStreamOpts> = {}
): Promise<{ bytes: Buffer; finalText: string }> {
  const encoder = new TextEncoder();
  const out: Uint8Array[] = [];
  const send = (obj: unknown) =>
    out.push(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
  const stream = createEnforcedContractStream({
    contract,
    emit: (delta) => send({ type: "text", delta }),
    correlationId: "ladder-note",
    refereeMode: "deterministic",
    citationGranularity: "sentence",
    deadlineAtMs: Date.now() + 60_000,
    regenSystem: { stable: "SYS", perUser: "USER" },
    armingTable: table,
    deps: offlineDeps(),
    ...extra,
  });
  for (const d of chunks(STREAM_MESSAGE)) stream.push(d);
  const summary = await stream.end();
  send({ type: "done", metadata: { analysis: summary.finalText } });
  return { bytes: Buffer.concat(out), finalText: summary.finalText };
}

const CACHE_INPUTS = {
  currentFen: contract.game.finalFen,
  skillLevel: "intermediate",
  userMessage: "analyze my game",
  personaSignature: "sig",
  moveHistory: ["e4", "e5"],
};

const plainKey = () =>
  generateContractCacheKey(
    CACHE_INPUTS.currentFen,
    CACHE_INPUTS.skillLevel,
    CACHE_INPUTS.userMessage,
    CACHE_INPUTS.personaSignature,
    CACHE_INPUTS.moveHistory
  );

/** One review through serveContractAnalysis with the shipping (default) table. */
async function serve(): Promise<{
  emitted: string;
  analysis: string;
  cached: boolean;
  streamCalls: number;
}> {
  let emitted = "";
  let streamCalls = 0;
  async function* model(): AsyncGenerator<LLMStreamEvent> {
    streamCalls += 1;
    for (const delta of chunks(SERVING_MESSAGE)) yield { type: "text", delta };
  }
  const args: ContractServingArgs = {
    contract,
    category: "game_review",
    emitText: (t) => {
      emitted += t;
    },
    messageText: "analyze my game",
    priorMessages: [],
    promptInput: { personalityId: "friendly", userRating: 1500 },
    correlationId: "ladder-note-serving",
    uid: "u1",
    requestStartMs: Date.now(),
    cacheInputs: CACHE_INPUTS,
    callLLMStreamImpl: model as ContractServingArgs["callLLMStreamImpl"],
    ladderDeps: offlineDeps(),
  };
  const result = await serveContractAnalysis(args);
  return {
    emitted,
    analysis: result.analysisContent,
    cached: result.cached,
    streamCalls,
  };
}

/** The text with every note line removed. */
const NOTE_LINE_RE = /^I left out .+ I couldn't check\.$/;
const unnoted = (text: string) =>
  text
    .split("\n")
    .filter((l) => !NOTE_LINE_RE.test(l))
    .join("\n");

beforeEach(() => {
  clearCache();
  mockLog.info.mockClear();
  __resetContractEnvCacheForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  clearCache();
  __resetContractEnvCacheForTests();
});

describe("flag off: the bytes before the change", () => {
  it("the enforced stream, the served text and the cache key match the golden", async () => {
    vi.stubEnv("COACH_LADDER_NOTE", undefined);
    const defaultRun = await streamSse(undefined);
    const enforceRun = await streamSse(ENFORCE_TABLE);
    const served = await serve();
    expect(served.cached).toBe(false);
    expect(served.emitted).toBe(served.analysis);
    expect(getCachedResponse(plainKey())).toBe(served.analysis);
    const hashes = {
      stream: {
        default: sha(defaultRun.bytes),
        enforce: sha(enforceRun.bytes),
      },
      serving: { analysis: sha(served.analysis), key: plainKey() },
    };
    if (WRITING) {
      fs.writeFileSync(
        process.env.GOLDEN_WRITE!,
        JSON.stringify(hashes, null, 2) + "\n"
      );
      return;
    }
    expect(hashes).toEqual(JSON.parse(fs.readFileSync(GOLDEN, "utf8")));
  }, 60_000);

  it("the option off, the option false and the env on with no option give the same stream bytes", async () => {
    const golden = WRITING ? null : JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
    for (const table of [undefined, ENFORCE_TABLE]) {
      const omitted = await streamSse(table);
      const off = await streamSse(table, {
        ladderNote: false,
      } as Partial<EnforcedStreamOpts>);
      vi.stubEnv("COACH_LADDER_NOTE", "1");
      const envOnly = await streamSse(table);
      vi.unstubAllEnvs();
      expect(off.bytes.equals(omitted.bytes)).toBe(true);
      expect(envOnly.bytes.equals(omitted.bytes)).toBe(true);
      if (golden)
        expect(sha(omitted.bytes)).toBe(
          table ? golden.stream.enforce : golden.stream.default
        );
    }
  }, 60_000);

  it("unset, 0 and off serve the same text under the same key", async () => {
    const golden = WRITING ? null : JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
    const texts: string[] = [];
    for (const v of [undefined, "0", "off"]) {
      clearCache();
      vi.stubEnv("COACH_LADDER_NOTE", v);
      const served = await serve();
      expect(served.streamCalls).toBe(1);
      expect(getCachedResponse(plainKey())).toBe(served.analysis);
      texts.push(served.analysis);
      if (golden) expect(sha(served.analysis)).toBe(golden.serving.analysis);
    }
    expect(new Set(texts).size).toBe(1);
    expect(texts[0]).not.toContain("couldn't check");
  }, 60_000);
});

describe("rollback drill with the note on", () => {
  function legacySse(deltas: string[]): Buffer {
    const encoder = new TextEncoder();
    const out: Uint8Array[] = [];
    const send = (obj: unknown) =>
      out.push(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
    for (const delta of deltas) send({ type: "text", delta });
    send({ type: "done", metadata: { analysis: deltas.join("") } });
    return Buffer.concat(out);
  }

  /** The drill's route decision and emission, with the stream as serving would build it. */
  async function serveStreaming(
    deltas: string[],
    category: string
  ): Promise<Buffer> {
    if (!isContractServingArmed({ category, uid: null }))
      return legacySse(deltas);
    const { bytes } = await streamSse(undefined, {
      ladderNote: true,
    } as Partial<EnforcedStreamOpts>);
    return bytes;
  }

  it("COACH_LADDER_NOTE=1 with CONTRACT_CATEGORIES empty is byte-identical legacy on both categories", async () => {
    vi.stubEnv("COACH_LADDER_NOTE", "1");
    vi.stubEnv("CONTRACT_CATEGORIES", "");
    vi.stubEnv("CONTRACT_UIDS", "");
    __resetContractEnvCacheForTests();
    const deltas = chunks(STREAM_MESSAGE);
    for (const category of ["position_analysis", "game_review"]) {
      const served = await serveStreaming(deltas, category);
      expect(served.equals(legacySse(deltas)), category).toBe(true);
    }
  });
});

describe.skipIf(WRITING)("flag on", () => {
  it("the stream's noted cards are the flag-off cards plus one line each, before [WHY]", async () => {
    for (const table of [undefined, ENFORCE_TABLE]) {
      const off = await streamSse(table);
      const on = await streamSse(table, {
        ladderNote: true,
      } as Partial<EnforcedStreamOpts>);
      expect(on.bytes.equals(off.bytes)).toBe(false);
      expect(unnoted(on.finalText)).toBe(off.finalText);
      expect(off.finalText).not.toContain("couldn't check");
      const lines = on.finalText.split("\n");
      const notes = lines.filter((l) => NOTE_LINE_RE.test(l));
      // The shipping table cuts one evaluation from the lede drop, and a
      // tactic and an evaluation from the [WHY] drop. The wider test table
      // cuts more and names them by its own findings.
      if (!table) expect(notes).toEqual([NOTE_EVAL, NOTE_TACTIC_EVAL]);
      else expect(notes.length).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < lines.length; i++) {
        if (!NOTE_LINE_RE.test(lines[i])) continue;
        expect(lines[i + 1]).toBe("[WHY]");
        expect(lines[i - 1]).toContain("A fine fighting choice");
      }
    }
  }, 60_000);

  // COACH_TURN1_MOMENTS beside it: each moment names the card as served,
  // note and all, and no field of it carries the note.
  it("with the turn-1 moments on too, each moment is keyed on the noted card and carries no note", async () => {
    const { cardKey } = await import("@/lib/coach/turnMoment");
    const moments: TurnMoment[] = [];
    const off: TurnMoment[] = [];
    const on = await streamSse(undefined, {
      ladderNote: true,
      emitMoment: (m: TurnMoment) => moments.push(m),
    } as Partial<EnforcedStreamOpts>);
    await streamSse(undefined, {
      emitMoment: (m: TurnMoment) => off.push(m),
    } as Partial<EnforcedStreamOpts>);
    const cards =
      on.finalText.match(/\[INSIGHT:[^\]]+\][\s\S]*?\[\/INSIGHT\]/g) ?? [];
    expect(moments.map((m) => m.card.factIdPrefix)).toEqual([
      "M1",
      "M2",
      "M3",
      "M4",
    ]);
    for (const m of moments) {
      expect(cards.map(cardKey)).toContain(m.card.key);
      expect(JSON.stringify(m)).not.toContain("couldn't check");
    }
    // Apart from the key, each moment is the moment the card has without the note.
    const unkeyed = (ms: TurnMoment[]) =>
      ms.map((m) => ({ ...m, card: { ...m.card, key: "" } }));
    expect(unkeyed(moments)).toEqual(unkeyed(off));
  }, 60_000);

  it("a card with no [WHY] keeps the note out of its moment, which the lift would read as prose", async () => {
    const lone = makeContract([insights[0]]);
    const body = [
      `${CLEAN_LEDE} ${BAD_EVAL}`,
      "",
      "The knight had a stronger jump, and the bishop move let it slip.",
      "",
      "Find the knight's best square before you develop the bishop.",
    ].join("\n");
    const run = async (ladderNote: boolean) => {
      const moments: TurnMoment[] = [];
      let text = "";
      const stream = createEnforcedContractStream({
        contract: lone,
        emit: (t) => {
          text += t;
        },
        correlationId: "ladder-note-lone",
        refereeMode: "deterministic",
        citationGranularity: "sentence",
        deadlineAtMs: Date.now() + 60_000,
        regenSystem: { stable: "SYS", perUser: "USER" },
        deps: offlineDeps(),
        emitMoment: (m: TurnMoment) => moments.push(m),
        ladderNote,
      } as EnforcedStreamOpts);
      for (const d of chunks(renderInsightBlock(insights[0], body)))
        stream.push(d);
      await stream.end();
      return { moments, text };
    };
    const off = await run(false);
    const on = await run(true);
    expect(on.text.split("\n")[2]).toBe(NOTE_EVAL);
    expect(unnoted(on.text)).toBe(off.text);
    expect(on.moments).toHaveLength(1);
    expect(JSON.stringify(on.moments[0])).not.toContain("couldn't check");
    expect({
      ...on.moments[0],
      card: { ...on.moments[0].card, key: "" },
    }).toEqual({
      ...off.moments[0],
      card: { ...off.moments[0].card, key: "" },
    });
    const { liftTurnMoment } = await import("@/lib/contract/turnMoments");
    const untold = liftTurnMoment({
      insight: insights[0],
      stage: "sentence_drop",
      finalText: on.text,
    });
    expect(JSON.stringify(untold)).toContain("couldn't check");
  }, 60_000);

  it("the card log carries the kinds and nothing of the text", async () => {
    await streamSse(undefined, {
      ladderNote: true,
    } as Partial<EnforcedStreamOpts>);
    const cards = mockLog.info.mock.calls
      .filter(([event]) => event === "contract_enforce_card")
      .map(([, meta]) => meta);
    expect(cards.map((c) => [c.factIdPrefix, c.stage, c.noteKinds])).toEqual([
      ["M1", "pass", undefined],
      ["M2", "sentence_drop", ["evaluation"]],
      ["M3", "sentence_drop", ["tactic", "evaluation"]],
      ["M4", "sentence_drop", undefined],
      ["M5", "templated", undefined],
    ]);
    for (const c of cards) {
      expect(Object.keys(c)).not.toContain("note");
      expect(JSON.stringify(c)).not.toContain("couldn't check");
    }
  }, 60_000);

  it("a noted review is cached under its own key, and neither setting is served the other's text", async () => {
    vi.stubEnv("COACH_LADDER_NOTE", "1");
    const on = await serve();
    expect(on.cached).toBe(false);
    expect(on.streamCalls).toBe(1);
    expect(on.analysis).toContain(`\n${NOTE_EVAL}\n[WHY]`);
    expect(on.analysis).toContain(`\n${NOTE_TACTIC_EVAL}\n[WHY]`);
    expect(getCachedResponse(`${plainKey()}|ln1`)).toBe(on.analysis);
    expect(getCachedResponse(plainKey())).toBeNull();

    vi.stubEnv("COACH_LADDER_NOTE", undefined);
    const off = await serve();
    expect(off.cached).toBe(false);
    expect(off.streamCalls).toBe(1);
    expect(off.analysis).not.toContain("couldn't check");
    expect(off.analysis).toBe(unnoted(on.analysis));
    const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
    expect(sha(off.analysis)).toBe(golden.serving.analysis);

    vi.stubEnv("COACH_LADDER_NOTE", "1");
    const again = await serve();
    expect(again.cached).toBe(true);
    expect(again.streamCalls).toBe(0);
    expect(again.analysis).toBe(on.analysis);
    expect(again.emitted).toBe(on.analysis);
  }, 60_000);

  it("the variant key is the plain key plus |ln1, and writing one never satisfies the other", () => {
    const args = [
      CACHE_INPUTS.currentFen,
      CACHE_INPUTS.skillLevel,
      CACHE_INPUTS.userMessage,
      CACHE_INPUTS.personaSignature,
      CACHE_INPUTS.moveHistory,
    ] as const;
    const plain = generateContractCacheKey(...args);
    const noted = generateContractCacheKey(...args, "ln1");
    expect(noted).toBe(`${plain}|ln1`);
    expect(generateContractCacheKey(...args, undefined)).toBe(plain);
    expect(generateContractCacheKey(...args, "")).toBe(plain);

    setCachedResponse(plain, "plain text", 1.0);
    expect(getCachedResponse(noted)).toBeNull();
    clearCache();
    setCachedResponse(noted, "noted text", 1.0);
    expect(getCachedResponse(plain)).toBeNull();
    expect(getCachedResponse(noted)).toBe("noted text");
  });
});
