import { describe, it, expect } from "vitest";
import {
  ENGINE_READY_LINE,
  ENGINE_SWEEPING_LINE,
  appendEngineReady,
  buildEngineReadyMessage,
  buildSweepGreeting,
  type EngineSweepMessage,
} from "@/components/preview-analysis/engineSweepMessages";
import { buildConversationHistory } from "@/lib/coach/conversationHistory";

/**
 * Masti around the engine sweep on /analysis: "wait a second" while
 * Stockfish goes through the game, "ok, ask me anything" once it returns.
 * The page appends the second line from the two places a sweep lands (the
 * evaluate promise and the session cache restore), so the one-per-sweep rule
 * has to hold in the reducer, not in either caller.
 */

describe("buildSweepGreeting", () => {
  it("names the players and the year, then asks for a second", () => {
    const m = buildSweepGreeting({
      White: "Kasparov",
      Black: "Topalov",
      Date: "1999.01.20",
    });
    expect(m.content).toBe(
      `Loaded **Kasparov vs Topalov** (1999). ${ENGINE_SWEEPING_LINE}`
    );
    expect(m.engineSweep).toBe("sweeping");
    expect(m.mascot).toBe("thinking");
    expect(m.synthetic).toBe(true);
    expect(m.role).toBe("coach");
    expect(m.ply).toBe(0);
  });

  it("drops the chess.js date placeholder instead of printing (????)", () => {
    const m = buildSweepGreeting({
      White: "a",
      Black: "b",
      Date: "????.??.??",
    });
    expect(m.content).toBe(`Loaded **a vs b**. ${ENGINE_SWEEPING_LINE}`);
  });

  it("falls back to a plain load line when the PGN names nobody", () => {
    expect(buildSweepGreeting({}).content).toBe(
      `Loaded a new game. ${ENGINE_SWEEPING_LINE}`
    );
    expect(buildSweepGreeting({ White: "only" }).content).toBe(
      `Loaded a new game. ${ENGINE_SWEEPING_LINE}`
    );
  });
});

describe("buildEngineReadyMessage", () => {
  it("is the UI-authored invitation, waving", () => {
    const m = buildEngineReadyMessage();
    expect(m.content).toBe(ENGINE_READY_LINE);
    expect(m.engineSweep).toBe("ready");
    expect(m.mascot).toBe("wave");
    expect(m.synthetic).toBe(true);
    expect(m.role).toBe("coach");
  });
});

describe("appendEngineReady", () => {
  const greeting = buildSweepGreeting({ White: "a", Black: "b" });

  it("appends the ready turn after the sweeping greeting", () => {
    const next = appendEngineReady([greeting]);
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(greeting);
    expect((next[1] as EngineSweepMessage).engineSweep).toBe("ready");
    expect(next[1].content).toBe(ENGINE_READY_LINE);
  });

  it("announces a sweep once: the second landing is a no-op", () => {
    const once = appendEngineReady([greeting]);
    const twice = appendEngineReady(once);
    expect(twice).toBe(once);
    expect(twice).toHaveLength(2);
  });

  it("leaves a transcript without the greeting alone (restored chats, bare positions)", () => {
    const restored = [
      { role: "coach" as const, content: "Loaded a custom position." },
      { role: "user" as const, content: "what now?" },
      { role: "coach" as const, content: "Push the pawn." },
    ];
    expect(appendEngineReady(restored)).toBe(restored);
    const empty: EngineSweepMessage[] = [];
    expect(appendEngineReady(empty)).toBe(empty);
  });

  it("keeps whatever landed in the transcript during the sweep", () => {
    // A slash command or a synthetic pill exchange can add turns while the
    // composer is locked; the announcement still goes at the end.
    const during = [
      greeting,
      { role: "user" as const, content: "/practice forks", synthetic: true },
      {
        role: "coach" as const,
        content: "Three forks, coming up.",
        synthetic: true,
      },
    ];
    const next = appendEngineReady(during);
    expect(next).toHaveLength(4);
    expect(next.slice(0, 3)).toEqual(during);
    expect(next[3].content).toBe(ENGINE_READY_LINE);
  });

  it("never reaches the model: both turns are dropped from the replayed history", () => {
    const transcript = appendEngineReady([greeting]);
    expect(buildConversationHistory(transcript)).toEqual([]);
    const withAsk = [
      ...transcript,
      { role: "user" as const, content: "Analyze my game." },
      { role: "coach" as const, content: "Move 12 was the turning point." },
    ];
    expect(buildConversationHistory(withAsk)).toEqual([
      { role: "user", content: "Analyze my game." },
      { role: "assistant", content: "Move 12 was the turning point." },
    ]);
  });
});
