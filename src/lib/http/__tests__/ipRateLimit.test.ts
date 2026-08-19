import { describe, it, expect } from "vitest";
import { clientIp, rateLimited } from "@/lib/http/ipRateLimit";

describe("rateLimited", () => {
  const cfg = { windowMs: 1000, max: 3 };

  it("allows up to max within the window, then blocks", () => {
    const bucket = "test-a";
    const ip = "1.1.1.1";
    expect(rateLimited(bucket, ip, cfg, 0)).toBe(false);
    expect(rateLimited(bucket, ip, cfg, 10)).toBe(false);
    expect(rateLimited(bucket, ip, cfg, 20)).toBe(false);
    // 4th hit inside the window is over the limit
    expect(rateLimited(bucket, ip, cfg, 30)).toBe(true);
  });

  it("frees the budget once the window slides past old hits", () => {
    const bucket = "test-b";
    const ip = "2.2.2.2";
    expect(rateLimited(bucket, ip, cfg, 0)).toBe(false);
    expect(rateLimited(bucket, ip, cfg, 0)).toBe(false);
    expect(rateLimited(bucket, ip, cfg, 0)).toBe(false);
    expect(rateLimited(bucket, ip, cfg, 0)).toBe(true);
    // well past windowMs, prior hits have expired
    expect(rateLimited(bucket, ip, cfg, 2000)).toBe(false);
  });

  it("isolates counts per IP and per bucket", () => {
    expect(rateLimited("bucket-x", "9.9.9.9", cfg, 0)).toBe(false);
    // different IP, same bucket — independent budget
    expect(rateLimited("bucket-x", "8.8.8.8", cfg, 0)).toBe(false);
    // same IP, different bucket — independent budget
    expect(rateLimited("bucket-y", "9.9.9.9", cfg, 0)).toBe(false);
  });
});

describe("clientIp", () => {
  it("takes the first x-forwarded-for entry", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "3.3.3.3, 4.4.4.4" },
    });
    expect(clientIp(req)).toBe("3.3.3.3");
  });

  it("falls back to x-real-ip, then 'unknown'", () => {
    const withReal = new Request("https://example.com", {
      headers: { "x-real-ip": "5.5.5.5" },
    });
    expect(clientIp(withReal)).toBe("5.5.5.5");
    expect(clientIp(new Request("https://example.com"))).toBe("unknown");
  });
});
