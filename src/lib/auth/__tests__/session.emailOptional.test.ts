import { describe, it, expect, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { createSessionToken, verifySessionToken } from "../session";

/**
 * A session must survive an account with no email.
 *
 * `verifySessionToken` used to reject any token whose payload had no string
 * `email`. Since signup stopped requiring one, that check would have signed
 * out every handle-only account at the door — and the symptom (silent redirect
 * to sign-in, immediately, forever) looks exactly like a broken SESSION_SECRET,
 * so it would have been debugged in the wrong place.
 */

beforeAll(() => {
  process.env.SESSION_SECRET = "x".repeat(48);
});

describe("verifySessionToken", () => {
  it("round-trips a session that has no email", async () => {
    const token = await createSessionToken({ uid: "u1" });
    const session = await verifySessionToken(token);
    expect(session?.uid).toBe("u1");
    expect(session?.email).toBeUndefined();
  });

  it("still round-trips one that has an email", async () => {
    const token = await createSessionToken({ uid: "u1", email: "a@b.com" });
    expect((await verifySessionToken(token))?.email).toBe("a@b.com");
  });

  it("still rejects a token with no uid — that IS the identity", async () => {
    const token = await createSessionToken({
      email: "a@b.com",
    } as unknown as { uid: string });
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("still rejects a token signed with a DIFFERENT secret", async () => {
    // Guards the loosened email check against having weakened verification
    // itself. Forged with jose directly rather than by swapping the env var,
    // because the module caches its key — the env-swap version of this test
    // passed while proving nothing.
    const forged = await new SignJWT({ uid: "attacker" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("90d")
      .sign(new TextEncoder().encode("z".repeat(48)));
    expect(await verifySessionToken(forged)).toBeNull();
  });

  it("rejects an unsigned token", async () => {
    expect(await verifySessionToken("not.a.jwt")).toBeNull();
  });

  it("drops a non-string email rather than trusting it", async () => {
    const token = await createSessionToken({
      uid: "u1",
      email: 42 as unknown as string,
    });
    const session = await verifySessionToken(token);
    expect(session?.uid).toBe("u1");
    expect(session?.email).toBeUndefined();
  });
});
