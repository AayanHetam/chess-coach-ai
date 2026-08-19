import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The puzzle coach's `[SHOW_MOVE: …]` tag becomes a card the user clicks to
 * replay a line on the real board. Every SAN in it is model-written, and the
 * response schema asks only for `z.string().min(2).max(8)` — which "Qz9"
 * satisfies. Nothing checked legality.
 *
 * It failed silently in both directions: the playback loop in
 * `pages/puzzles.tsx` is `try { g.move(m) } catch { break }`, so the board
 * played the legal prefix and stopped dead under a card still listing the
 * whole line — and `setCachedHint` then memoised the line, so one
 * hallucination was replayed to everyone who reached that puzzle.
 *
 * These tests are about the second half: what the route lets out, and what it
 * writes to the cache.
 */

const { mockCallLLM, mockSetCachedHint, mockGetCachedHint, mockLog } = vi.hoisted(
  () => ({
    mockCallLLM: vi.fn(),
    mockSetCachedHint: vi.fn(),
    mockGetCachedHint: vi.fn(),
    mockLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }),
);

vi.mock("@/lib/logging", () => ({
  logger: { child: vi.fn(() => mockLog) },
  logErrorToSentry: vi.fn(),
  extractRequestId: () => "hint-test-request",
}));
vi.mock("@/lib/llmProvider", () => ({
  callLLM: mockCallLLM,
  LLMError: class LLMError extends Error {},
  PUBLIC_LLM_ERROR: "llm error",
  toSafeLLMError: (e: unknown) => ({ message: String(e) }),
}));
vi.mock("@/lib/puzzleHint/cache", () => ({
  getCachedHint: mockGetCachedHint,
  setCachedHint: mockSetCachedHint,
}));

import { POST } from "../route";

/**
 * A real Lichess-shaped puzzle: Italian Game after 1.e4 e5 2.Nf3 Nc6 3.Bc4,
 * Black to move. solution[0] is the opponent's setup move per the schema's
 * convention.
 */
const PUZZLE = {
  id: "test01",
  fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
  solution: ["f8c5", "b2b4", "c5b4"],
  themes: [],
};

function req(stage = "answer") {
  return new NextRequest("http://localhost/api/puzzle-hint", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ puzzle: PUZZLE, stage }),
  });
}

function llmReturning(prose: string) {
  return {
    content: prose,
    model: "claude-sonnet-4-6",
    provider: "anthropic",
    inputTokens: 10,
    outputTokens: 10,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCachedHint.mockReturnValue(null);
});

describe("puzzle-hint — a demo line the board cannot play", () => {
  it("serves a legal line and caches it (control: the guard is not blanket-rejecting)", async () => {
    // Without this, every assertion below could pass because the route dropped
    // EVERY demo line, which would be a different bug with the same symptoms.
    mockCallLLM.mockResolvedValue(
      llmReturning("Bc5 develops with tempo.\n\n[SHOW_MOVE: Bc5 b4 Bxb4]"),
    );
    const res = await POST(req());
    const body = await res.json();

    expect(body.showMoves).toEqual(["Bc5", "b4", "Bxb4"]);
    expect(mockSetCachedHint).toHaveBeenCalled();
  });

  it("drops a line containing an impossible move", async () => {
    mockCallLLM.mockResolvedValue(
      llmReturning("Win the queen.\n\n[SHOW_MOVE: Bc5 b4 Qh8]"),
    );
    const res = await POST(req());
    const body = await res.json();

    expect(body.showMoves).toBeUndefined();
  });

  it("never memoises the response whose line it had to drop", async () => {
    // The cache is keyed by (puzzleId, stage, attempt), so one bad generation
    // would otherwise be served to every later solver of this puzzle.
    mockCallLLM.mockResolvedValue(
      llmReturning("Win the queen.\n\n[SHOW_MOVE: Bc5 b4 Qh8]"),
    );
    await POST(req());
    expect(mockSetCachedHint).not.toHaveBeenCalled();
  });

  it("drops notation that is not a move at all", async () => {
    mockCallLLM.mockResolvedValue(
      llmReturning("Try this.\n\n[SHOW_MOVE: Qz9 hello]"),
    );
    const res = await POST(req());
    expect((await res.json()).showMoves).toBeUndefined();
    expect(mockSetCachedHint).not.toHaveBeenCalled();
  });

  it("still answers the user — the prose is not thrown away with the line", async () => {
    // Dropping the demo must not turn into refusing to help. The explanation
    // may be perfectly good; it is the board handshake that was wrong.
    mockCallLLM.mockResolvedValue(
      llmReturning("The bishop is the piece to look at.\n\n[SHOW_MOVE: Qh8]"),
    );
    const res = await POST(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.prose).toContain("bishop");
  });

  it("says so in the logs, since the user just silently loses a button", async () => {
    mockCallLLM.mockResolvedValue(
      llmReturning("Win the queen.\n\n[SHOW_MOVE: Bc5 b4 Qh8]"),
    );
    await POST(req());
    expect(mockLog.warn).toHaveBeenCalledWith(
      "puzzle-hint unplayable demo line dropped",
      expect.objectContaining({ puzzleId: "test01" }),
    );
  });
});
