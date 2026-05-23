import { describe, it, expect, vi, afterEach } from "vitest";
import { vercelBypassHeaders } from "../client";

describe("vercelBypassHeaders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("env var unset → no headers", () => {
    it("returns empty object when VERCEL_AUTOMATION_BYPASS_SECRET is unset", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "");
      expect(vercelBypassHeaders("https://chess-coach-abc123.vercel.app")).toEqual({});
    });
  });

  describe("env var set + base URL is *.vercel.app → headers injected", () => {
    it("returns the protection-bypass header for a typical preview URL", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "test-secret-value-abc123");
      const headers = vercelBypassHeaders("https://chess-coach-abc123.vercel.app");
      expect(headers).toEqual({
        "x-vercel-protection-bypass": "test-secret-value-abc123",
      });
    });

    it("does NOT include x-vercel-set-bypass-cookie (causes infinite redirect loop)", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "secret-xyz");
      const headers = vercelBypassHeaders("https://chess-coach-abc.vercel.app");
      expect(headers["x-vercel-set-bypass-cookie"]).toBeUndefined();
    });

    it("works with subdomain variants (production-like vercel.app subdomains)", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "secret-xyz");
      const headers = vercelBypassHeaders("https://chess-coach-mbeuac5re-aayan-hs-projects.vercel.app");
      expect(headers["x-vercel-protection-bypass"]).toBe("secret-xyz");
    });

    it("preserves trailing path / query without affecting host detection", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "secret-xyz");
      const headers = vercelBypassHeaders("https://preview.vercel.app/api/scout?x=1");
      expect(headers["x-vercel-protection-bypass"]).toBe("secret-xyz");
    });
  });

  describe("env var set + base URL is NOT *.vercel.app → no headers (production-safety invariant)", () => {
    it("does NOT inject for production chessmasti.com", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "secret-xyz");
      expect(vercelBypassHeaders("https://chessmasti.com")).toEqual({});
    });

    it("does NOT inject for localhost", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "secret-xyz");
      expect(vercelBypassHeaders("http://127.0.0.1:3000")).toEqual({});
      expect(vercelBypassHeaders("http://localhost:3000")).toEqual({});
    });

    it("does NOT inject for random non-vercel domains", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "secret-xyz");
      expect(vercelBypassHeaders("https://example.com")).toEqual({});
      expect(vercelBypassHeaders("https://api.chess.com")).toEqual({});
    });

    it("does NOT inject when base URL is malformed (no schema)", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "secret-xyz");
      expect(vercelBypassHeaders("not-a-url")).toEqual({});
    });

    it("does NOT match host substrings — e.g. vercel.app.evil.com is not bypassed", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "secret-xyz");
      expect(vercelBypassHeaders("https://vercel.app.evil.com")).toEqual({});
    });
  });

  describe("secret hygiene", () => {
    it("returns a fresh object each call (no shared mutation across requests)", () => {
      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "secret-xyz");
      const a = vercelBypassHeaders("https://chess.vercel.app");
      const b = vercelBypassHeaders("https://chess.vercel.app");
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });
});
