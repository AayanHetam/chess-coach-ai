import { describe, expect, it, beforeEach, vi } from "vitest";

/**
 * The suppression list, and the one behaviour that makes it worth having:
 * an opt-out is about an ADDRESS, not about an account.
 *
 * Before this existed, unsubscribing flipped a boolean on one user document.
 * A second account on the same address — or the same person signing up again
 * after deleting — started opted-in and got mailed by somebody they had
 * already told to stop.
 */

const store = new Map<string, unknown>();

const { mockGetDb } = vi.hoisted(() => ({ mockGetDb: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ getAdminFirestore: mockGetDb }));

function makeDb() {
  return {
    collection: (coll: string) => ({
      doc: (id: string) => {
        const key = `${coll}/${id}`;
        return {
          get: async () => ({
            exists: store.has(key),
            data: () => store.get(key),
          }),
          set: async (v: unknown) => void store.set(key, v),
          delete: async () => void store.delete(key),
        };
      },
    }),
  };
}

import {
  suppressEmail,
  isEmailSuppressed,
  unsuppressEmail,
  suppressionKey,
  normalizeEmail,
} from "../emailSuppression";

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  mockGetDb.mockResolvedValue(makeDb());
});

describe("suppression is keyed by address, not by account", () => {
  it("suppresses the address so a DIFFERENT account on it is also covered", async () => {
    // The whole point. uid never enters the picture.
    await suppressEmail("Player@Example.com");
    expect(await isEmailSuppressed("player@example.com")).toBe(true);
  });

  it("normalises case and surrounding whitespace", async () => {
    await suppressEmail("  PLAYER@example.COM  ");
    expect(await isEmailSuppressed("player@example.com")).toBe(true);
    expect(normalizeEmail(" A@B.com ")).toBe("a@b.com");
  });

  it("does not put the raw address in the document path", () => {
    const key = suppressionKey("player@example.com");
    expect(key).not.toContain("player");
    expect(key).not.toContain("@");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stores only the domain, never the local part", async () => {
    await suppressEmail("someone.private@example.com");
    const record = Array.from(store.values())[0] as { domain: string };
    expect(record.domain).toBe("example.com");
    expect(JSON.stringify(record)).not.toContain("someone.private");
  });

  it("keeps the ORIGINAL opt-out date when the link is clicked twice", async () => {
    await suppressEmail("player@example.com");
    const first = (
      Array.from(store.values())[0] as { suppressedAt: number }
    ).suppressedAt;
    await new Promise((r) => setTimeout(r, 5));
    await suppressEmail("player@example.com");
    expect(
      (Array.from(store.values())[0] as { suppressedAt: number }).suppressedAt
    ).toBe(first);
    expect(store.size).toBe(1);
  });

  it("lifts on re-subscribe, so the dashboard toggle is not lying", async () => {
    await suppressEmail("player@example.com");
    await unsuppressEmail("player@example.com");
    expect(await isEmailSuppressed("player@example.com")).toBe(false);
  });
});

describe("failure behaviour", () => {
  it("FAILS CLOSED when the lookup throws", async () => {
    // A skipped reminder is a missed nudge. A wrongly-sent one is mail to
    // somebody who told us to stop. The two costs are not symmetric.
    mockGetDb.mockRejectedValue(new Error("firestore down"));
    expect(await isEmailSuppressed("player@example.com")).toBe(true);
  });

  it("treats an empty address as suppressed rather than mailing it", async () => {
    expect(await isEmailSuppressed("")).toBe(true);
  });

  it("ignores a write for something that is not an address", async () => {
    await suppressEmail("not-an-email");
    expect(store.size).toBe(0);
  });
});
