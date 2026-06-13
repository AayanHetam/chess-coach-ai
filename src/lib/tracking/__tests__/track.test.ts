import { describe, it, expect, vi, beforeEach } from "vitest";

// Control the kill switch per test.
vi.mock("@/env", () => ({ getTrackingEnv: vi.fn() }));
// Stand in for the Supabase client so no network/db is touched.
vi.mock("../supabase", () => ({ getTrackingSupabase: vi.fn() }));

import { getTrackingEnv } from "@/env";
import { getTrackingSupabase } from "../supabase";
import { trackEvent, hashIp, currentAppVersion } from "../track";

const mockEnv = vi.mocked(getTrackingEnv);
const mockGetClient = vi.mocked(getTrackingSupabase);

/** Build a fake Supabase client whose insert resolves to the given result. */
function fakeClient(insertResult: { error: { message: string } | null }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as never, from, insert };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.mockReturnValue({ enabled: true } as never);
});

describe("hashIp", () => {
  it("is deterministic for the same ip+salt", () => {
    expect(hashIp("1.2.3.4", "pepper")).toBe(hashIp("1.2.3.4", "pepper"));
  });

  it("changes when the salt changes (salt actually mixes in)", () => {
    expect(hashIp("1.2.3.4", "pepperA")).not.toBe(hashIp("1.2.3.4", "pepperB"));
  });

  it("changes when the ip changes", () => {
    expect(hashIp("1.2.3.4", "pepper")).not.toBe(hashIp("5.6.7.8", "pepper"));
  });

  it("returns null when ip or salt is missing (never a weak unsalted hash)", () => {
    expect(hashIp(null, "pepper")).toBeNull();
    expect(hashIp("1.2.3.4", null)).toBeNull();
    expect(hashIp(undefined, undefined)).toBeNull();
    expect(hashIp("", "pepper")).toBeNull();
  });

  it("does not contain the raw ip", () => {
    const h = hashIp("1.2.3.4", "pepper");
    expect(h).not.toContain("1.2.3.4");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("trackEvent: kill switch", () => {
  it("no-ops (no client call) when TRACKING_ENABLED is off", async () => {
    mockEnv.mockReturnValue({ enabled: false } as never);
    await trackEvent({ eventName: "page.view" });
    expect(mockGetClient).not.toHaveBeenCalled();
  });
});

describe("trackEvent: write path", () => {
  it("inserts into the events table with mapped + defaulted fields", async () => {
    const fk = fakeClient({ error: null });
    mockGetClient.mockResolvedValue(fk.client);

    await trackEvent({
      eventName: "puzzle.attempt",
      uid: "u1",
      anonId: "anon_x",
      props: { puzzleId: "p1" },
    });

    expect(fk.from).toHaveBeenCalledWith("events");
    const row = fk.insert.mock.calls[0][0];
    expect(row).toMatchObject({
      event_name: "puzzle.attempt",
      uid: "u1",
      anon_id: "anon_x",
      props: { puzzleId: "p1" },
      // Defaults applied for omitted fields:
      is_intern: false,
      session_id: null,
      surface: null,
    });
  });
});

describe("trackEvent: never breaks a request", () => {
  it("swallows an insert error (does not throw)", async () => {
    const fk = fakeClient({ error: { message: "boom" } });
    mockGetClient.mockResolvedValue(fk.client);
    await expect(trackEvent({ eventName: "x" })).resolves.toBeUndefined();
  });

  it("swallows a thrown client error (does not reject)", async () => {
    mockGetClient.mockRejectedValue(new Error("supabase down"));
    await expect(trackEvent({ eventName: "x" })).resolves.toBeUndefined();
  });
});

describe("currentAppVersion", () => {
  it("returns null when VERCEL_GIT_COMMIT_SHA is unset", () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    expect(currentAppVersion()).toBeNull();
    vi.unstubAllEnvs();
  });

  it("returns the sha when set", () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc123");
    expect(currentAppVersion()).toBe("abc123");
    vi.unstubAllEnvs();
  });
});
