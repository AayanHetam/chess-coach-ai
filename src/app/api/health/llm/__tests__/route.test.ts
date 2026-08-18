import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireAdmin, mockCallLLM } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockCallLLM: vi.fn(),
}));

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/llmProvider", () => ({ callLLM: mockCallLLM }));

import { GET, POST } from "../route";

function request(headers?: Record<string, string>) {
  return new Request("https://chessmasti.com/api/health/llm", {
    method: "POST",
    headers: {
      origin: "https://chessmasti.com",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
  });
}

describe("/api/health/llm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 405 for GET without contacting either provider", () => {
    const response = GET();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(mockRequireAdmin).not.toHaveBeenCalled();
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it("returns 401 without contacting either provider for an anonymous visitor", async () => {
    mockRequireAdmin.mockResolvedValue({
      response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it("returns 403 without contacting either provider for a signed-in non-admin", async () => {
    mockRequireAdmin.mockResolvedValue({
      response: NextResponse.json(
        { error: "Not authorized." },
        { status: 403 }
      ),
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it("rejects a cross-site administrator request without contacting either provider", async () => {
    mockRequireAdmin.mockResolvedValue({
      session: { uid: "admin", email: "admin@example.com" },
    });

    const response = await POST(
      request({
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      })
    );

    expect(response.status).toBe(403);
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it("rejects a request with no same-origin provenance", async () => {
    mockRequireAdmin.mockResolvedValue({
      session: { uid: "admin", email: "admin@example.com" },
    });

    const response = await POST(
      new Request("https://chessmasti.com/api/health/llm", { method: "POST" })
    );

    expect(response.status).toBe(403);
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it("probes both providers for an administrator and returns sanitized results", async () => {
    mockRequireAdmin.mockResolvedValue({
      session: { uid: "admin", email: "admin@example.com" },
    });
    mockCallLLM.mockImplementation(async ({ forceProvider }) => {
      if (forceProvider === "openai") {
        throw new Error("sensitive upstream OpenAI response");
      }
      return { content: "pong" };
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockCallLLM).toHaveBeenCalledTimes(2);
    expect(mockCallLLM).toHaveBeenCalledWith(
      expect.objectContaining({ forceProvider: "anthropic", maxTokens: 5 })
    );
    expect(mockCallLLM).toHaveBeenCalledWith(
      expect.objectContaining({ forceProvider: "openai", maxTokens: 5 })
    );
    expect(body).toEqual({
      ok: true,
      providers: { anthropic: { ok: true }, openai: { ok: false } },
    });
    expect(JSON.stringify(body)).not.toContain("sensitive upstream");
  });
});
