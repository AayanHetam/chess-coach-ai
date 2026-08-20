import { beforeAll, describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import {
  setOAuthStateCookie,
  readOAuthStateFromRequest,
} from "../oauthState";

const SECRET = "test-session-secret-0123456789-abcdefghij";

function requestWithCookie(cookie: string): Request {
  return new Request("http://localhost/api/auth/google/callback", {
    headers: { cookie },
  });
}

describe("oauthState ageAffirmed flag (COPPA)", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = SECRET;
  });

  it("round-trips ageAffirmed: true", async () => {
    const response = NextResponse.redirect("http://localhost/");
    await setOAuthStateCookie(response, {
      state: "s1",
      codeVerifier: "v1",
      returnTo: "/",
      ageAffirmed: true,
    });
    const token = response.cookies.get("cm_oauth_state")!.value;
    const parsed = await readOAuthStateFromRequest(
      requestWithCookie(`cm_oauth_state=${token}`)
    );
    expect(parsed?.ageAffirmed).toBe(true);
  });

  it("defaults ageAffirmed to false when absent (legacy cookies)", async () => {
    const response = NextResponse.redirect("http://localhost/");
    await setOAuthStateCookie(response, {
      state: "s2",
      codeVerifier: "v2",
    });
    const token = response.cookies.get("cm_oauth_state")!.value;
    const parsed = await readOAuthStateFromRequest(
      requestWithCookie(`cm_oauth_state=${token}`)
    );
    expect(parsed?.ageAffirmed).toBe(false);
  });

  it("round-trips emailOptIn: true and defaults it to false when absent", async () => {
    const withOptIn = NextResponse.redirect("http://localhost/");
    await setOAuthStateCookie(withOptIn, {
      state: "s3",
      codeVerifier: "v3",
      ageAffirmed: true,
      termsAccepted: true,
      emailOptIn: true,
    });
    const optInToken = withOptIn.cookies.get("cm_oauth_state")!.value;
    const parsedOptIn = await readOAuthStateFromRequest(
      requestWithCookie(`cm_oauth_state=${optInToken}`)
    );
    expect(parsedOptIn?.emailOptIn).toBe(true);

    const without = NextResponse.redirect("http://localhost/");
    await setOAuthStateCookie(without, { state: "s4", codeVerifier: "v4" });
    const legacyToken = without.cookies.get("cm_oauth_state")!.value;
    const parsedLegacy = await readOAuthStateFromRequest(
      requestWithCookie(`cm_oauth_state=${legacyToken}`)
    );
    expect(parsedLegacy?.emailOptIn).toBe(false);
  });
});
