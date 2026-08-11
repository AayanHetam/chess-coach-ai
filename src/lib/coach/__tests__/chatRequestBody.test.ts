import { describe, expect, it } from "vitest";
import { buildChatRequestBody } from "../chatRequestBody";

/**
 * REPRODUCTION (2026-08-11): every coach follow-up is answered about the
 * game's FINAL position, no matter which move the user is viewing.
 *
 * The send sites in AnalysisImpl already pass the viewed board
 * (`fen: displayFen` / `fen: fenAtPly`) into streamCoachReply — the fast-path
 * body just never forwards it. The server then falls back to `context.fen`
 * (the fully-replayed final position) and presents it to the model as
 * "the position the user is looking at RIGHT NOW".
 *
 * These tests fail on the code as written. That failure IS the bug.
 */

const START =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// An arbitrary mid-game position — stands in for "user scrolled back to move 12".
const VIEWED =
  "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";

const base = {
  contextId: "ctx-123",
  userMessage: "What should I have played here?",
  conversationHistory: [
    { role: "user" as const, content: "review my game" },
    { role: "assistant" as const, content: "Here's the review…" },
  ],
};

describe("coach follow-up request body", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // The next three use `it.fails` — they are EXPECTED TO FAIL and vitest
  // passes them precisely because the bug is still live. That keeps CI green
  // while preserving an executable reproduction.
  //
  // WHEN YOU FIX Group B (see MASTERMIND_CONTEXT/SILENT_SUBSTITUTION_HANDOFF.md):
  //   1. Wire buildChatRequestBody into AnalysisImpl's fast path FIRST
  //      (behaviour-preserving), so these assertions cover real code.
  //   2. Then add fen/moveIndex to the returned object.
  //   3. Then flip `it.fails` → `it` here. If a flip does NOT go green, the
  //      fix is incomplete — do not delete the assertion.
  // ─────────────────────────────────────────────────────────────────────────
  it.fails("forwards the viewed position so the server grounds on the right board", () => {
    const body = buildChatRequestBody({ ...base, fen: VIEWED, currentPly: 24 });
    expect(body.fen).toBe(VIEWED);
  });

  it.fails("forwards the ply cursor alongside the FEN", () => {
    const body = buildChatRequestBody({ ...base, fen: VIEWED, currentPly: 24 });
    expect(body.moveIndex).toBe(24);
  });

  it.fails("never silently substitutes a different position", () => {
    const body = buildChatRequestBody({ ...base, fen: START, currentPly: 0 });
    expect(body.fen).not.toBeUndefined();
    expect(body.fen).toBe(START);
  });

  it("still carries the fields the fast path already sent", () => {
    const body = buildChatRequestBody({ ...base, fen: VIEWED, currentPly: 24 });
    expect(body.contextId).toBe("ctx-123");
    expect(body.userMessage).toBe(base.userMessage);
    expect(body.conversationHistory).toHaveLength(2);
  });

  it("omits fen when the caller genuinely has no position (no fabricated default)", () => {
    const body = buildChatRequestBody(base);
    expect(body.fen).toBeUndefined();
    expect(body.moveIndex).toBeUndefined();
  });
});
