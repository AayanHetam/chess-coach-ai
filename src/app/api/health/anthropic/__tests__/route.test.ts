import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireAdmin, mockCallLLM } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockCallLLM: vi.fn(),
}));

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/llmProvider", () => ({ callLLM: mockCallLLM }));

import { GET } from "../route";

describe("GET /api/health/anthropic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without contacting Anthropic for an anonymous visitor", async () => {
    mockRequireAdmin.mockResolvedValue({
      response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    });

    const response = await GET();

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

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it("returns a sanitized result to an administrator", async () => {
    mockRequireAdmin.mockResolvedValue({
      session: { uid: "admin", email: "admin@example.com" },
    });
    mockCallLLM.mockResolvedValue({ content: "pong" });

    const response = await GET();
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

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({ ok: false, provider: "anthropic" });
    expect(JSON.stringify(body)).not.toContain("secret-key-fragment");
  });
});
