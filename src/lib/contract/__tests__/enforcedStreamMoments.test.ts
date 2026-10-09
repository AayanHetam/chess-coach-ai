/**
 * The enforced stream's moments (pathway 4.1, COACH_TURN1_MOMENTS).
 *
 * The text the client gets is the same with and without the moment
 * emitter, each moment goes out just before its card's burst, and a card
 * the ladder did not pass (a template, an unanchored or sentinel block, an
 * unclosed one) sends none. A lift that throws costs the moment, never the
 * card. Hermetic: deterministic referee, no network.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createEnforcedContractStream } from "@/lib/contract/enforcedStream";
import type { EnforcedStreamOpts } from "@/lib/contract/enforcedStream";
import { renderInsightHeader } from "@/lib/contract/insightGrammar";
import { LIFTED_STAGES } from "@/lib/contract/turnMoments";
import { cardKey } from "@/lib/coach/turnMoment";
import type { TurnMoment } from "@/lib/coach/turnMoment";
import { evalFact, makeContract, makeInsight } from "./insightFactory";

const { liftControl } = vi.hoisted(() => ({
  liftControl: { throwFor: null as string | null },
}));

vi.mock("@/lib/logging", () => ({
  logger: {
    child: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  },
}));

// The real lift, with a switch that makes it throw for one card.
vi.mock("@/lib/contract/turnMoments", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/contract/turnMoments")>();
  return {
    ...actual,
    liftTurnMoment: (args: Parameters<typeof actual.liftTurnMoment>[0]) => {
      if (liftControl.throwFor === args.insight.factIdPrefix) {
        throw new Error("lift bug");
      }
      return actual.liftTurnMoment(args);
    },
  };
});

afterEach(() => {
  liftControl.throwFor = null;
});

const insightA = makeInsight(); // M1, move 11 w, Bd3
const insightB = makeInsight({
  moveNumber: 14,
  color: "b",
  playedSan: "Bd3",
  factIdPrefix: "M2",
  topMistakeRank: 2,
});
const contract = makeContract([insightA, insightB]);

// enforcedStream.test.ts's CLEAN_A, its two sentences as the Idea and Problem lines.
const CARD_A_BODY = [
  "[WHY]",
  "Idea: Solid effort, but Ne6 was the move [F:M1].",
  "Problem: After Ne6 Qd7 Nxg7 White nets the advantage at +3.20 [F:M1.pv0].",
  "[/WHY]",
].join("\n");
const CARD_B_BODY = [
  "[WHY]",
  "Idea: Steady move [F:M2].",
  "Problem: It kept the bishop in play [F:M2].",
  "[/WHY]",
].join("\n");
const FABRICATED_B =
  "The eval crashed to -9.50 in this spot for -9.50 reasons.";

const ENFORCE_TABLE = {
  eval_display: "error",
  san_whitelist: "error",
  tactical_keyword: "error",
  forbidden_claim: "error",
  relational_claim: "error",
  citation_invalid: "error",
} as const;

const headerA = renderInsightHeader(insightA);
const headerB = renderInsightHeader(insightB);
const block = (header: string, body: string) =>
  `${header}\n${body}\n[/INSIGHT]`;
const TWO_CARDS = `Let's walk through the key moments [F:M1].\n\n${block(headerA, CARD_A_BODY)}\n\n${block(headerB, CARD_B_BODY)}`;

type Call =
  | { kind: "text"; text: string }
  | { kind: "moment"; moment: TurnMoment };

function makeStream(
  withMoments: boolean,
  over: Partial<EnforcedStreamOpts> = {}
) {
  const emitted: string[] = [];
  const calls: Call[] = [];
  const stream = createEnforcedContractStream({
    contract,
    emit: (t) => {
      emitted.push(t);
      calls.push({ kind: "text", text: t });
    },
    correlationId: "moments",
    refereeMode: "deterministic",
    citationGranularity: "sentence",
    deadlineAtMs: Date.now() + 60_000,
    regenSystem: { stable: "SYS", perUser: "USER" },
    armingTable: ENFORCE_TABLE,
    ...(withMoments
      ? {
          emitMoment: (m: TurnMoment) =>
            calls.push({ kind: "moment", moment: m }),
        }
      : {}),
    ...over,
  });
  return { stream, emitted, calls };
}

function feed(stream: { push(d: string): void }, text: string, chunk = 13) {
  for (let i = 0; i < text.length; i += chunk)
    stream.push(text.slice(i, i + chunk));
}

async function run(text: string, withMoments: boolean) {
  const s = makeStream(withMoments);
  feed(s.stream, text);
  const summary = await s.stream.end();
  return { ...s, summary };
}

describe("the fixture", () => {
  it("both cards pass the ladder at a stage the lift takes", async () => {
    const { summary } = await run(TWO_CARDS, true);
    expect(summary.cards.map((c) => c.factIdPrefix)).toEqual(["M1", "M2"]);
    for (const c of summary.cards)
      expect(LIFTED_STAGES.has(c.stage)).toBe(true);
  });
});

describe("enforced stream with the moment emitter", () => {
  it("emits the same text with and without it", async () => {
    const off = await run(TWO_CARDS, false);
    const on = await run(TWO_CARDS, true);
    expect(on.emitted).toEqual(off.emitted);
    expect(on.summary.finalText).toBe(off.summary.finalText);
    expect(off.summary.moments).toEqual([]);
    expect(on.summary.moments).toHaveLength(2);
  });

  it("sends each moment just before its card's burst, keyed to that burst", async () => {
    const { calls } = await run(TWO_CARDS, true);
    const momentIdx = calls
      .map((c, i) => (c.kind === "moment" ? i : -1))
      .filter((i) => i >= 0);
    expect(momentIdx).toHaveLength(2);
    for (const i of momentIdx) {
      const m = calls[i] as Extract<Call, { kind: "moment" }>;
      const next = calls[i + 1] as Extract<Call, { kind: "text" }>;
      expect(next.kind).toBe("text");
      expect(next.text.startsWith("[INSIGHT:")).toBe(true);
      expect(next.text.endsWith("[/INSIGHT]")).toBe(true);
      expect(cardKey(next.text)).toBe(m.moment.card.key);
    }
    const [a, b] = momentIdx.map(
      (i) => (calls[i] as Extract<Call, { kind: "moment" }>).moment
    );
    expect(a.card.factIdPrefix).toBe("M1");
    expect(a.idea).toBe("Solid effort, but Ne6 was the move.");
    expect(a.happens).toBe(
      "After Ne6 Qd7 Nxg7 White nets the advantage at +3.20."
    );
    expect(b.card.factIdPrefix).toBe("M2");
    // The whole prefix went out before the first moment.
    const before = calls
      .slice(0, momentIdx[0])
      .map((c) => (c.kind === "text" ? c.text : ""))
      .join("");
    expect(before).toContain("Let's walk through the key moments.");
  });

  it("returns the moments in card order on the summary", async () => {
    const { summary, calls } = await run(TWO_CARDS, true);
    expect(summary.moments.map((m) => m.card.factIdPrefix)).toEqual([
      "M1",
      "M2",
    ]);
    expect(summary.moments).toEqual(
      calls
        .filter((c) => c.kind === "moment")
        .map((c) => (c as Extract<Call, { kind: "moment" }>).moment)
    );
  });

  it("sends none for a templated card", async () => {
    const { summary, calls } = await run(
      `${block(headerA, CARD_A_BODY)}\n${block(headerB, FABRICATED_B)}`,
      true
    );
    expect(summary.ladderDistribution.templated).toBe(1);
    expect(summary.moments.map((m) => m.card.factIdPrefix)).toEqual(["M1"]);
    expect(calls.filter((c) => c.kind === "moment")).toHaveLength(1);
  });

  it("sends none for an unanchored card", async () => {
    const { summary } = await run(
      `${TWO_CARDS}\n[INSIGHT:29:w:mistake:+0.10:-0.90:h4:g3]\n[WHY]\nIdea: An invented card.\nProblem: Nothing backs it.\n[/WHY]\n[/INSIGHT]`,
      true
    );
    expect(summary.unanchoredBlocks).toBe(1);
    expect(summary.moments.map((m) => m.card.factIdPrefix)).toEqual([
      "M1",
      "M2",
    ]);
  });

  it("sends none for a block about a sentinel ply", async () => {
    const good = makeInsight({ factIdPrefix: "M1", topMistakeRank: 1 });
    const sentinel = makeInsight({
      factIdPrefix: "I1",
      moveNumber: 22,
      color: "b",
      playedSan: "Nf6",
      topMistakeRank: null,
      intelligenceRank: 1,
      classification: "inaccuracy",
      evalBefore: evalFact({
        sentinel: true,
        cp: 0,
        depth: 0,
        display: "engine data unavailable",
      }),
    });
    const moments: TurnMoment[] = [];
    const stream = createEnforcedContractStream({
      contract: makeContract([good, sentinel]),
      emit: () => {},
      emitMoment: (m) => moments.push(m),
      correlationId: "sentinel",
      refereeMode: "deterministic",
      citationGranularity: "sentence",
      deadlineAtMs: Date.now() + 60_000,
      regenSystem: { stable: "", perUser: "" },
      armingTable: ENFORCE_TABLE,
    });
    feed(
      stream,
      `${block(renderInsightHeader(good), CARD_A_BODY)}\n\n${block(renderInsightHeader(sentinel), "[WHY]\nIdea: You wanted the knight out [F:I1].\nProblem: It cost you ground [F:I1].\n[/WHY]")}`
    );
    const summary = await stream.end();
    expect(summary.sentinelBlocksRefused).toBe(1);
    expect(moments.map((m) => m.card.factIdPrefix)).toEqual(["M1"]);
  });

  it("sends none for an unclosed block", async () => {
    const { summary } = await run(
      `${block(headerA, CARD_A_BODY)}\n\n${headerB}\n[WHY]\nIdea: Steady move [F:M2].\nProblem: cut off mid`,
      true
    );
    expect(summary.unclosedBlock).toBe(true);
    expect(summary.moments.map((m) => m.card.factIdPrefix)).toEqual(["M1"]);
  });

  it("a lift that throws costs the moment, never the card", async () => {
    const off = await run(TWO_CARDS, false);
    liftControl.throwFor = "M1";
    const on = await run(TWO_CARDS, true);
    expect(on.emitted).toEqual(off.emitted);
    expect(on.summary.moments.map((m) => m.card.factIdPrefix)).toEqual(["M2"]);
    expect(on.emitted.join("")).toContain(headerA);
  });
});
