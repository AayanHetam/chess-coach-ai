import { beforeEach, describe, expect, it, vi } from "vitest";

const set = vi.fn();
const captured = new Map<string, Record<string, unknown>>();

vi.mock("../firebaseAdmin", () => ({
  getAdminFirestore: vi.fn(async () => ({
    collection: () => ({
      where: () => ({
        limit: () => ({ get: async () => ({ empty: true, docs: [] }) }),
      }),
      doc: (uid: string) => ({
        set: async (data: Record<string, unknown>) => {
          await set(data);
          captured.set(uid, data);
        },
        get: async () => ({
          exists: captured.has(uid),
          id: uid,
          data: () => captured.get(uid),
        }),
      }),
    }),
  })),
}));

import { createUser } from "../users";

describe("signup acceptance storage", () => {
  beforeEach(() => {
    set.mockReset().mockResolvedValue(undefined);
    captured.clear();
  });

  it("stores explicit versions, server timestamp sentinels, and method", async () => {
    const user = await createUser({
      email: "new@example.com",
      password: "longenough1!",
      ageAffirmed: true,
      termsAccepted: true,
    });

    const doc = captured.get(user.uid)!;
    expect(doc.termsVersion).toBe("2026-08-17");
    expect(doc.privacyVersion).toBe("2026-08-17");
    expect(doc.acceptanceMethod).toBe("signup-checkbox");
    expect(doc.termsAcceptedAt).toBeTruthy();
    expect(doc.age13ConfirmedAt).toBeTruthy();
    expect(doc.termsAcceptedAt).not.toBe(new Date().toISOString());
  });

  it("does not complete creation when acceptance storage fails", async () => {
    set.mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(
      createUser({
        email: "failed@example.com",
        password: "longenough1!",
        ageAffirmed: true,
        termsAccepted: true,
      })
    ).rejects.toThrow("storage unavailable");
    expect(captured.size).toBe(0);
  });
});
