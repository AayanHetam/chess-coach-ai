import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  parseBoolEnv,
  getTrackingEnv,
  assertTrackingSecrets,
  __resetTrackingEnvCacheForTests,
} from "../env";

// ─────────────────────────────────────────────────────────────────────
// parseBoolEnv — pure function
// ─────────────────────────────────────────────────────────────────────

describe("parseBoolEnv: truthy values", () => {
  it.each(["true", "1", "yes", "TRUE", "Yes", "  true  "])(
    "'%s' → true",
    (raw) => {
      expect(parseBoolEnv(raw)).toBe(true);
    },
  );

  it("tolerates the trailing-\\n Vercel appends to multi-line saves", () => {
    // This exact shape bit the Mastermind validators flag in prod.
    expect(parseBoolEnv("true\n")).toBe(true);
  });
});

describe("parseBoolEnv: falsy values", () => {
  it.each(["false", "0", "no", "off", "garbage", "truefoo", "2", ""])(
    "'%s' → false",
    (raw) => {
      expect(parseBoolEnv(raw)).toBe(false);
    },
  );

  it("undefined → false", () => {
    expect(parseBoolEnv(undefined)).toBe(false);
  });

  it("whitespace-only → false", () => {
    expect(parseBoolEnv("   ")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// getTrackingEnv — enabled flag memoization + secret reads
// ─────────────────────────────────────────────────────────────────────

describe("getTrackingEnv: enabled flag", () => {
  beforeEach(() => {
    __resetTrackingEnvCacheForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetTrackingEnvCacheForTests();
  });

  it("unset → enabled false (safe default)", () => {
    vi.stubEnv("TRACKING_ENABLED", "");
    expect(getTrackingEnv().enabled).toBe(false);
  });

  it("'true' → enabled true", () => {
    vi.stubEnv("TRACKING_ENABLED", "true");
    expect(getTrackingEnv().enabled).toBe(true);
  });

  it("'true\\n' → enabled true (trailing-newline tolerance)", () => {
    vi.stubEnv("TRACKING_ENABLED", "true\n");
    expect(getTrackingEnv().enabled).toBe(true);
  });

  it("garbage → enabled false", () => {
    vi.stubEnv("TRACKING_ENABLED", "maybe");
    expect(getTrackingEnv().enabled).toBe(false);
  });

  it("memoizes: flipping env mid-process does not change the cached flag", () => {
    vi.stubEnv("TRACKING_ENABLED", "true");
    expect(getTrackingEnv().enabled).toBe(true);
    vi.stubEnv("TRACKING_ENABLED", "false");
    expect(getTrackingEnv().enabled).toBe(true);
  });

  it("reset seam re-reads env on next call", () => {
    vi.stubEnv("TRACKING_ENABLED", "true");
    expect(getTrackingEnv().enabled).toBe(true);
    vi.stubEnv("TRACKING_ENABLED", "false");
    __resetTrackingEnvCacheForTests();
    expect(getTrackingEnv().enabled).toBe(false);
  });
});

describe("getTrackingEnv: supabase + salt reads", () => {
  beforeEach(() => {
    __resetTrackingEnvCacheForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetTrackingEnvCacheForTests();
  });

  it("reads the SEPARATE tracking Supabase vars (not the CMIP ones)", () => {
    vi.stubEnv("TRACKING_SUPABASE_URL", "https://track.supabase.co");
    vi.stubEnv("TRACKING_SUPABASE_SERVICE_ROLE_KEY", "sb_secret_track");
    vi.stubEnv("TRACKING_IP_SALT", "pepper");
    const env = getTrackingEnv();
    expect(env.supabase.url).toBe("https://track.supabase.co");
    expect(env.supabase.serviceRoleKey).toBe("sb_secret_track");
    expect(env.ipSalt).toBe("pepper");
  });
});

// ─────────────────────────────────────────────────────────────────────
// assertTrackingSecrets
// ─────────────────────────────────────────────────────────────────────

describe("assertTrackingSecrets", () => {
  beforeEach(() => {
    __resetTrackingEnvCacheForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetTrackingEnvCacheForTests();
  });

  it("throws listing both vars when neither is set", () => {
    vi.stubEnv("TRACKING_SUPABASE_URL", "");
    vi.stubEnv("TRACKING_SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => assertTrackingSecrets()).toThrow(/TRACKING_SUPABASE_URL/);
    expect(() => assertTrackingSecrets()).toThrow(
      /TRACKING_SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it("throws naming only the missing var", () => {
    vi.stubEnv("TRACKING_SUPABASE_URL", "https://track.supabase.co");
    vi.stubEnv("TRACKING_SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => assertTrackingSecrets()).toThrow(
      /TRACKING_SUPABASE_SERVICE_ROLE_KEY/,
    );
    expect(() => assertTrackingSecrets()).not.toThrow(/TRACKING_SUPABASE_URL/);
  });

  it("passes when both are set", () => {
    vi.stubEnv("TRACKING_SUPABASE_URL", "https://track.supabase.co");
    vi.stubEnv("TRACKING_SUPABASE_SERVICE_ROLE_KEY", "sb_secret_track");
    expect(() => assertTrackingSecrets()).not.toThrow();
  });
});
