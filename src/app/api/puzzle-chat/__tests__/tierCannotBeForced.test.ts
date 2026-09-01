import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * /api/puzzle-chat is anonymous, so the request body is the entire cost
 * surface and every expensive decision must be one the SERVER makes.
 *
 * The hole this pins: `turnIndex` is a client field, and the route used to
 * read it directly to pick the tier. Sending `turnIndex: 0` on every call —
 * with a full 32-turn history attached — pinned flagship Sonnet on the
 * largest possible prompt, from an unauthenticated endpoint. The schema's own
 * header claimed the opposite ("server-driven via turnIndex, not
 * client-supplied"), which is exactly the sort of comment that outlives the
 * guarantee it describes.
 *
 * The invariant now: flagship is reachable ONLY on a genuinely initial turn,
 * which is also the smallest prompt there is.
 */

const { mockCallLLMStream } = vi.hoisted(() => ({
  mockCallLLMStream: vi.fn(),
}));

vi.mock("@/lib/logging", () => ({
  logger: {
    child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  logErrorToSentry: vi.fn(),
  extractRequestId: () => "req",
}));
vi.mock("@/lib/llmProvider", () => ({
  callLLMStream: mockCallLLMStream,
  LLMError: class LLMError extends Error {},
  PUBLIC_LLM_ERROR: { code: "AI_PROVIDER_UNAVAILABLE", message: "unavailable" },
  toSafeLLMError: (e: unknown) => ({ message: String(e) }),
}));

import { POST } from "../route";
import { MAX_HISTORY_CHARS } from "@/lib/validation/puzzleChatSchemas";

const PUZZLE = {
  id: "p1",
  fen: "1r4k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1",
  solution: ["b8b2", "a1a8"],
  themes: [],
};

/** Async-iterable stub so the route's `for await` terminates immediately. */
function emptyStream() {
  return {
    async *[Symbol.asyncIterator]() {
      /* no events; the route closes the stream */
    },
  };
}

function req(body: Record<string, unknown>, ip = "1.2.3.4") {
  return new NextRequest("http://localhost/api/puzzle-chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ puzzle: PUZZLE, outcome: "solved", ...body }),
  });
}

/** Drain the SSE body so the stream's start() actually runs. */
async function drain(res: Response) {
  if (res.body) await new Response(res.body).text();
}

const ORIGINAL = { ...process.env };
let ip = 0;
/** Fresh IP per call so the courtesy throttle never confounds a tier test. */
const nextIp = () => `10.0.0.${(ip = (ip + 1) % 250) + 1}`;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AI_COACH_DISABLED;
  mockCallLLMStream.mockImplementation(() => emptyStream());
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("puzzle-chat tier cannot be forced by the client", () => {
  it("uses flagship for a genuinely initial turn (no history, no message)", async () => {
    await drain(await POST(req({ turnIndex: 0, history: [] }, nextIp())));
    expect(mockCallLLMStream).toHaveBeenCalledTimes(1);
    expect(mockCallLLMStream.mock.calls[0][0].tier).toBe("flagship");
  });

  it("REFUSES flagship when turnIndex:0 arrives with a history", async () => {
    // The exploit, verbatim: claim turn 0 while carrying a full conversation.
    const history = Array.from({ length: 32 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: "x".repeat(900),
    }));
    await drain(
      await POST(
        req({ turnIndex: 0, history, userMessage: "again" }, nextIp()),
      ),
    );
    expect(mockCallLLMStream).toHaveBeenCalledTimes(1);
    expect(mockCallLLMStream.mock.calls[0][0].tier).toBe("fast");
  });

  it("REFUSES flagship when turnIndex:0 arrives with a typed message", async () => {
    await drain(
      await POST(req({ turnIndex: 0, history: [], userMessage: "hi" }, nextIp())),
    );
    expect(mockCallLLMStream.mock.calls[0][0].tier).toBe("fast");
  });

  it("gives the initial turn the larger output budget, follow-ups the smaller", async () => {
    await drain(await POST(req({ turnIndex: 0, history: [] }, nextIp())));
    expect(mockCallLLMStream.mock.calls[0][0].maxTokens).toBe(600);

    mockCallLLMStream.mockClear();
    await drain(
      await POST(req({ turnIndex: 0, history: [], userMessage: "why?" }, nextIp())),
    );
    // turnIndex still says 0, but the typed message makes it a follow-up.
    expect(mockCallLLMStream.mock.calls[0][0].maxTokens).toBe(350);
  });

  it("still rejects a follow-up with no message", async () => {
    const res = await POST(
      req(
        { turnIndex: 5, history: [{ role: "assistant", content: "prior" }] },
        nextIp(),
      ),
    );
    expect(res.status).toBe(400);
    expect(mockCallLLMStream).not.toHaveBeenCalled();
  });
});

describe("puzzle-chat bounds the anonymous request body", () => {
  it("rejects a history whose TOTAL size exceeds the budget", async () => {
    // Each turn is individually legal (<= 8000); only the sum is abusive.
    const history = Array.from({ length: 30 }, () => ({
      role: "user" as const,
      content: "x".repeat(4000),
    }));
    expect(history.reduce((n, t) => n + t.content.length, 0)).toBeGreaterThan(
      MAX_HISTORY_CHARS,
    );
    const res = await POST(req({ turnIndex: 1, history, userMessage: "go" }, nextIp()));
    expect(res.status).toBe(400);
    expect(mockCallLLMStream).not.toHaveBeenCalled();
  });

  it("accepts a realistic long session", async () => {
    const history = Array.from({ length: 32 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: "x".repeat(700),
    }));
    expect(history.reduce((n, t) => n + t.content.length, 0)).toBeLessThanOrEqual(
      MAX_HISTORY_CHARS,
    );
    await drain(
      await POST(req({ turnIndex: 12, history, userMessage: "go" }, nextIp())),
    );
    expect(mockCallLLMStream).toHaveBeenCalledTimes(1);
  });
});

describe("puzzle-chat throttles a single source", () => {
  it("returns 429 once one IP exceeds the window, without calling the model", async () => {
    const hot = "203.0.113.9";
    let refused: Response | null = null;
    for (let i = 0; i < 25; i++) {
      const res = await POST(req({ turnIndex: 0, history: [] }, hot));
      if (res.status === 429) {
        refused = res;
        break;
      }
      await drain(res);
    }
    expect(refused).not.toBeNull();
    expect(refused!.headers.get("Retry-After")).toBe("60");
    // The throttle must bite BEFORE the provider call, or it saves nothing.
    expect(mockCallLLMStream.mock.calls.length).toBeLessThan(25);
  });
});
