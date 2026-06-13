import { describe, it, expect } from "vitest";
import { hasTrackingConsent } from "../consent";

function req(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/track", { headers });
}

describe("hasTrackingConsent (server)", () => {
  it("true only with cm_consent=accepted", () => {
    expect(hasTrackingConsent(req({ cookie: "cm_consent=accepted" }))).toBe(true);
  });

  it("false when consent is rejected", () => {
    expect(hasTrackingConsent(req({ cookie: "cm_consent=rejected" }))).toBe(false);
  });

  it("false with no consent cookie (pre-consent is conservative)", () => {
    expect(hasTrackingConsent(req({ cookie: "cm_session=jwt" }))).toBe(false);
    expect(hasTrackingConsent(req({}))).toBe(false);
  });

  it("GPC opt-out wins even when consent cookie says accepted", () => {
    expect(
      hasTrackingConsent(req({ cookie: "cm_consent=accepted", "sec-gpc": "1" })),
    ).toBe(false);
  });

  it("finds the cookie among others", () => {
    expect(
      hasTrackingConsent(req({ cookie: "cm_anon=anon_1; cm_consent=accepted; x=y" })),
    ).toBe(true);
  });
});
