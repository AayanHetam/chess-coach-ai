import { describe, expect, it, beforeEach, vi } from "vitest";

/**
 * Account deletion (privacy §8.3).
 *
 * The risk here was never refusing to delete — it was deleting INCOMPLETELY
 * and believing the job was done. So the assertions that matter are:
 *   - the dry run destroys nothing
 *   - EVERY known surface is visited, including nested subcollections
 *   - the account doc goes LAST, so an interrupted run leaves a resolvable
 *     account rather than orphaned data pointing at a uid that no longer exists
 *   - errors are reported rather than swallowed into a success
 */

const { mockPurge } = vi.hoisted(() => ({ mockPurge: vi.fn() }));
vi.mock("@/lib/tracking/purge", () => ({ purgeUserData: mockPurge }));

const deletedOrder: string[] = [];

/** Minimal Firestore Admin double: enough shape for the traversal under test. */
function makeDb(fixture: Record<string, string[]>) {
  const makeDoc = (path: string): Record<string, unknown> => ({
    id: path.split("/").pop(),
    ref: {
      delete: vi.fn(async () => {
        deletedOrder.push(path);
      }),
      collection: (name: string) => makeCollection(`${path}/${name}`),
    },
    exists: true,
    data: () => ({ email: "someone@example.com" }),
    get: vi.fn(),
  });

  const makeCollection = (path: string): Record<string, unknown> => {
    const ids = fixture[path] ?? [];
    const docs = ids.map((id) => makeDoc(`${path}/${id}`));
    const snap = { size: docs.length, empty: docs.length === 0, docs };
    const coll: Record<string, unknown> = {
      get: async () => snap,
      where: () => coll,
      limit: () => coll,
      doc: (id?: string) => {
        const d = makeDoc(`${path}/${id ?? "auto"}`);
        return {
          ...(d.ref as Record<string, unknown>),
          get: async () => ({
            exists: (fixture[path] ?? []).includes(id ?? ""),
            data: () => ({ email: "someone@example.com" }),
            id,
          }),
        };
      },
    };
    return coll;
  };

  return { collection: (name: string) => makeCollection(name) };
}

const FIXTURE = {
  users: ["u1"],
  "users/u1/games": ["g1", "g2", "g3"],
  "users/u1/chats": ["c1", "c2"],
  "users/u1/chats/c1/messages": ["m1", "m2"],
  "users/u1/chats/c2/messages": ["m3"],
  "users/u1/puzzleSessions": ["p1"],
  gameShares: ["s1"],
  scouts: ["sc1"],
  insights: ["i1"],
};

const { mockGetDb } = vi.hoisted(() => ({ mockGetDb: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminFirestore: mockGetDb,
}));

import {
  planUserDeletion,
  executeUserDeletion,
  UNTOUCHED_SURFACES,
} from "../deleteUserData";

beforeEach(() => {
  vi.clearAllMocks();
  deletedOrder.length = 0;
  mockGetDb.mockResolvedValue(makeDb(FIXTURE));
  mockPurge.mockResolvedValue({
    uid: "u1",
    deleted: { events: 4 },
    errors: [],
  });
});

describe("planUserDeletion — read-only survey", () => {
  it("destroys nothing", async () => {
    await planUserDeletion("u1");
    expect(deletedOrder).toEqual([]);
    expect(mockPurge).not.toHaveBeenCalled();
  });

  it("counts every surface, including nested chat messages", async () => {
    const plan = await planUserDeletion("u1");
    const by = Object.fromEntries(
      plan.surfaces.map((s) => [s.surface, s.count])
    );
    expect(by["users/{uid}/games"]).toBe(3);
    expect(by["users/{uid}/chats"]).toBe(2);
    // The one most easily missed by hand: messages live UNDER each chat.
    expect(by["users/{uid}/chats/*/messages"]).toBe(3);
    expect(by["users/{uid}/puzzleSessions"]).toBe(1);
    expect(by["gameShares (sharerUid)"]).toBe(1);
    expect(by["scouts (sharerUid)"]).toBe(1);
    expect(by["insights (sharerUid)"]).toBe(1);
  });

  it("totals what a human would otherwise have to add up", async () => {
    const plan = await planUserDeletion("u1");
    expect(plan.totalDocs).toBe(1 + 3 + 2 + 3 + 1 + 1 + 1 + 1);
  });
});

describe("executeUserDeletion", () => {
  it("deletes the account document LAST", async () => {
    // An interrupted run must leave a resolvable account with some data still
    // attached, never orphaned data pointing at a uid that no longer exists.
    await executeUserDeletion("u1");
    expect(deletedOrder.at(-1)).toBe("users/u1");
  });

  it("deletes nested messages before the chats that own them", async () => {
    await executeUserDeletion("u1");
    const firstChat = deletedOrder.findIndex((p) => /chats\/c\d$/.test(p));
    const lastMessage = deletedOrder
      .map((p) => /messages\//.test(p))
      .lastIndexOf(true);
    expect(lastMessage).toBeLessThan(firstChat);
  });

  it("purges the Supabase tracking tables too", async () => {
    const r = await executeUserDeletion("u1");
    expect(mockPurge).toHaveBeenCalledWith("u1");
    expect(r.supabase?.deleted).toEqual({ events: 4 });
  });

  it("reports an error instead of silently claiming success", async () => {
    mockPurge.mockRejectedValue(new Error("supabase unreachable"));
    const r = await executeUserDeletion("u1");
    expect(r.errors.join(" ")).toContain("supabase unreachable");
    expect(r.supabase).toBeNull();
  });

  it("names what it does NOT delete", async () => {
    // A tool that quietly covers 90% is worse than none: it turns "I should
    // check" into "the script handled it".
    expect(UNTOUCHED_SURFACES.length).toBeGreaterThan(0);
    const all = UNTOUCHED_SURFACES.join(" ");
    expect(all).toMatch(/cmip_applications/);
    expect(all).not.toMatch(/Stripe|billing|promo-code/i);
  });
});
