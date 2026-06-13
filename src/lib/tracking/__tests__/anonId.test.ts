import { describe, it, expect } from "vitest";
import {
  ANON_COOKIE_NAME,
  anonCookieOptions,
  readAnonIdFromRequest,
  generateAnonId,
  readOrCreateAnonId,
} from "../anonId";

function reqWithCookie(cookie?: string): Request {
  return new Request("http://localhost/api/track", {
    headers: cookie ? { cookie } : {},
  });
}

describe("readAnonIdFromRequest", () => {
  it("extracts the anon id when present", () => {
    const r = reqWithCookie(`${ANON_COOKIE_NAME}=anon_123; other=1`);
    expect(readAnonIdFromRequest(r)).toBe("anon_123");
  });

  it("finds it regardless of position in the header", () => {
    const r = reqWithCookie(`cm_session=jwt; ${ANON_COOKIE_NAME}=anon_456`);
    expect(readAnonIdFromRequest(r)).toBe("anon_456");
  });

  it("url-decodes the value", () => {
    const r = reqWithCookie(`${ANON_COOKIE_NAME}=anon_a%2Bb`);
    expect(readAnonIdFromRequest(r)).toBe("anon_a+b");
  });

  it("returns null with no cookie header", () => {
    expect(readAnonIdFromRequest(reqWithCookie())).toBeNull();
  });

  it("returns null when only other cookies are present", () => {
    expect(readAnonIdFromRequest(reqWithCookie("cm_session=jwt"))).toBeNull();
  });
});

describe("generateAnonId", () => {
  it("is prefixed and unique", () => {
    const a = generateAnonId();
    const b = generateAnonId();
    expect(a.startsWith("anon_")).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe("readOrCreateAnonId", () => {
  it("reuses an existing id (isNew false)", () => {
    const r = reqWithCookie(`${ANON_COOKIE_NAME}=anon_existing`);
    expect(readOrCreateAnonId(r)).toEqual({
      anonId: "anon_existing",
      isNew: false,
    });
  });

  it("mints a new id (isNew true) when absent", () => {
    const { anonId, isNew } = readOrCreateAnonId(reqWithCookie());
    expect(isNew).toBe(true);
    expect(anonId.startsWith("anon_")).toBe(true);
  });
});

describe("anonCookieOptions", () => {
  it("is httpOnly, lax, root-scoped, ~1 year", () => {
    const o = anonCookieOptions();
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe("lax");
    expect(o.path).toBe("/");
    expect(o.maxAge).toBe(365 * 24 * 60 * 60);
  });
});
