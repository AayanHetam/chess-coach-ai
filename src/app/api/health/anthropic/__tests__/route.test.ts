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
  return new Request("https://chessmasti.com/api/health/anthropic", {
    method: "POST",
    headers: {
      origin: "https://chessmasti.com",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
  });
}

describe("/api/health/anthropic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 405 for GET without contacting Anthropic", () => {
    const response = GET();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(mockRequireAdmin).not.toHaveBeenCalled();
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it("returns 401 without contacting Anthropic for an anonymous visitor", async () => {
    mockRequireAdmin.mockResolvedValue({
      response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it("returns 403 without contacting Anthropic for a signed-in non-admin", async () => {
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

  it("rejects a cross-site administrator request without contacting Anthropic", async () => {
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
      new Request("https://chessmasti.com/api/health/anthropic", {
        method: "POST",
      })
    );

    expect(response.status).toBe(403);
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it("returns a sanitized result to an administrator", async () => {
    mockRequireAdmin.mockResolvedValue({
      session: { uid: "admin", email: "admin@example.com" },
    });
    mockCallLLM.mockResolvedValue({ content: "pong" });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockCallLLM).toHaveBeenCalledWith(
      expect.objectContaining({ forceProvider: "anthropic", maxTokens: 5 })
    );
    expect(body).toEqual({ ok: true, provider: "anthropic" });
  });

  it("does not expose provider errors", async () => {
    mockRequireAdmin.mockResolvedValue({
      session: { uid: "admin", email: "admin@example.com" },
    });
    mockCallLLM.mockRejectedValue(
      new Error("secret-key-fragment: upstream account has no credit")
    );

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({ ok: false, provider: "anthropic" });
    expect(JSON.stringify(body)).not.toContain("secret-key-fragment");
  });
});
