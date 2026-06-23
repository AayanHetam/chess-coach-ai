import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Firestore-backed deps so the gate logic is tested in isolation.
vi.mock("@/lib/server/users", () => ({ getUserById: vi.fn() }));
vi.mock("../quota", () => ({ checkAndConsumeQuota: vi.fn() }));

import { gateFeature } from "../gate";
import { getUserById } from "@/lib/server/users";
import { checkAndConsumeQuota } from "../quota";

const mockedGetUser = vi.mocked(getUserById);
const mockedQuota = vi.mocked(checkAndConsumeQuota);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const user = (over: Record<string, unknown> = {}): any => ({
  uid: "u1",
  email: "a@b.c",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("gateFeature", () => {
  it("flag OFF → allows without touching the DB", async () => {
    vi.stubEnv("FREEMIUM_ENABLED", "false");
    const r = await gateFeature("u1", "analysis");
    expect(r.ok).toBe(true);
    expect(mockedGetUser).not.toHaveBeenCalled();
    expect(mockedQuota).not.toHaveBeenCalled();
  });

  it("premium (comped) user → allows, never consumes quota", async () => {
    vi.stubEnv("FREEMIUM_ENABLED", "true");
    mockedGetUser.mockResolvedValue(user({ compedReason: "promo:AKANKSHA2026" }));
    const r = await gateFeature("u1", "analysis");
    expect(r.ok).toBe(true);
    expect(mockedQuota).not.toHaveBeenCalled();
  });

  it("free user under quota → allows + consumed", async () => {
    vi.stubEnv("FREEMIUM_ENABLED", "true");
    mockedGetUser.mockResolvedValue(user());
    mockedQuota.mockResolvedValue({ allowed: true, remaining: 2, limit: 3, used: 1 });
    const r = await gateFeature("u1", "analysis");
    expect(r).toMatchObject({ ok: true, consumed: true });
  });

  it("free user exhausted → 402 with quota_exhausted body", async () => {
    vi.stubEnv("FREEMIUM_ENABLED", "true");
    mockedGetUser.mockResolvedValue(user());
    mockedQuota.mockResolvedValue({ allowed: false, remaining: 0, limit: 3, used: 3 });
    const r = await gateFeature("u1", "analysis", { surface: "analysis" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(402);
      const body = await r.response.json();
      expect(body).toMatchObject({
        code: "quota_exhausted",
        feature: "analysis",
        limit: 3,
        upgrade: true,
      });
    }
  });

  it("free user whose record vanished → 401", async () => {
    vi.stubEnv("FREEMIUM_ENABLED", "true");
    mockedGetUser.mockResolvedValue(null);
    const r = await gateFeature("u1", "analysis");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });
});
