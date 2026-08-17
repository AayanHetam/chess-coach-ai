import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";

/**
 * Sign-in resolution: a handle must work exactly as an email does, and a
 * miss must not be distinguishable from a wrong password.
 *
 * This exists because mutating `getUidByHandle` away killed nothing — the
 * handle-store tests cover claiming, and nothing covered the credential path
 * that consumes it. That is the one place where a silent regression logs
 * people out of their own accounts.
 */

const users = new Map<string, Record<string, unknown>>();
const handleToUid = new Map<string, string>();

const fakeDb = {
  collection: () => ({
    doc: (id: string) => ({
      get: async () => ({
        exists: users.has(id),
        id,
        data: () => users.get(id),
      }),
    }),
    where: (_f: string, _op: string, value: string) => ({
      limit: () => ({
        get: async () => {
          const hit = Array.from(users.entries()).find(
            ([, u]) => u.email === value
          );
          return {
            empty: !hit,
            docs: hit ? [{ id: hit[0], data: () => hit[1] }] : [],
          };
        },
      }),
    }),
  }),
};

vi.mock("../firebaseAdmin", () => ({
  getAdminFirestore: async () => fakeDb,
  AdminConfigError: class extends Error {},
}));
vi.mock("../withFirestoreTimeout", () => ({
  withFirestoreTimeout: <T>(p: Promise<T>) => p,
}));
vi.mock("../handles", () => ({
  getUidByHandle: async (h: string) =>
    handleToUid.get(h.trim().toLowerCase().replace(/[_-]/g, "")) ?? null,
}));

const { verifyPasswordByIdentifier } = await import("../users");

const PASSWORD = "correct-horse-1!";
let hash: string;

beforeEach(async () => {
  hash ||= await bcrypt.hash(PASSWORD, 4); // low cost: this is a test
  users.clear();
  handleToUid.clear();
  users.set("u1", {
    email: "player@example.com",
    passwordHash: hash,
  });
  handleToUid.set("lazerwizard", "u1");
});

describe("verifyPasswordByIdentifier", () => {
  it("signs in with an email", async () => {
    const u = await verifyPasswordByIdentifier("player@example.com", PASSWORD);
    expect(u?.uid).toBe("u1");
  });

  it("signs in with a handle", async () => {
    const u = await verifyPasswordByIdentifier("lazerwizard", PASSWORD);
    expect(u?.uid).toBe("u1");
  });

  it("accepts the handle in any case or separator form", async () => {
    expect(
      (await verifyPasswordByIdentifier("LazerWizard", PASSWORD))?.uid
    ).toBe("u1");
    expect(
      (await verifyPasswordByIdentifier("lazer_wizard", PASSWORD))?.uid
    ).toBe("u1");
    expect(
      (await verifyPasswordByIdentifier("  lazerwizard  ", PASSWORD))?.uid
    ).toBe("u1");
  });

  it("rejects the right handle with the wrong password", async () => {
    expect(await verifyPasswordByIdentifier("lazerwizard", "wrong")).toBeNull();
  });

  it("rejects an unknown handle", async () => {
    expect(await verifyPasswordByIdentifier("nobody", PASSWORD)).toBeNull();
  });

  it("rejects a handle whose account has no password (Google-only)", async () => {
    // Google accounts have no passwordHash. Signing in by handle must not
    // become a way around OAuth.
    users.set("u2", { email: "g@example.com", googleId: "g-1" });
    handleToUid.set("googler", "u2");
    expect(await verifyPasswordByIdentifier("googler", PASSWORD)).toBeNull();
  });

  it("still hashes on a miss, so timing does not reveal which handles exist", async () => {
    // Handles are public and short, so an early return here would turn the
    // sign-in form into a cheap oracle for enumerating accounts.
    const spy = vi.spyOn(bcrypt, "compare");
    spy.mockClear();
    await verifyPasswordByIdentifier("definitely-not-real", PASSWORD);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
