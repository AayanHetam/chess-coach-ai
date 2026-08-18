import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Signup reserves the handle and creates the user in ONE transaction.
 *
 * The fake below enforces the two Firestore rules that make this correct, so a
 * regression fails here rather than in production:
 *   - `create` throws if the document already exists (this is the race guard)
 *   - no read may be issued after the first write in a transaction
 *
 * Both halves must land together. An account created without its handle joins
 * the handle-less cohort this feature exists to stop creating; a reservation
 * without an account points at a user that does not exist.
 */

interface Doc {
  path: string;
  data: Record<string, unknown>;
}

const store = new Map<string, Record<string, unknown>>();
/** Simulate the user document losing its own race, to test the mirror case. */
let failUserCreate = false;

class TxViolation extends Error {}

function makeDb() {
  const ref = (path: string) => ({ path });
  return {
    collection: (col: string) => ({
      doc: (id: string) => ({
        ...ref(`${col}/${id}`),
        get: async () => snapshot(`${col}/${id}`),
        set: async (data: Record<string, unknown>) => {
          store.set(`${col}/${id}`, data);
        },
      }),
      where: () => ({
        limit: () => ({ get: async () => ({ empty: true, docs: [] }) }),
      }),
    }),
    runTransaction: async <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
      const writes: Array<() => void> = [];
      let wrote = false;
      const tx: Tx = {
        get: async (r: Doc | { path: string }) => {
          if (wrote) {
            throw new TxViolation(
              "read after write — Firestore rejects this at runtime"
            );
          }
          return snapshot(r.path);
        },
        create: (r: { path: string }, data: Record<string, unknown>) => {
          wrote = true;
          writes.push(() => {
            if (store.has(r.path)) {
              throw new Error(`ALREADY_EXISTS: ${r.path}`);
            }
            if (failUserCreate && r.path.startsWith("users/")) {
              throw new Error(`ALREADY_EXISTS: ${r.path}`);
            }
            store.set(r.path, data);
          });
        },
        update: (r: { path: string }, data: Record<string, unknown>) => {
          wrote = true;
          writes.push(() => {
            store.set(r.path, { ...(store.get(r.path) ?? {}), ...data });
          });
        },
      };
      const out = await fn(tx);
      // Commit only after the body succeeds, and ATOMICALLY: if any write
      // throws, none of them stick. A real transaction gives us this; the fake
      // has to, or the mirror test below would pass on a half-write.
      const before = new Map(store);
      try {
        for (const w of writes) w();
      } catch (e) {
        store.clear();
        for (const [k, v] of Array.from(before)) store.set(k, v);
        throw e;
      }
      return out;
    },
  };
}

interface Tx {
  get: (r: { path: string }) => Promise<{
    exists: boolean;
    data: () => Record<string, unknown> | undefined;
  }>;
  create: (r: { path: string }, data: Record<string, unknown>) => void;
  update: (r: { path: string }, data: Record<string, unknown>) => void;
}

function snapshot(path: string) {
  return {
    exists: store.has(path),
    id: path.split("/").pop() as string,
    data: () => store.get(path),
  };
}

vi.mock("../firebaseAdmin", () => ({
  getAdminFirestore: async () => makeDb(),
  AdminConfigError: class extends Error {},
}));
vi.mock("../withFirestoreTimeout", () => ({
  withFirestoreTimeout: <T>(p: Promise<T>) => p,
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "SERVER_TS" },
  Timestamp: class {},
}));

import { createUser, UserError } from "../users";

beforeEach(() => {
  store.clear();
  failUserCreate = false;
});

const BASE = { email: "new@example.com", password: "correct-horse-1!" };

describe("createUser with a handle", () => {
  it("writes the user and the reservation together", async () => {
    const user = await createUser({ ...BASE, handle: "LazerWizard" });
    expect(user.handle).toBe("LazerWizard");
    expect(user.handleLower).toBe("lazerwizard");
    const reservation = store.get("handles/lazerwizard");
    expect(reservation).toBeTruthy();
    expect(reservation?.uid).toBe(user.uid);
  });

  it("refuses a handle somebody already holds", async () => {
    store.set("handles/lazerwizard", { uid: "someone-else", display: "x" });
    await expect(
      createUser({ ...BASE, handle: "lazerwizard" })
    ).rejects.toMatchObject({ code: "handle_taken" });
  });

  it("creates NO user when the handle is taken", async () => {
    // The half-write that matters. An account with no handle here is the exact
    // cohort this feature exists to stop creating.
    store.set("handles/lazerwizard", { uid: "someone-else", display: "x" });
    await expect(
      createUser({ ...BASE, handle: "lazerwizard" })
    ).rejects.toBeInstanceOf(UserError);
    const users = Array.from(store.keys()).filter((k) =>
      k.startsWith("users/")
    );
    expect(users).toEqual([]);
  });

  it("reserves NO handle when the user write loses its own race", async () => {
    // The mirror of the case above. If the reservation were committed
    // separately, a failed user create would strand `handles/lazerwizard`
    // pointing at an account that does not exist — permanently unclaimable by
    // anyone, including the person who just failed to sign up.
    failUserCreate = true;
    await expect(
      createUser({ ...BASE, handle: "lazerwizard" })
    ).rejects.toThrow();
    expect(Array.from(store.keys())).toEqual([]);
  });

  it("rejects an invalid handle before touching the database", async () => {
    await expect(
      createUser({ ...BASE, handle: "admin" })
    ).rejects.toMatchObject({ code: "handle_invalid" });
    expect(store.size).toBe(0);
  });

  it("still creates a plain account when no handle is given (Google path)", async () => {
    const user = await createUser(BASE);
    expect(user.handle).toBeUndefined();
    expect(Array.from(store.keys()).some((k) => k.startsWith("handles/"))).toBe(
      false
    );
  });

  it("issues every read before the first write", async () => {
    // The fake throws TxViolation otherwise. This is the bug that shipped in
    // #332's claimHandle: a tx.get placed after tx.create threw on every
    // RENAME while first-time claims kept working.
    await expect(
      createUser({ ...BASE, handle: "freshname" })
    ).resolves.toBeTruthy();
  });
});
