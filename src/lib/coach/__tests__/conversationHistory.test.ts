import { describe, expect, it } from "vitest";
import {
  buildConversationHistory,
  type CoachHistoryMessage,
} from "../conversationHistory";

/**
 * GROUP D (SILENT_SUBSTITUTION_HANDOFF §3) — history contamination.
 *
 * `conversationHistory` is replayed to the model as its OWN prior turns, which
 * it treats as authoritative and will defend. So a wrong entry here does not
 * cause one bad answer, it causes a persistent one. This is the group that
 * turns a single fabrication into a position the coach argues for.
 */

const m = (over: Partial<CoachHistoryMessage>): CoachHistoryMessage => ({
  role: "coach",
  content: "real model output",
  ...over,
});

describe("buildConversationHistory", () => {
  it("maps coach turns to assistant and preserves order", () => {
    const out = buildConversationHistory([
      m({ role: "user", content: "why was that bad?" }),
      m({ content: "because the knight hangs" }),
    ]);
    expect(out).toEqual([
      { role: "user", content: "why was that bad?" },
      { role: "assistant", content: "because the knight hangs" },
    ]);
  });

  it("D2 — drops the seeded demo exchange", () => {
    // The seed contains hand-written eval numbers ("+2.4 to +4.7", "Kasparov
    // calculated 15+ ply"). A human wrote them; the model reads them as its own
    // analysis and will defend those numbers.
    const out = buildConversationHistory([
      m({ synthetic: true, content: "eval jumps from +2.4 to +4.7" }),
      m({ role: "user", synthetic: true, content: "Why is 24.Rxd4 brilliant?" }),
      m({ role: "user", content: "what about move 12?" }),
    ]);
    expect(out).toEqual([{ role: "user", content: "what about move 12?" }]);
  });

  it("D3 — drops UI-authored error banners", () => {
    // The model must never read "**Coach is offline** (HTTP 502)" as something
    // it said. These overwrite the partial stream in place, so without a flag
    // they are indistinguishable from a real answer.
    const out = buildConversationHistory([
      m({ synthetic: true, content: "**Coach is offline** (HTTP 502)." }),
    ]);
    expect(out).toEqual([]);
  });

  it("D3 — drops BOTH halves of the fabricated suggestion-pill exchange", () => {
    // The pill pushes a user turn AND a coach turn with no API call at all.
    // Dropping only the coach half would leave a question the model never
    // answered, which reads as an ignored user.
    const out = buildConversationHistory([
      m({ role: "user", synthetic: true, content: "Show me similar puzzles" }),
      m({ synthetic: true, content: "Pulled three positions in the same family…" }),
      m({ role: "user", content: "real question" }),
    ]);
    expect(out).toEqual([{ role: "user", content: "real question" }]);
  });

  it("D4 — drops a turn whose stream was cut off", () => {
    // A half-finished sentence replayed as a completed thought is worse than
    // no history: the model treats the fragment as its settled position.
    const out = buildConversationHistory([
      m({ content: "The critical moment is move 24 where you", incomplete: true }),
      m({ role: "user", content: "and then?" }),
    ]);
    expect(out).toEqual([{ role: "user", content: "and then?" }]);
  });

  it("drops the empty placeholder bubble a live stream is still filling", () => {
    const out = buildConversationHistory([
      m({ content: "" }),
      m({ content: "   " }),
      m({ content: "actual answer" }),
    ]);
    expect(out).toEqual([{ role: "assistant", content: "actual answer" }]);
  });

  it("keeps genuine model output untouched — including text that LOOKS like an error", () => {
    // The flag is set by the writer, not inferred from the text. A coach
    // legitimately explaining an error message must survive.
    const real = "Your opponent's clock hit zero — that's an HTTP 502 of chess.";
    const out = buildConversationHistory([m({ content: real })]);
    expect(out).toEqual([{ role: "assistant", content: real }]);
  });

  it("keeps a corrected answer (D1 replaces content in place, it is not synthetic)", () => {
    const out = buildConversationHistory([
      m({ content: "CORRECTED: the knight was defended" }),
    ]);
    expect(out).toEqual([
      { role: "assistant", content: "CORRECTED: the knight was defended" },
    ]);
  });

  it("returns nothing for an all-synthetic session (first-time visitor on the demo)", () => {
    // The default first-visit path: the demo game is on screen and every turn
    // present is seeded. Sending none is correct — sending fabrications is not.
    expect(
      buildConversationHistory([
        m({ synthetic: true }),
        m({ role: "user", synthetic: true }),
        m({ synthetic: true }),
      ]),
    ).toEqual([]);
  });
});
