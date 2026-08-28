import { describe, it, expect, vi, afterEach } from "vitest";
import {
  hasTrackingConsent,
  setClientConsent,
  CONSENT_CHANGED_EVENT,
} from "../consent";

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

describe("setClientConsent (client)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("announces the change so consent-gated analytics can react in-session", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal("window", { dispatchEvent });

    setClientConsent("accepted");

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock.calls[0][0] as Event;
    expect(event.type).toBe(CONSENT_CHANGED_EVENT);
  });

  it("still writes the cookie when window is absent", () => {
    const doc = { cookie: "" };
    vi.stubGlobal("document", doc);

    setClientConsent("rejected");

    expect(doc.cookie).toContain("cm_consent=rejected");
  });
});
