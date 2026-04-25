import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AuthError,
  __resetAuthCacheForTests,
  verifyFirebaseToken,
} from "../verifyFirebaseToken";

// P0-1 regression: server-side token verification rejects malformed inputs
// without ever loading firebase-admin. The valid-token path is exercised in
// requireAuth.test.ts via a mocked admin, since a real token would require
// live Firebase creds.

describe("verifyFirebaseToken — header parsing", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    __resetAuthCacheForTests();
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rejects a missing Authorization header with code missing_token", async () => {
    await expect(verifyFirebaseToken(null)).rejects.toMatchObject({
      name: "AuthError",
      code: "missing_token",
    });
  });

  it("rejects a header that is not 'Bearer <token>' with code missing_token", async () => {
    await expect(verifyFirebaseToken("Basic abc123")).rejects.toMatchObject({
      name: "AuthError",
      code: "missing_token",
    });
  });

  it("falls through to misconfigured when creds are absent and token shape is valid", async () => {
    await expect(
      verifyFirebaseToken("Bearer some.well-formed.token")
    ).rejects.toMatchObject({
      name: "AuthError",
      code: "misconfigured",
    });
  });

  it("AuthError preserves the code field for caller branching", () => {
    const e = new AuthError("invalid_token", "bad sig");
    expect(e.code).toBe("invalid_token");
    expect(e.message).toBe("bad sig");
    expect(e.name).toBe("AuthError");
  });
});
