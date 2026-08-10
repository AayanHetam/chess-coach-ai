import { beforeAll, describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import {
  setPendingSignupCookie,
  readPendingSignupFromRequest,
  clearPendingSignupCookie,
  __resetPendingSignupKeyForTests,
} from "../pendingSignup";

const SECRET = "test-session-secret-0123456789-abcdefghij";

function requestWithCookie(cookie: string | null): Request {
  return new Request("http://localhost/api/auth/google/complete", {
    headers: cookie ? { cookie } : {},
  });
}

describe("pendingSignup cookie", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = SECRET;
    __resetPendingSignupKeyForTests();
  });

  it("round-trips a full payload through the signed cookie", async () => {
    const response = NextResponse.json({});
    await setPendingSignupCookie(response, {
      googleId: "g-123",
      email: "new@user.com",
      displayName: "New User",
      photoURL: "https://lh3.example/pic.jpg",
      returnTo: "/analysis?fen=abc",
    });
    const token = response.cookies.get("cm_pending_google")?.value;
    expect(token).toBeTruthy();

    const parsed = await readPendingSignupFromRequest(
      requestWithCookie(`cm_pending_google=${token}`)
    );
    expect(parsed).toEqual({
      googleId: "g-123",
      email: "new@user.com",
      displayName: "New User",
      photoURL: "https://lh3.example/pic.jpg",
      returnTo: "/analysis?fen=abc",
    });
  });

  it("omits optional fields cleanly", async () => {
    const response = NextResponse.json({});
    await setPendingSignupCookie(response, {
      googleId: "g-456",
      email: "min@user.com",
    });
    const token = response.cookies.get("cm_pending_google")?.value;
    const parsed = await readPendingSignupFromRequest(
      requestWithCookie(`cm_pending_google=${token}`)
    );
    expect(parsed?.googleId).toBe("g-456");
    expect(parsed?.displayName).toBeUndefined();
    expect(parsed?.returnTo).toBeUndefined();
  });

  it("returns null for a missing cookie", async () => {
    await expect(readPendingSignupFromRequest(requestWithCookie(null))).resolves.toBeNull();
  });

  it("returns null for a tampered token", async () => {
    const response = NextResponse.json({});
    await setPendingSignupCookie(response, { googleId: "g", email: "e@x.com" });
    const token = response.cookies.get("cm_pending_google")!.value;
    const tampered = token.slice(0, -4) + "AAAA";
    await expect(
      readPendingSignupFromRequest(requestWithCookie(`cm_pending_google=${tampered}`))
    ).resolves.toBeNull();
  });

  it("clearPendingSignupCookie zeroes the cookie", () => {
    const response = NextResponse.json({});
    clearPendingSignupCookie(response);
    const cookie = response.cookies.get("cm_pending_google");
    expect(cookie?.value).toBe("");
    expect(cookie?.maxAge).toBe(0);
  });
});
