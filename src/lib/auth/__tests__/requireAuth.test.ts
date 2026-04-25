import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireAuth } from "../requireAuth";
import { __resetAuthCacheForTests } from "../verifyFirebaseToken";

// P0-1 regression: AUTH_ENFORCED flag gates the whole module. Default off
// keeps behavior identical to today (this is what makes the merge a non-event).
// Default on requires a valid Bearer token; misconfigured creds produce 503,
// not silent allow.

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers,
  });
}

describe("requireAuth — feature flag", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    __resetAuthCacheForTests();
    delete process.env.AUTH_ENFORCED;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("flag off (default): passes through with user=null — matches today's behavior", async () => {
    const result = await requireAuth(makeRequest());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user).toBeNull();
  });

  it("flag off: even bogus headers pass through", async () => {
    const result = await requireAuth(
      makeRequest({ Authorization: "garbage value" })
    );
    expect(result.ok).toBe(true);
  });

  it("flag on + missing Authorization header → 401", async () => {
    process.env.AUTH_ENFORCED = "true";
    const result = await requireAuth(makeRequest());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("flag on + non-Bearer header → 401", async () => {
    process.env.AUTH_ENFORCED = "true";
    const result = await requireAuth(
      makeRequest({ Authorization: "Basic abc123" })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("flag on + creds absent + valid header shape → 503 (catches misconfigured deploys)", async () => {
    process.env.AUTH_ENFORCED = "true";
    // Silence the loud diagnostic that this case intentionally emits.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await requireAuth(
      makeRequest({ Authorization: "Bearer some.token" })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });
});
