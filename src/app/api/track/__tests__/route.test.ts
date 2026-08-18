import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockTrackEvent, mockGetSession } = vi.hoisted(() => ({
  mockTrackEvent: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => fn() };
});
vi.mock("@/env", () => ({
  getTrackingEnv: () => ({ enabled: true, ipSalt: "test-salt" }),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/tracking/consent", () => ({ hasTrackingConsent: () => true }));
vi.mock("@/lib/tracking/track", () => ({
  trackEvent: mockTrackEvent,
  hashIp: () => null,
  currentAppVersion: () => null,
}));

import { POST } from "../route";

function request(events: unknown[]) {
  return new Request("http://localhost/api/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events }),
  });
}

describe("POST /api/track event allowlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ uid: "user-1", isIntern: false });
  });

  it("accepts the supported page-view properties", async () => {
    const response = await POST(
      request([{ name: "page.view", props: { path: "/analysis" } }])
    );

    expect(response.status).toBe(204);
    expect(mockTrackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "page.view",
        props: { path: "/analysis" },
        surface: "/analysis",
      })
    );
  });

  it.each([
    { prompt: "sensitive prompt" },
    { messages: [{ role: "user", content: "sensitive message" }] },
    { response: "sensitive AI response" },
    { fen: "sensitive FEN" },
    { pgn: "sensitive PGN" },
    { error: "sensitive provider body" },
    { title: "sensitive AI response" },
    { arbitrary: { nested: "content" } },
  ])("rejects unsupported or sensitive event properties: %j", async (props) => {
    const response = await POST(request([{ name: "page.view", props }]));

    expect(response.status).toBe(400);
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it.each([
    { surface: "sensitive prompt" },
    { requestId: "sensitive-response" },
    { sessionId: "sensitive message" },
    { ts: "sensitive PGN" },
  ])(
    "rejects sensitive content in unsupported top-level fields: %j",
    async (extra) => {
      const response = await POST(
        request([{ name: "page.view", props: { path: "/analysis" }, ...extra }])
      );

      expect(response.status).toBe(400);
      expect(mockTrackEvent).not.toHaveBeenCalled();
    }
  );

  it("rejects query content in page paths", async () => {
    const response = await POST(
      request([
        { name: "page.view", props: { path: "/analysis?prompt=secret" } },
      ])
    );

    expect(response.status).toBe(400);
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("rejects unsupported event names", async () => {
    const response = await POST(
      request([{ name: "chat.message", props: { content: "sensitive chat" } }])
    );

    expect(response.status).toBe(400);
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });
});
