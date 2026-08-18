import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Signup without an email, and attaching one later.
 *
 * The fake enforces the Firestore rules that make `addEmailToUser` correct:
 * a transaction commits all-or-nothing, and no read may follow a write. The
 * uniqueness query runs INSIDE the transaction because two people adding the
 * same address would otherwise both pass a plain pre-check — and two accounts
 * sharing an email means `getUserByEmail` resolves password reset to whichever
 * one the index returns first.
 */

const store = new Map<string, Record<string, unknown>>();

function docsWhere(field: string, value: unknown) {
  return Array.from(store.entries())
    .filter(([k, v]) => k.startsWith("users/") && v[field] === value)
    .map(([k, v]) => ({ id: k.split("/")[1], data: () => v }));
}

function makeDb() {
  const collection = (col: string) => ({
    doc: (id: string) => ({
      path: `${col}/${id}`,
      get: async () => snap(`${col}/${id}`),
      set: async (data: Record<string, unknown>) => {
        store.set(`${col}/${id}`, data);
      },
    }),
    where: (field: string, _op: string, value: unknown) => ({
      __query: { field, value },
      limit: () => ({
        __query: { field, value },
        get: async () => {
          const docs = docsWhere(field, value);
          return { empty: docs.length === 0, docs };
        },
      }),
    }),
  });
  return {
    collection,
    runTransaction: async <T>(fn: (tx: TxLike) => Promise<T>): Promise<T> => {
      const writes: Array<() => void> = [];
      let wrote = false;
      const tx: TxLike = {
        get: async (target: { path?: string; __query?: Query }) => {
          if (wrote) throw new Error("read after write");
          if (target.__query) {
            const docs = docsWhere(target.__query.field, target.__query.value);
            return { empty: docs.length === 0, docs };
          }
          return snap(target.path as string);
        },
        create: (r: { path: string }, data: Record<string, unknown>) => {
          wrote = true;
          writes.push(() => {
            if (store.has(r.path)) throw new Error("ALREADY_EXISTS");
            store.set(r.path, data);
          });
        },
        update: (r: { path: string }, data: Record<string, unknown>) => {
          wrote = true;
          writes.push(() =>
            store.set(r.path, { ...(store.get(r.path) ?? {}), ...data })
          );
        },
      };
      const out = await fn(tx);
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

interface Query {
  field: string;
  value: unknown;
}
interface TxLike {
  get: (t: {
    path?: string;
    __query?: Query;
  }) => Promise<Record<string, unknown>>;
  create: (r: { path: string }, d: Record<string, unknown>) => void;
  update: (r: { path: string }, d: Record<string, unknown>) => void;
}

function snap(path: string) {
  return {
    exists: store.has(path),
    id: path.split("/")[1],
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
vi.mock("../handles", () => ({
  HANDLES: "handles",
  getUidByHandle: async () => null,
}));

import { createUser, addEmailToUser, UserError, toSafe } from "../users";

beforeEach(() => store.clear());

describe("signing up without an email", () => {
  it("creates the account", async () => {
    const user = await createUser({
      password: "correct-horse-1!",
      handle: "lazerwizard",
    });
    expect(user.uid).toBeTruthy();
    expect(user.email).toBeUndefined();
  });

  it("does NOT write an email field at all", async () => {
    // Firestore stores an explicit undefined as a present field, and
    // `where("email","==",null)` would then match every email-less account —
    // one lookup returning somebody else's user.
    await createUser({ password: "correct-horse-1!", handle: "lazerwizard" });
    const doc = Array.from(store.entries()).find(([k]) =>
      k.startsWith("users/")
    )?.[1];
    expect(doc).toBeTruthy();
    expect("email" in (doc as object)).toBe(false);
  });

  it("still refuses a duplicate email when one IS given", async () => {
    await createUser({
      email: "taken@example.com",
      password: "correct-horse-1!",
      handle: "first",
    });
    await expect(
      createUser({
        email: "TAKEN@example.com",
        password: "correct-horse-1!",
        handle: "second",
      })
    ).rejects.toMatchObject({ code: "email_taken" });
  });
});

describe("adding an email afterwards", () => {
  async function makeUser(handle = "lazerwizard") {
    return createUser({ password: "correct-horse-1!", handle });
  }

  it("attaches it", async () => {
    const user = await makeUser();
    const updated = await addEmailToUser(user.uid, "  Me@Example.COM ");
    expect(updated.email).toBe("me@example.com");
  });

  it("refuses an address another account already holds", async () => {
    await createUser({
      email: "taken@example.com",
      password: "correct-horse-1!",
      handle: "first",
    });
    const user = await makeUser("second");
    await expect(
      addEmailToUser(user.uid, "taken@example.com")
    ).rejects.toMatchObject({ code: "email_taken" });
  });

  it("leaves the account untouched when it refuses", async () => {
    await createUser({
      email: "taken@example.com",
      password: "correct-horse-1!",
      handle: "first",
    });
    const user = await makeUser("second");
    await expect(
      addEmailToUser(user.uid, "taken@example.com")
    ).rejects.toBeInstanceOf(UserError);
    expect(store.get(`users/${user.uid}`)?.email).toBeUndefined();
  });

  it("will not silently CHANGE an address that is already set", async () => {
    // Changing an email is account takeover if a session is stolen: attach
    // your own address, then send yourself a reset. Adding is allowed;
    // replacing is not.
    const user = await createUser({
      email: "original@example.com",
      password: "correct-horse-1!",
      handle: "first",
    });
    await expect(
      addEmailToUser(user.uid, "attacker@example.com")
    ).rejects.toMatchObject({ code: "email_already_set" });
    expect(store.get(`users/${user.uid}`)?.email).toBe("original@example.com");
  });

  it("is idempotent for the address already on file", async () => {
    const user = await createUser({
      email: "mine@example.com",
      password: "correct-horse-1!",
      handle: "first",
    });
    await expect(
      addEmailToUser(user.uid, "MINE@example.com")
    ).resolves.toBeTruthy();
  });
});

describe("hasPassword", () => {
  it("is true for a password account and never leaks the hash", async () => {
    const user = await createUser({
      password: "correct-horse-1!",
      handle: "lazerwizard",
    });
    const safe = toSafe(user);
    expect(safe.hasPassword).toBe(true);
    expect("passwordHash" in safe).toBe(false);
  });

  it("is false for an OAuth account", async () => {
    const user = await createUser({
      email: "g@example.com",
      googleId: "g-1",
      handle: "googler",
    });
    expect(toSafe(user).hasPassword).toBe(false);
  });
});
